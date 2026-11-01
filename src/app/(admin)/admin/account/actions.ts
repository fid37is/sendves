"use server";

import { createClient as createVerifier } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { adminGo as go } from "@/lib/admin-redirect";
import { requireAdminDb } from "@/lib/auth/admin";
import type { FormState } from "@/lib/auth/types";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/server/audit";

const BACK = "/account";
const MIN_PASSWORD = 12;

export async function updateProfileAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 2) go(BACK, "err", "Enter your name.");
  const { error } = await db.from("profiles").update({ full_name: name }).eq("id", user.id);
  if (error) go(BACK, "err", `Couldn’t save your name: ${error.message}`);
  await recordAudit(db, user, "admin.profile_update", { type: "user", id: user.id });
  revalidatePath("/admin", "layout");
  go(BACK, "ok", "Name saved.");
}

/**
 * Changes the signed-in admin's own password. The current password is checked with a separate, cookie-less
 * client, so the check can't replace the signed-in session (which would drop it back to one factor).
 * On success every other device is signed out.
 */
export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, db } = await requireAdminDb();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!current) return { error: "Enter your current password." };
  if (next.length < MIN_PASSWORD) return { error: `Use ${MIN_PASSWORD} or more characters for an admin password.` };
  if (next !== confirm) return { error: "The new passwords don’t match." };
  if (next === current) return { error: "Choose a password you aren’t using now." };

  const verifier = createVerifier(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: wrong } = await verifier.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) {
    await recordAudit(db, user, "admin.password_change_failed");
    return { error: "Your current password isn’t right." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };
  await supabase.auth.signOut({ scope: "others" });
  await recordAudit(db, user, "admin.password_change");
  return { success: "Password changed. Your other devices were signed out." };
}

export async function signOutOtherDevicesAction() {
  const { user, db } = await requireAdminDb();
  const { error } = await createClient().auth.signOut({ scope: "others" });
  if (error) go(BACK, "err", "Couldn’t sign out your other devices. Try again.");
  await recordAudit(db, user, "admin.sign_out_others");
  go(BACK, "ok", "Signed out everywhere else. This device stays signed in.");
}

/** For a lost or replaced phone: removes the authenticator, signs out, and asks for a new one at the next sign-in. */
export async function resetAuthenticatorAction() {
  const { user, db } = await requireAdminDb();
  const supabase = createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of data?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) go(BACK, "err", `Couldn’t remove the authenticator: ${error.message}`);
  }
  await recordAudit(db, user, "admin.mfa_reset");
  await supabase.auth.signOut();
  go("/login", "info", "Authenticator removed. Sign in again to set up a new one.");
}
