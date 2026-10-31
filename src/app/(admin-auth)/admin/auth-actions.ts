"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/server/audit";
import type { FormState } from "@/lib/auth/types";
import { flash } from "@/lib/flash";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// One message for every failure, so the form never reveals whether an address belongs to an admin.
const DENIED = "Wrong email or password.";

export type EnrollState = FormState & { factorId?: string; qr?: string; secret?: string };

export async function adminSignInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!EMAIL_RE.test(email) || !password) return { error: "Enter email and password." };
  if (!isSupabaseConfigured) return { error: "Sign-in isn’t set up yet." };

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
  flash("success", "Signed in");
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
  if (error || !data) return { error: "Couldn’t start setup." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyMfaAction(_prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!factorId || !/^\d{6}$/.test(code)) return { ..._prev, error: "Enter the 6-digit code." };

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr || !challenge) return { ..._prev, error: "Couldn’t verify. Try again." };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) {
    await recordAudit(createAdminClient(), { id: auth.user.id, email: auth.user.email }, "admin.mfa_failed");
    return { ..._prev, error: "Wrong code." };
  }

  await recordAudit(createAdminClient(), { id: auth.user.id, email: auth.user.email }, "admin.mfa_passed");
  flash("success", "Verified");
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
