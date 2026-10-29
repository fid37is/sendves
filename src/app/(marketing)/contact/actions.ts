"use server";

import type { FormState } from "@/lib/auth/types";

export async function contactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const honeypot = String(formData.get("website") ?? "");

  if (honeypot) return { success: "Thanks, your message is on its way." };
  if (!name || !email || !message) return { error: "Please fill in your name, email and message." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };

  // TODO: store in Supabase (table: contact_messages) and notify the support inbox.
  return { success: "Thanks, your message is on its way. We usually reply within one business day." };
}
