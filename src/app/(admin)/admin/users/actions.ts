"use server";

import { revalidatePath } from "next/cache";
import { adminGo as go } from "@/lib/admin-redirect";
import { requireAdminDb } from "@/lib/auth/admin";
import { env } from "@/lib/env";
import { recordAudit } from "@/server/audit";
import { sendRecoveryEmail } from "@/server/team";

const UUID = /^[0-9a-f-]{36}$/i;
// About a hundred years: Supabase has no "forever", and "none" lifts the ban.
const DISABLED = "876000h";

/** Loads a customer account for an action. Admin accounts are managed on the Admins page, never from here. */
async function customer(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const uid = String(formData.get("id") ?? "");
  const back = UUID.test(uid) ? `/users/${uid}` : "/users";
  if (!UUID.test(uid)) go(back, "err", "That request was invalid. Reload the page and try again.");
  const { data: p } = await db.from("profiles").select("id, email, full_name, role, recovery_email").eq("id", uid).maybeSingle();
  if (!p) go("/users", "err", "That account no longer exists.");
  if (p.role === "admin") go(back, "err", "Platform admins are managed on the Admins page.");
  return { user, db, p, back };
}

/** Emails the person a link to choose a new password (to their recovery address when they have one). */
export async function sendPasswordResetAction(formData: FormData) {
  const { user, db, p, back } = await customer(formData);
  const login = String(p.email ?? "");
  if (!login) go(back, "err", "This account has no email address.");
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email: login });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) go(back, "err", "Couldn’t create a reset link for this account.");
  const link = `${env.siteUrl}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=/reset-password`;
  const sent = await sendRecoveryEmail({ to: (p.recovery_email as string | null) || login, loginEmail: login, link });
  if (!sent) go(back, "err", "The email couldn’t be sent. Check that PLATFORM_FROM_EMAIL is set up.");
  await recordAudit(db, user, "user.password_reset_sent", { type: "user", id: p.id as string });
  go(back, "ok", `Password reset email sent for ${login}.`);
}

/** Blocks or restores sign-in. Their data and workspaces are untouched. */
export async function setUserDisabledAction(formData: FormData) {
  const { user, db, p, back } = await customer(formData);
  const disable = String(formData.get("disable") ?? "") === "1";
  if (p.id === user.id) go(back, "err", "You can’t disable your own account.");
  const { error } = await db.auth.admin.updateUserById(p.id as string, { ban_duration: disable ? DISABLED : "none" });
  if (error) go(back, "err", `Couldn’t update the account: ${error.message}`);
  await recordAudit(db, user, disable ? "user.disable" : "user.enable", { type: "user", id: p.id as string });
  revalidatePath("/admin", "layout");
  go(back, disable ? "warn" : "ok", disable ? "Sign-in disabled. They can’t log in until you enable it again." : "Sign-in enabled.");
}
