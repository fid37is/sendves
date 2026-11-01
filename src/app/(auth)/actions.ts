"use server";

import { redirect } from "next/navigation";
import { env, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import type { FormState } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendRecoveryEmail } from "@/server/team";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_CONFIGURED = "Sign-in isn’t set up yet.";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/** Registration: email + password only. The email is used to sign in and to recover the account. */
export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (text(formData, "company")) return { error: "Something went wrong. Please try again." }; // honeypot

  const fullName = text(formData, "fullName");
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (fullName.length < 2) return { error: "Enter your full name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use 8+ characters." };
  if (password !== confirm) return { error: "The passwords don’t match." };
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Creating the account is the acceptance. The timestamp is kept as proof of when.
      data: { full_name: fullName, terms_accepted_at: new Date().toISOString() },
      emailRedirectTo: `${env.siteUrl}/auth/callback?next=/app`,
    },
  });

  if (error) return { error: error.message };
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(text(formData, "next"));

  if (!EMAIL_RE.test(email) || !password) return { error: "Enter email and password." };
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Wrong email or password." };

  // Platform administrators sign in on the admin host only. This door treats their account as unknown.
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profile?.role === "admin") {
      await supabase.auth.signOut();
      return { error: "Wrong email or password." };
    }
  }

  redirect(next);
}

/**
 * Sends a recovery link. Always returns the same message so accounts can’t be guessed.
 *
 * People invited by an organization sign in with a company email that may have no mailbox Sendves can
 * reach, so their link goes to the recovery (personal) email on their account. Everyone else gets the
 * standard link at the email they registered with.
 */
export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };

  const generic: FormState = { success: "Check your email for a link." };

  let recoveryEmail: string | null = null;
  try {
    const { data: profile } = await createAdminClient().from("profiles").select("recovery_email").eq("email", email).maybeSingle();
    recoveryEmail = (profile?.recovery_email as string | null) || null;
  } catch { /* no service key: fall back to the standard flow below */ }

  if (recoveryEmail) {
    try {
      const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email });
      const hashed = data?.properties?.hashed_token;
      if (!error && hashed) {
        const link = `${env.siteUrl}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=/reset-password`;
        await sendRecoveryEmail({ to: recoveryEmail, loginEmail: email, link });
      }
    } catch (err) {
      console.error("[auth] recovery link failed:", (err as Error).message);
    }
    return generic;
  }

  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password` });
  return generic;
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) return { error: "Use 8+ characters." };
  if (password !== confirm) return { error: "The passwords don’t match." };
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/app");
}

export async function signOutAction() {
  if (isSupabaseConfigured) {
    const supabase = createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}