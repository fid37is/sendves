"use server";

import { revalidatePath } from "next/cache";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { flash, go } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import { sendAdminInviteEmail } from "@/server/team";
import { requireAdminDb } from "@/lib/auth/admin";
import { recordAudit } from "@/server/audit";

const UUID = /^[0-9a-f-]{36}$/i;
const id = (f: FormData) => {
  const v = String(f.get("id") ?? "");
  return UUID.test(v) ? v : "";
};

export async function approveCampaignAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const cid = id(formData);
  const { data: c } = cid ? await db.from("campaigns").select("id, workspace_id").eq("id", cid).eq("review_status", "pending").maybeSingle() : { data: null };
  if (!c) go("/review", "err", "That campaign isn’t waiting for review.");
  await db.from("campaigns").update({ review_status: "approved" }).eq("id", c.id);
  // A first approved campaign graduates the workspace out of review.
  await db.from("workspaces").update({ status: "active" }).eq("id", c.workspace_id).eq("status", "review");
  await recordAudit(db, user, "campaign.approve", { type: "campaign", id: c.id }, { workspace: c.workspace_id });
  revalidatePath("/admin", "layout");
  go("/review", "ok", "Approved. The worker will start sending it.");
}

export async function rejectCampaignAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const cid = id(formData);
  if (!cid) go("/review", "err", "That campaign isn’t waiting for review.");
  const { data } = await db.from("campaigns").update({ review_status: "rejected", status: "cancelled" }).eq("id", cid).eq("review_status", "pending").select("id");
  if (data?.length) await recordAudit(db, user, "campaign.reject", { type: "campaign", id: cid });
  revalidatePath("/admin", "layout");
  go("/review", data?.length ? "ok" : "err", data?.length ? "Campaign rejected and cancelled." : "That campaign isn’t waiting for review.");
}

type Kind = "ok" | "err" | "warn" | "info";
const FLASH_KIND = { ok: "success", err: "error", warn: "warning", info: "info" } as const;

/**
 * Ends an action with a toast. On a workspace's own page it stays there (no redirect: the page just
 * refreshes with the new data), because redirecting to a dynamic admin path is what produced a 404.
 * From a list it redirects back to that list.
 */
function finish(formData: FormData, list: string, kind: Kind, message: string): void {
  if (String(formData.get("back") ?? "") === "detail") {
    flash(FLASH_KIND[kind], message);
    revalidatePath("/admin", "layout");
    return;
  }
  go(list, kind, message);
}

export async function setWorkspaceStatusAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const wid = id(formData);
  const status = String(formData.get("status") ?? "");
  if (!wid || !["suspended", "active", "review"].includes(status)) return finish(formData, "/workspaces", "err", "That request was invalid. Reload the page and try again.");
  const { data: before } = await db.from("workspaces").select("name, status").eq("id", wid).maybeSingle();
  if (!before) return finish(formData, "/workspaces", "err", "That workspace no longer exists.");
  const { error } = await db.from("workspaces").update({ status }).eq("id", wid);
  if (error) return finish(formData, "/workspaces", "err", `Couldn’t change the status: ${error.message}`);
  const action = status === "suspended" ? "workspace.suspend" : status === "review" ? "workspace.review" : before.status === "review" ? "workspace.approve" : "workspace.reinstate";
  await recordAudit(db, user, action, { type: "workspace", id: wid }, { from: before.status, to: status });
  revalidatePath("/admin", "layout");
  if (status === "suspended") return finish(formData, "/workspaces", "warn", `${before.name} suspended. Sending has stopped.`);
  if (status === "review") return finish(formData, "/workspaces", "info", `${before.name} moved to review. New campaigns wait for approval.`);
  return finish(formData, "/workspaces", "ok", before.status === "review" ? `${before.name} approved. Its campaigns send without review.` : `${before.name} reinstated.`);
}

/**
 * Limit overrides only. The plan itself comes from the customer's subscription (billing webhooks set
 * it), so admins can't grant or change it here; an override lasts until the subscription changes.
 */
export async function updateWorkspaceLimitsAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const wid = id(formData);
  if (!wid) return finish(formData, "/workspaces", "err", "That request was invalid. Reload the page and try again.");
  const whole = (k: string, min: number, max: number) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : NaN;
  };
  const daily = whole("daily", 1, 1_000_000);
  const contacts = whole("contacts", 1, 10_000_000);
  if (Number.isNaN(daily) || Number.isNaN(contacts)) return finish(formData, "/workspaces", "err", "Enter whole numbers for the daily send limit and contact limit.");
  const { error } = await db.from("workspaces").update({ daily_send_limit: daily, max_contacts: contacts }).eq("id", wid);
  if (error) return finish(formData, "/workspaces", "err", `Couldn’t save the limits: ${error.message}`);
  await recordAudit(db, user, "workspace.limits", { type: "workspace", id: wid }, { daily, contacts });
  return finish(formData, "/workspaces", "ok", "Limits saved.");
}

export async function resolveAbuseAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const rid = id(formData);
  if (!rid) go("/abuse", "err", "Invalid request.");
  await db.from("abuse_reports").update({ status: "resolved" }).eq("id", rid);
  await recordAudit(db, user, "abuse.resolve", { type: "abuse_report", id: rid });
  revalidatePath("/admin", "layout");
  go("/abuse", "ok", "Marked as resolved.");
}

const settingsDone = (kind: Kind, message: string): void => {
  flash(FLASH_KIND[kind], message);
  revalidatePath("/admin", "layout");
};

/** Saves one section of the settings page; the other sections' values are never touched. */
export async function savePlatformSettingsAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const section = String(formData.get("section") ?? "");
  const num = (k: string, min: number, max: number, dflt: number) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && String(formData.get(k) ?? "").trim() !== "" ? Math.min(max, Math.max(min, v)) : dflt;
  };
  const on = (k: string) => formData.get(k) === "on";
  let next: Record<string, unknown>;

  if (section === "enforcement") {
    next = {
      pause_bounce_pct: num("bounce", 0.1, 50, 5),
      pause_complaint_pct: num("complaint", 0.01, 10, 0.3),
      suspend_complaint_pct: num("suspend", 0.01, 10, 0.5),
      health_min_sample: Math.round(num("minSample", 5, 10000, 50)),
      window_days: Math.round(num("windowDays", 1, 30, 7)),
      sending_paused: on("sendingPaused"),
    };
    if ((next.suspend_complaint_pct as number) < (next.pause_complaint_pct as number)) return settingsDone("err", "The suspension threshold can’t be lower than the pause threshold.");
  } else if (section === "signups") {
    const domains = String(formData.get("blocked") ?? "").split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
    const bad = domains.find((d) => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d));
    if (bad) return settingsDone("err", `“${bad.slice(0, 60)}” isn’t a valid domain. Use names like mailinator.com, separated by commas or new lines.`);
    next = {
      registrations_open: on("registrationsOpen"),
      require_review: on("requireReview"),
      blocked_email_domains: Array.from(new Set(domains)).slice(0, 500),
      new_workspace_daily_limit: Math.round(num("daily", 1, 100000, 200)),
      new_workspace_max_contacts: Math.round(num("max", 1, 1000000, 500)),
    };
  } else {
    return settingsDone("err", "That request was invalid. Reload the page and try again.");
  }

  const { data: before } = await db.from("platform_settings").select("*").eq("id", 1).maybeSingle();
  const { error } = await db.from("platform_settings").upsert({ id: 1, ...next });
  if (error) return settingsDone("err", `Couldn’t save the settings: ${error.message}`);

  // The audit entry records only what changed (old → new), and nothing at all for a save that changed nothing.
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(next)) {
    const from = (before as Record<string, unknown> | null)?.[key];
    if (JSON.stringify(from ?? null) !== JSON.stringify(to)) changes[key] = { from: from ?? null, to };
  }
  if (Object.keys(changes).length) await recordAudit(db, user, `settings.${section}`, { type: "platform_settings", id: "1" }, { changes });
  revalidatePath("/admin", "layout");
  return settingsDone("ok", section === "enforcement" ? "Enforcement settings saved. The worker uses them from its next pass." : "Sign-up settings saved.");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a platform admin. Admins are staff with their own account: it never gets a workspace, and an
 * existing customer's email can't be turned into one. The new admin sets their own password from the
 * emailed link and then enrols two-factor on first sign-in.
 */
