import type { Db } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { checkFile } from "@/lib/file-check";
import { checkAttachmentSet, MAX_EXTRA_RECIPIENTS, toImportance, type Importance } from "@/lib/inbox";
import { unsubscribeToken } from "@/lib/tokens";
import { loadSettings } from "@/server/abuse";
import { INBOX_UNSUBSCRIBE_PREFIX } from "@/server/compliance";
import { checkSender } from "@/server/senders";
import { getProvider, PermanentSendError } from "@/server/sending/providers";
import { removeAttachments, safeFileName, storeAttachment } from "./attachments";
import { replyAddress } from "./address";
import { escapeHtml, snippetOf, textToHtml } from "./text";

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Emails a workspace sent today: campaign sends plus single emails written in the inbox. Both draw on the same
 * daily limit, so writing one by one can't be used to get around it.
 */
export async function sentToday(db: Db, workspaceId: string): Promise<number> {
  const since = startOfUtcDay().toISOString();
  const [campaign, single] = await Promise.all([
    db.from("sends").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("sent_at", since),
    db.from("inbox_messages").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("direction", "outbound").in("status", ["sent", "delivered", "bounced", "complained"]).gte("created_at", since),
  ]);
  return (campaign.count ?? 0) + (single.count ?? 0);
}

export type DeliverInput = {
  db: Db;
  workspace: { id: string; name: string; business_address: string | null; status: string; daily_send_limit: number };
  actorId: string;
  conversation: { id: string; contact_id: string | null; contact_email: string };
  identityId: string;
  subject: string;
  text: string;
  /** The first email of a conversation we start, rather than an answer to something the contact sent. */
  outreach: boolean;
  /** The Message-ID of the message being answered, so mail programs keep the thread together. */
  inReplyTo?: string | null;
  attachments?: { name: string; type: string; content: Buffer }[];
  /** Copied and blind-copied people. They get the email but are not the conversation's contact. */
  extraTo?: string[];
  cc?: string[];
  bcc?: string[];
  importance?: Importance;
};
/**
 * When the email provider (not a rule here) refuses a message, it stays in the thread as "Not sent" with a
 * Send again button, and `messageId` says which. Every other refusal happens before anything is recorded.
 */
export type DeliverResult = { ok: true; messageId: string } | { ok: false; error: string; messageId?: string };

const fail = (error: string): DeliverResult => ({ ok: false, error });

