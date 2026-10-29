"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/server/audit";
import type { FormState } from "@/lib/auth/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// One message for every failure, so the form never reveals whether an address belongs to an admin.
const DENIED = "That email and password don’t match an administrator account.";

export type EnrollState = FormState & { factorId?: string; qr?: string; secret?: string };

export async function adminSignInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!EMAIL_RE.test(email) || !password) return { error: "Enter your email and password." };
  if (!isSupabaseConfigured) return { error: "Sign-in isn’t connected yet. Add your Supabase keys and restart the app." };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: DENIED };

  const db = createAdminClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profile?.role !== "admin") {
    await supabase.auth.signOut();
    await recordAudit(db, { id: data.user.id, email }, "admin.login_denied");
    return { error: DENIED };
  }

  await recordAudit(db, { id: data.user.id, email }, "admin.login");
  redirect(serverEnv.admin.requireMfa ? "/mfa" : "/");
}

/** Creates a fresh TOTP factor and returns its QR code. Any half-finished enrolment is discarded first. */
export async function startEnrollAction(): Promise<EnrollState> {
  const supabase = createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/login");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Sendves admin ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: "Couldn’t start two-factor setup. Please try again." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyMfaAction(_prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!factorId || !/^\d{6}$/.test(code)) return { ..._prev, error: "Enter the 6-digit code from your authenticator app." };

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr || !challenge) return { ..._prev, error: "Couldn’t start verification. Please try again." };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) {
    await recordAudit(createAdminClient(), { id: auth.user.id, email: auth.user.email }, "admin.mfa_failed");
    return { ..._prev, error: "That code didn’t work. Check the time on your device and try the newest code." };
  }

  await recordAudit(createAdminClient(), { id: auth.user.id, email: auth.user.email }, "admin.mfa_passed");
  redirect("/");
}

export async function adminSignOutAction() {
  if (isSupabaseConfigured) {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) await recordAudit(createAdminClient(), { id: data.user.id, email: data.user.email }, "admin.logout");
    await supabase.auth.signOut();
  }
  redirect("/login");
}