export async function addAdminAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (name.length < 2) return settingsDone("err", "Enter the new admin’s full name.");
  if (!EMAIL_RE.test(email)) return settingsDone("err", "Enter a valid email address.");

  const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return settingsDone("err", "That email already has an account. Admins need their own separate account, so use a different email.");

  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name, invited: "true" } });
  if (error || !created?.user) return settingsDone("err", `Couldn’t create the account: ${error?.message ?? "unknown error"}`);
  const { error: roleError } = await db.from("profiles").update({ role: "admin", full_name: name }).eq("id", created.user.id);
  if (roleError) {
    await db.auth.admin.deleteUser(created.user.id);
    return settingsDone("err", `Couldn’t make them an admin: ${roleError.message}`);
  }
  await recordAudit(db, user, "admin.add", { type: "user", id: created.user.id }, { email });

  let sent = false;
  try {
    const { data: link } = await db.auth.admin.generateLink({ type: "recovery", email });
    const hashed = link?.properties?.hashed_token;
    if (hashed) sent = await sendAdminInviteEmail({ to: email, name, invitedBy: user.email ?? "an administrator", link: `${env.siteUrl}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=/reset-password` });
  } catch (err) {
    console.error("[admin] invite email failed:", (err as Error).message);
  }
  return settingsDone(sent ? "ok" : "warn", sent ? `${name} added. They’ve been emailed a link to set their password.` : `${name} added, but the email didn’t send. Ask them to use “Forgot password” to set a password.`);
}

/** Removes console access. The account stays but can no longer open the console (the role is checked on every request). */
export async function removeAdminAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const target = id(formData);
  if (!target) return settingsDone("err", "That request was invalid. Reload the page and try again.");
  if (target === user.id) return settingsDone("err", "You can’t remove your own admin access. Ask another admin to do it.");
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if ((count ?? 0) <= 1) return settingsDone("err", "There must always be at least one admin.");
  const { data, error } = await db.from("profiles").update({ role: "user" }).eq("id", target).eq("role", "admin").select("email").maybeSingle();
  if (error || !data) return settingsDone("err", error ? `Couldn’t remove access: ${error.message}` : "That person isn’t an admin.");
  await recordAudit(db, user, "admin.remove", { type: "user", id: target }, { email: data.email });
  return settingsDone("ok", `${data.email} can no longer open the console.`);
}

/** Changes the signed-in admin's own password after checking the current one. */
export async function changeOwnPasswordAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!current || !next) return settingsDone("err", "Enter your current password and a new one.");
  if (next.length < 12) return settingsDone("err", "Use at least 12 characters for an admin password.");
  if (next !== confirm) return settingsDone("err", "The new passwords don’t match.");
  if (next === current) return settingsDone("err", "Choose a password you haven’t used here before.");

  // Check the current password on a throwaway client so it doesn't replace this session (which would drop its 2FA level).
  const probe = createJsClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await probe.auth.signInWithPassword({ email: user.email ?? "", password: current });
  if (wrong) return settingsDone("err", "Your current password is wrong.");

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return settingsDone("err", error.message);
  await supabase.auth.signOut({ scope: "others" });
  await recordAudit(db, user, "admin.password_change", { type: "user", id: user.id });
  return settingsDone("ok", "Password changed. Your other sessions were signed out.");
}

/** Signs this admin out everywhere except the current browser. */
export async function signOutOtherSessionsAction() {
  const { user, db } = await requireAdminDb();
  const { error } = await createClient().auth.signOut({ scope: "others" });
  if (error) return settingsDone("err", `Couldn’t sign out other sessions: ${error.message}`);
  await recordAudit(db, user, "admin.signout_others", { type: "user", id: user.id });
  return settingsDone("ok", "Signed out of all other sessions.");
}
