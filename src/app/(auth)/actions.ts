"use server";

import { redirect } from "next/navigation";
import { env, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import type { FormState } from "@/lib/auth/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_CONFIGURED = "Sign-in isn’t connected yet. Add your Supabase keys to .env.local and restart the app.";

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
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  if (password !== confirm) return { error: "The passwords don’t match." };
  if (formData.get("terms") !== "on") return { error: "Accept the terms of service to continue." };
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
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

  if (!EMAIL_RE.test(email) || !password) return { error: "Enter your email and password." };
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password don’t match. Check them and try again." };

  redirect(next);
}

/** Sends a recovery link. Always returns the same message so accounts can’t be guessed. */
export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };

  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password` });

  return { success: "If an account exists for that email, a recovery link is on its way. Check your inbox." };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
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
