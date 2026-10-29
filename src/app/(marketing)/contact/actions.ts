// src/app/(marketing)/contact/actions.ts
"use server";

import { env } from "@/lib/env";
import { escapeHtml } from "@/lib/email/blocks";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkEmail } from "@/lib/validation/email";
import type { FormState } from "@/lib/auth/types";
import { getProvider } from "@/server/sending/providers";

const TOPICS: Record<string, string> = {
  general: "General question",
  sales: "Pricing and plans",
  support: "Account support",
  abuse: "Abuse report",
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function contactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (text(formData, "website")) return { success: "Thanks. We’ll get back to you soon." }; // honeypot: look successful, do nothing

  const name = text(formData, "name").replace(/\s+/g, " ").slice(0, 100);
  const topic = text(formData, "topic");
  const message = text(formData, "message");
  const check = checkEmail(text(formData, "email"));

  if (name.length < 2) return { error: "Enter your name." };
  if (!check.ok) return { error: "Enter a valid email address." };
  if (!(topic in TOPICS)) return { error: "Choose a topic." };
  if (message.length < 10) return { error: "Write a little more so we can help." };
  if (message.length > 5000) return { error: "Keep your message under 5,000 characters." };

  const topicLabel = TOPICS[topic];
  let delivered = false;

  // Abuse reports also land in the admin console's abuse queue.
  if (topic === "abuse") {
    try {
      const { error } = await createAdminClient().from("abuse_reports").insert({ reporter: check.email, reason: message.slice(0, 2000) });
      if (!error) delivered = true;
      else console.error("[contact] abuse report insert failed:", error.message);
    } catch (err) {
      console.error("[contact] abuse report insert failed:", (err as Error).message);
    }
  }

  try {
    const host = env.rootDomain.split(":")[0];
    await getProvider().send({
      from: `Sendves <no-reply@${host}>`,
      to: env.supportEmail,
      subject: `[Contact] ${topicLabel} from ${name.replace(/[\r\n]/g, " ")}`,
      text: `Topic: ${topicLabel}\nName: ${name}\nEmail: ${check.email}\n\n${message}`,
      html: `<p><strong>Topic:</strong> ${escapeHtml(topicLabel)}<br><strong>Name:</strong> ${escapeHtml(name)}<br><strong>Email:</strong> ${escapeHtml(check.email)}</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
      headers: { "Reply-To": check.email },
    });
    delivered = true;
  } catch (err) {
    console.error("[contact] send failed:", (err as Error).message);
  }

  if (!delivered) return { error: `We couldn’t send your message. Please email us at ${env.supportEmail}.` };
  return { success: "Thanks. We’ve got your message and will reply by email." };
}