/** The From header value, with the display name made safe. */
const fromHeader = (name: string, email: string) => {
  const clean = name.replace(/["<>\r\n]/g, "").trim();
  return clean ? `"${clean}" <${email}>` : email;
};

/**
 * Sends one email to one contact and records it in the conversation. The same rules that protect campaigns
 * apply here, because the same domains and the same reputation are at stake:
 *  - the platform kill switch, and suspended or still-reviewed workspaces;
 *  - the daily limit, shared with campaigns;
 *  - a sender address that is active, owned by this organization, on a domain that passes DKIM, SPF and DMARC;
 *  - hard bounces, complaints and suppressed addresses are never emailed. Someone who unsubscribed from
 *    campaigns can still be ANSWERED when they wrote to us, but nobody can start a new email to them.
 */
export async function deliverInboxEmail(input: DeliverInput): Promise<DeliverResult> {
  const { db, workspace: ws, conversation, outreach } = input;
  const email = conversation.contact_email.toLowerCase();
  const text = input.text.replace(/\r\n?/g, "\n").trim();
  if (!text) return fail("Write a message first.");
  if (text.length > 20000) return fail("That message is too long. Keep it under 20,000 characters.");
  const files = input.attachments ?? [];
  const attachError = checkAttachmentSet(files.map((f) => ({ name: f.name, size: f.content.length })));
  if (attachError) return fail(attachError);
  // Looks at what each file really is, not just what it is called.
  for (const f of files) {
    const verdict = checkFile(f.name, f.content);
    if (!verdict.ok) return fail(verdict.reason);
  }
  const subject = input.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  if (!subject) return fail("Add a subject.");

  const clean = (list: string[] | undefined) => Array.from(new Set((list ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean)));
  const alsoTo = clean(input.extraTo).filter((a) => a !== email);
  const cc = clean(input.cc).filter((a) => a !== email && !alsoTo.includes(a));
  const bcc = clean(input.bcc).filter((a) => a !== email && !alsoTo.includes(a) && !cc.includes(a));
  if (alsoTo.length + cc.length + bcc.length > MAX_EXTRA_RECIPIENTS) return fail(`Add at most ${MAX_EXTRA_RECIPIENTS} people to To, Cc and Bcc together.`);
  if ([...alsoTo, ...cc, ...bcc].some((a) => !/^[^\s@<>"',;]+@[^\s@<>"',;]+$/.test(a))) return fail("One of the Cc or Bcc addresses isn’t valid.");
  const importance = toImportance(input.importance);

  const settings = await loadSettings(db);
  if (settings.sending_paused) return fail("Sending is paused for the whole platform right now. Try again later.");
  if (ws.status === "suspended") return fail("Sending is suspended for this organization.");
  if (outreach && ws.status !== "active") return fail("Your account is still under review. You can answer people who write to you, but not start new emails yet.");

  if ((await sentToday(db, ws.id)) >= ws.daily_send_limit) return fail(`You’ve reached today’s sending limit of ${ws.daily_send_limit.toLocaleString("en-US")}. It resets at midnight UTC.`);

  const sender = await checkSender(db, ws.id, input.identityId);
  if (!sender.ok) return fail(sender.reason);

  const { data: contact } = conversation.contact_id
    ? await db.from("contacts").select("status").eq("id", conversation.contact_id).eq("workspace_id", ws.id).maybeSingle()
    : { data: null };
  const status = (contact as { status?: string } | null)?.status ?? null;
  if (status === "bounced" || status === "complained") return fail("Emails to this address bounced or drew a complaint, so it can’t be emailed.");
  // Anyone can be emailed. Only an address that IS one of the contacts has to be subscribed: a contact who unsubscribed said no.
  if (outreach && conversation.contact_id && status !== "subscribed") return fail("This contact isn’t subscribed, so you can’t start a new email to them.");

  const { data: suppressed } = await db.from("suppression_entries").select("reason").eq("email", email).or(`workspace_id.is.null,workspace_id.eq.${ws.id}`);
  const reasons = ((suppressed ?? []) as { reason: string }[]).map((s) => s.reason);
  if (reasons.some((r) => r === "Hard bounce" || r === "Spam complaint")) return fail("Emails to this address bounced or drew a complaint, so it can’t be emailed.");
  if (outreach && reasons.length > 0) return fail("This address is on your suppression list, so it can’t be emailed.");

  // Cc and Bcc people are protected by the same list: one bounce or complaint from them costs the same reputation.
  if (alsoTo.length + cc.length + bcc.length > 0) {
    const { data: extraSuppressed } = await db.from("suppression_entries").select("email, reason").in("email", [...alsoTo, ...cc, ...bcc]).or(`workspace_id.is.null,workspace_id.eq.${ws.id}`);
    const blocked = ((extraSuppressed ?? []) as { email: string; reason: string }[]).find((s) => outreach || s.reason === "Hard bounce" || s.reason === "Spam complaint");
    if (blocked) return fail(`${blocked.email} can’t be emailed: it bounced, drew a complaint, or is on your suppression list.`);
  }

  const { data: row, error: insertError } = await db.from("inbox_messages").insert({
    workspace_id: ws.id, conversation_id: conversation.id, direction: "outbound",
    from_email: sender.identity.email, from_name: sender.identity.from_name, to_email: email,
    subject, text_body: text, sent_by: input.actorId, status: "sending", to_emails: alsoTo, cc_emails: cc, bcc_emails: bcc, importance,
  }).select("id").single();
  if (insertError || !row) return fail("That didn’t send. Try again.");
  const messageId = row.id as string;

  // Files are kept with the message so the thread can show them and a failed send can be tried again.
  const stored = [];
  for (const f of files) stored.push(await storeAttachment(db, { workspaceId: ws.id, conversationId: conversation.id, messageId }, f));
  if (stored.some((a) => a.blocked)) {
    await removeAttachments(db, stored.map((a) => a.path));
    await db.from("inbox_messages").delete().eq("id", messageId);
    return fail("An attachment couldn’t be stored. Try again.");
  }
  if (stored.length > 0) await db.from("inbox_messages").update({ attachments: stored }).eq("id", messageId);

  // Only a first email to someone is promotional enough to need the footer and the unsubscribe link.
  const base = serverEnv.appUrl;
  const unsubUrl = `${base}/u/${encodeURIComponent(unsubscribeToken(`${INBOX_UNSUBSCRIBE_PREFIX}${messageId}`))}`;
  const address = ws.business_address ?? "";
  const footerHtml = outreach
    ? `<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#64748B;">${escapeHtml(ws.name)}${address ? `<br>${escapeHtml(address)}` : ""}<br><a href="${unsubUrl}" style="color:#64748B;">Unsubscribe</a></p>`
    : "";
  const footerText = outreach ? `\n\n--\n${ws.name}${address ? `\n${address}` : ""}\nUnsubscribe: ${unsubUrl}` : "";

  const headers: Record<string, string> = {};
  if (outreach) {
    headers["List-Unsubscribe"] = `<${base}/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken(`${INBOX_UNSUBSCRIBE_PREFIX}${messageId}`))}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  if (importance === "high") {
    headers["Importance"] = "high";
    headers["X-Priority"] = "1";
  } else if (importance === "low") {
    headers["Importance"] = "low";
    headers["X-Priority"] = "5";
  }
  if (input.inReplyTo) {
    headers["In-Reply-To"] = input.inReplyTo;
    headers["References"] = input.inReplyTo;
  }

  try {
    const { messageId: providerId } = await getProvider().send({
      from: fromHeader(sender.identity.from_name, sender.identity.email),
      to: email,
      alsoTo: alsoTo.length > 0 ? alsoTo : undefined,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      html: `<!doctype html><html><body style="margin:0;padding:16px;background:#ffffff;">${textToHtml(text)}${footerHtml}</body></html>`,
      text: `${text}${footerText}`,
      headers,
      replyTo: replyAddress("c", conversation.id, sender.identity.from_name),
      attachments: files.length > 0 ? files.map((f) => ({ filename: safeFileName(f.name), contentType: f.type || "application/octet-stream", content: f.content })) : undefined,
      tags: { message_id: messageId },
    });
    const now = new Date().toISOString();
    await db.from("inbox_messages").update({ status: "sent", provider_message_id: providerId || null }).eq("id", messageId);
    await db.from("conversations").update({ last_message_at: now, last_direction: "outbound", status: "open", snippet: snippetOf(text), importance }).eq("id", conversation.id);
    return { ok: true, messageId };
  } catch (err) {
    const rejected = err instanceof PermanentSendError;
    if (!rejected) console.error("[inbox send]", (err as Error).message);
    const error = rejected ? "The email provider rejected this message. Check the address and the wording, then send it again." : "That didn’t send. Send it again in a moment.";
    await db.from("inbox_messages").update({ status: "failed", error }).eq("id", messageId);
    return { ok: false, error, messageId };
  }
}