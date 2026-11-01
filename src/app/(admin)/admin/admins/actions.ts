"use server";

import { revalidatePath } from "next/cache";
import { adminGo as go } from "@/lib/admin-redirect";
import { requireAdminDb } from "@/lib/auth/admin";
import { env } from "@/lib/env";
import type { Db } from "@/lib/supabase/admin";
import { recordAudit } from "@/server/audit";
import { sendAdminInviteEmail } from "@/server/team";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f-]{36}$/i;
const DISABLED = "876000h";
const BACK = "/admins";

/** A one-time link to choose a password, emailed to the new admin. */
async function sendSetupLink(db: Db, email: string, name: string, inviter: string): Promise<boolean> {
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) return false;
  const link = `${env.siteUrl}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=/reset-password`;
  return sendAdminInviteEmail({ to: email, name, inviter, link });
}

/**
 * Gives someone access to the console.
 *  - A new email gets a fresh account (no workspace, email already trusted) and a setup link.
 *  - An existing account with no workspaces can be promoted.
 *  - An existing customer account is refused: customers sign in on the main site, admins on this host, and an
 *    account can't be both, so promoting one would lock the customer out of their own workspace.
 * Everyone passes two-factor sign-in the first time they use the console.
 */
export async function addAdminAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!EMAIL_RE.test(email)) go(BACK, "err", "Enter a valid email address.");

  const { data: existing } = await db.from("profiles").select("id, role").eq("email", email).maybeSingle();
  if (existing) {
    if (existing.role === "admin") go(BACK, "err", "That person is already a platform admin.");
    const { count } = await db.from("workspace_members").select("workspace_id", { count: "exact", head: true }).eq("user_id", existing.id);
    if (count) go(BACK, "err", "That email belongs to a customer account. Admin access needs its own account: use a different email address.");
    const { error } = await db.from("profiles").update({ role: "admin" }).eq("id", existing.id);
    if (error) go(BACK, "err", `Couldn’t make them an admin: ${error.message}`);
    await recordAudit(db, user, "admin.add", { type: "user", id: existing.id as string }, { email, mode: "promoted" });
    revalidatePath("/admin", "layout");
    go(BACK, "ok", `${email} is now a platform admin. They sign in on this console and set up two-factor on first use.`);
  }

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    // `invited` keeps the sign-up trigger from giving them a customer workspace.
    user_metadata: { full_name: name, invited: "true" },
  });
  if (createError || !created?.user) go(BACK, "err", createError?.message ? `Couldn’t create the account: ${createError.message}` : "Couldn’t create the account.");
  const { data: promoted, error: roleError } = await db.from("profiles").update({ role: "admin", ...(name ? { full_name: name } : {}) }).eq("id", created.user.id).select("id");
  if (roleError || !promoted?.length) {
    await db.auth.admin.deleteUser(created.user.id); // don't leave a half-made account behind
    go(BACK, "err", "Couldn’t finish setting up the admin account. Nothing was created.");
  }
  await recordAudit(db, user, "admin.add", { type: "user", id: created.user.id }, { email, mode: "created" });

  const sent = await sendSetupLink(db, email, name, user.fullName || user.email);
  revalidatePath("/admin", "layout");
  if (sent) go(BACK, "ok", `Admin account created. A setup link was emailed to ${email}.`);
  go(BACK, "warn", `Admin account created, but the setup email couldn’t be sent (check PLATFORM_FROM_EMAIL). Use “Send setup link” once email works, or have them use Forgot password on the main site.`);
}

/** Sends a fresh setup / reset link to another admin (the first one expires quickly). */
export async function resendSetupLinkAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const uid = String(formData.get("id") ?? "");
  if (!UUID.test(uid)) go(BACK, "err", "That request was invalid. Reload the page and try again.");
  const { data: p } = await db.from("profiles").select("id, email, full_name, role").eq("id", uid).maybeSingle();
  if (!p || p.role !== "admin" || !p.email) go(BACK, "err", "That admin no longer exists.");
  const sent = await sendSetupLink(db, p.email as string, (p.full_name as string) || "", user.fullName || user.email);
  if (!sent) go(BACK, "err", "The email couldn’t be sent. Check that PLATFORM_FROM_EMAIL is set up.");
  await recordAudit(db, user, "admin.setup_link_sent", { type: "user", id: p.id as string });
  go(BACK, "ok", `A new setup link was emailed to ${p.email}.`);
}

/**
 * Takes console access away. These accounts exist for the console only, so sign-in is switched off as well:
 * a former admin is not left with a working customer login they never asked for. You can't remove yourself,
 * and the last admin can't be removed, so the console can't lock everyone out.
 */
export async function removeAdminAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const uid = String(formData.get("id") ?? "");
  if (!UUID.test(uid)) go(BACK, "err", "That request was invalid. Reload the page and try again.");
  if (uid === user.id) go(BACK, "err", "You can’t remove your own admin access. Ask another admin to do it.");
  const { data: p } = await db.from("profiles").select("id, email, role").eq("id", uid).maybeSingle();
  if (!p || p.role !== "admin") go(BACK, "err", "That person isn’t a platform admin.");
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if ((count ?? 0) <= 1) go(BACK, "err", "That’s the last platform admin, so it can’t be removed.");

  const { error } = await db.from("profiles").update({ role: "user" }).eq("id", uid);
  if (error) go(BACK, "err", `Couldn’t remove them: ${error.message}`);
  await db.auth.admin.updateUserById(uid, { ban_duration: DISABLED });
  await recordAudit(db, user, "admin.remove", { type: "user", id: uid }, { email: p.email });
  revalidatePath("/admin", "layout");
  go(BACK, "warn", `${p.email} no longer has admin access and can’t sign in.`);
}
