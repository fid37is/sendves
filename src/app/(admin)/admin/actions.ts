"use server";

import { revalidatePath } from "next/cache";
import { adminGo as go } from "@/lib/admin-redirect";
import { requireAdminDb } from "@/lib/auth/admin";
import { limitsFor } from "@/config/plan-limits";
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

const DETAIL_TABS = ["overview", "people", "campaigns", "sending", "activity", "limits"];

/** Where to return to after a workspace action: the list, or one workspace's page (on the tab the form was on). */
const workspaceBack = (formData: FormData, wid: string) => {
  if (String(formData.get("back") ?? "") !== "detail" || !wid) return "/workspaces";
  const tab = String(formData.get("tab") ?? "");
  return DETAIL_TABS.includes(tab) && tab !== "overview" ? `/workspaces/${wid}?tab=${tab}` : `/workspaces/${wid}`;
};

export async function setWorkspaceStatusAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const wid = id(formData);
  const back = workspaceBack(formData, wid);
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!wid || !["suspended", "active", "review"].includes(status)) go(back, "err", "That request was invalid. Reload the page and try again.");
  const { data, error } = await db.from("workspaces").update({ status }).eq("id", wid).select("name").maybeSingle();
  if (error || !data) go(back, "err", error?.message ? `Couldn’t change the status: ${error.message}` : "That workspace no longer exists.");
  const action = status === "suspended" ? "workspace.suspend" : status === "review" ? "workspace.review" : "workspace.reinstate";
  await recordAudit(db, user, action, { type: "workspace", id: wid }, reason ? { reason } : undefined);
  revalidatePath("/admin", "layout");
  if (status === "suspended") go(back, "warn", `${data.name} suspended. Sending has stopped.`);
  if (status === "review") go(back, "info", `${data.name} moved to review. New campaigns wait for approval.`);
  go(back, "ok", `${data.name} reinstated.`);
}

/**
 * Manual override of a workspace's plan and limits.
 *
 * Normally the plan comes from a subscription: the billing webhook sets `plan` and the limits when a payment
 * succeeds, and resets them to Free when it is cancelled. This form writes the same columns directly, for
 * support cases (a comped account, a negotiated limit, correcting a mistake). It does not create or cancel a
 * subscription, so a later billing event for the workspace can overwrite what is set here.
 */
export async function updateWorkspaceLimitsAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const wid = id(formData);
  const back = workspaceBack(formData, wid);
  if (!wid) go(back, "err", "That request was invalid. Reload the page and try again.");
  const plan = String(formData.get("plan") ?? "");
  if (!["free", "starter", "growth", "scale"].includes(plan)) go(back, "err", "Pick a valid plan.");

  // Either the plan's own defaults, or the numbers typed in. Never silently adjusted: out-of-range input is an error.
  const reset = formData.get("reset") === "on";
  const defaults = limitsFor(plan);
  const whole = (k: string, max: number) => {
    const raw = String(formData.get(k) ?? "").trim();
    const v = Number(raw);
    return raw !== "" && Number.isInteger(v) && v >= 1 && v <= max ? v : null;
  };
  const daily = reset ? defaults.startDaily : whole("daily", 1_000_000);
  const contacts = reset ? defaults.contacts : whole("contacts", 10_000_000);
  if (daily === null || contacts === null) go(back, "err", "Enter whole numbers: daily send limit 1 to 1,000,000 and contact limit 1 to 10,000,000.");

  const { data: before } = await db.from("workspaces").select("plan, daily_send_limit, max_contacts, billing_provider, billing_ref").eq("id", wid).maybeSingle();
  if (!before) go(back, "err", "That workspace no longer exists.");
  const { error } = await db.from("workspaces").update({ plan, daily_send_limit: daily, max_contacts: contacts }).eq("id", wid);
  if (error) go(back, "err", `Couldn’t save the limits: ${error.message}`);
  await recordAudit(db, user, "workspace.limits", { type: "workspace", id: wid }, {
    plan, daily, contacts, reset,
    was: { plan: before.plan, daily: before.daily_send_limit, contacts: before.max_contacts },
    subscribed: Boolean(before.billing_ref),
  });
  revalidatePath("/admin", "layout");
  go(back, "ok", reset ? `Plan set to ${plan} with its default limits.` : "Plan and limits saved.");
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

export async function savePlatformSettingsAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const problems: string[] = [];
  const num = (k: string, label: string, min: number, max: number, whole = false) => {
    const raw = String(formData.get(k) ?? "").trim();
    const v = Number(raw);
    if (raw === "" || !Number.isFinite(v) || v < min || v > max || (whole && !Number.isInteger(v))) {
      problems.push(`${label} must be ${whole ? "a whole number " : "a number "}from ${min} to ${max}`);
      return min;
    }
    return v;
  };
  const on = (k: string) => formData.get(k) === "on";

  const next = {
    pause_bounce_pct: num("bounce", "Bounce pause rate", 0.1, 50),
    pause_complaint_pct: num("complaint", "Complaint pause rate", 0.01, 10),
    suspend_complaint_pct: num("suspend", "Complaint suspension rate", 0.01, 10),
    health_min_sample: num("sample", "Minimum sends", 1, 100000, true),
    health_window_hours: num("window", "Check window (hours)", 1, 720, true),
    new_workspace_daily_limit: num("daily", "New workspace daily limit", 1, 100000, true),
    new_workspace_max_contacts: num("max", "New workspace contact limit", 1, 1000000, true),
    review_new_workspaces: on("review"),
    signups_open: on("signups"),
    sending_paused: on("paused"),
  };
  if (!problems.length && next.suspend_complaint_pct < next.pause_complaint_pct) problems.push("The suspension rate can’t be lower than the pause rate");
  if (problems.length) go("/settings", "err", `${problems[0]}.`);

  const { data: before } = await db.from("platform_settings").select("*").eq("id", 1).maybeSingle();
  const { error } = await db.from("platform_settings").upsert({ id: 1, ...next });
  if (error) go("/settings", "err", `Couldn’t save the settings: ${error.message}`);

  const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => !before || (before as Record<string, unknown>)[k] !== v));
  await recordAudit(db, user, "settings.update", { type: "platform_settings", id: "1" }, changed);
  if (before && (before as { sending_paused?: boolean }).sending_paused !== next.sending_paused) {
    await recordAudit(db, user, next.sending_paused ? "sending.pause_all" : "sending.resume_all", { type: "platform_settings", id: "1" });
  }
  revalidatePath("/admin", "layout");
  if (next.sending_paused) go("/settings", "warn", "Settings saved. All sending is paused until you switch it back on.");
  go("/settings", "ok", "Settings saved. The worker uses them on its next pass.");
}
