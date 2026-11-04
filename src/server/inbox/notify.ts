import "server-only";
import { serverEnv } from "@/lib/env.server";
import { escapeHtml } from "@/lib/email/blocks";
import type { Db } from "@/lib/supabase/admin";
import { getProvider } from "@/server/sending/providers";
import { snippetOf } from "./text";

/** One email per conversation per quarter of an hour, however many replies arrive in between. */
const QUIET_MS = 15 * 60 * 1000;

/**
 * Tells the person a reply is for (whoever it is assigned to, otherwise the owner of the address) that someone
 * wrote back. Best effort: it never stops a reply being stored, and it does nothing when the platform has no
 * address to send from (PLATFORM_FROM_EMAIL) or the person turned it off in Settings.
 */
export async function notifyNewReply(
  db: Db,
  conversation: { id: string; subject: string | null; contact_name: string | null; contact_email: string; owner_id: string | null; assigned_to: string | null; notified_at?: string | null },
  text: string,
): Promise<void> {
  try {
    if (!serverEnv.platformFrom) return;
    const userId = conversation.assigned_to ?? conversation.owner_id;
    if (!userId) return;
    if (conversation.notified_at && Date.now() - new Date(conversation.notified_at).getTime() < QUIET_MS) return;

    const { data: profile, error } = await db.from("profiles").select("email, full_name, notify_inbox_replies").eq("id", userId).maybeSingle();
    if (error || !profile?.email || profile.notify_inbox_replies === false) return;

    const who = conversation.contact_name || conversation.contact_email;
    const link = `${serverEnv.appUrl}/app/inbox?c=${conversation.id}`;
    const subject = `${who} replied: ${(conversation.subject || "(no subject)").slice(0, 80)}`;
    const preview = snippetOf(text, 240);
    const html =
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0F172A;">` +
      `<p style="margin:0 0 12px;font-size:16px;"><strong>${escapeHtml(who)}</strong> replied to “${escapeHtml(conversation.subject || "(no subject)")}”.</p>` +
      (preview ? `<p style="margin:0 0 20px;padding:12px 16px;background:#F1F5F9;border-radius:12px;color:#334155;">${escapeHtml(preview)}</p>` : "") +
      `<p style="margin:0 0 24px;"><a href="${link}" style="background:#164E63;color:#fff;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;">Open the conversation</a></p>` +
      `<p style="margin:0;font-size:12px;color:#64748B;">You get this because a conversation is yours or assigned to you. You can turn it off under Settings, Your account.</p></div>`;
    const plain = `${who} replied to "${conversation.subject || "(no subject)"}".\n\n${preview}\n\nOpen the conversation: ${link}\n\nYou can turn these emails off under Settings, Your account.`;

    await getProvider().send({ from: serverEnv.platformFrom, to: profile.email, subject, html, text: plain, headers: {} });
    await db.from("conversations").update({ notified_at: new Date().toISOString() }).eq("id", conversation.id);
  } catch (err) {
    console.error("[inbox notify]", (err as Error).message);
  }
}
