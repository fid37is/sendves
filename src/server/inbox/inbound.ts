import { randomUUID } from "crypto";
import { simpleParser } from "mailparser";
import type { Db } from "@/lib/supabase/admin";
import { unsubscribeContact } from "@/server/compliance";
import { parseReplyRecipient } from "./address";
import { storeAttachment } from "./attachments";
import { notifyNewReply } from "./notify";
import { htmlToPlain, isAutoReply, looksLikeUnsubscribe, snippetOf } from "./text";

type Row = Record<string, any>;

export type InboundResult = { status: "stored" | "duplicate" | "ignored"; reason?: string; conversationId?: string };

const MAX_TEXT = 100_000;
const MAX_HTML = 400_000;

/** The conversation a reply belongs to, or why there isn't one. */
async function resolveConversation(db: Db, target: { kind: "s" | "c"; id: string }): Promise<{ conversation: Row } | { reason: string }> {
  if (target.kind === "c") {
    const { data } = await db.from("conversations").select("*").eq("id", target.id).maybeSingle();
    return data ? { conversation: data } : { reason: "conversation not found" };
  }

  // A reply to a campaign email: one conversation per send, made when the first reply arrives.
  const { data: existing } = await db.from("conversations").select("*").eq("send_id", target.id).maybeSingle();
  if (existing) return { conversation: existing };

  const { data: send } = await db.from("sends").select("id, workspace_id, campaign_id, contact_id, email").eq("id", target.id).maybeSingle();
  if (!send) return { reason: "send not found" };
  const [{ data: campaign }, { data: contact }] = await Promise.all([
    db.from("campaigns").select("id, subject, sender_identity_id").eq("id", send.campaign_id).maybeSingle(),
    db.from("contacts").select("id, first_name, last_name").eq("id", send.contact_id).maybeSingle(),
  ]);
  const { data: identity } = campaign?.sender_identity_id
    ? await db.from("sender_identities").select("id, user_id").eq("id", campaign.sender_identity_id).maybeSingle()
    : { data: null };

  const row = {
    workspace_id: send.workspace_id,
    contact_id: contact?.id ?? send.contact_id,
    contact_email: String(send.email).toLowerCase(),
    contact_name: [contact?.first_name, contact?.last_name].filter(Boolean).join(" "),
    subject: campaign?.subject ?? "",
    kind: "campaign",
    campaign_id: send.campaign_id,
    send_id: send.id,
    sender_identity_id: identity?.id ?? null,
    owner_id: identity?.user_id ?? null,
    last_direction: "outbound",
  };
  const { data: created, error } = await db.from("conversations").insert(row).select("*").single();
  if (created) return { conversation: created };
  if (error?.code === "23505") {
    // Two replies arrived together and the other one made it first.
    const { data: again } = await db.from("conversations").select("*").eq("send_id", target.id).maybeSingle();
    if (again) return { conversation: again };
  }
  return { reason: "could not create the conversation" };
}

function headerText(headers: Map<string, unknown>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of headers) out[k.toLowerCase()] = typeof v === "string" ? v : v == null ? undefined : typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : String(v);
  return out;
}

/**
 * Stores one received message. Idempotent: the provider may deliver the same notification more than once.
 * Mail that isn't addressed to a Sendves reply address, or whose signature doesn't check out, is ignored,
 * and mail with a virus verdict is dropped before it is even parsed.
 */
export async function ingestInbound(
  db: Db,
  input: { raw: Buffer; recipients: string[]; providerMessageId: string; spam: boolean; virus: boolean },
): Promise<InboundResult> {
  if (input.virus) return { status: "ignored", reason: "virus" };
  const target = parseReplyRecipient(input.recipients);
  if (!target) return { status: "ignored", reason: "not a Sendves reply address" };

  const resolved = await resolveConversation(db, target);
  if ("reason" in resolved) return { status: "ignored", reason: resolved.reason };
  const conversation = resolved.conversation;

  const parsed = await simpleParser(input.raw);
  const from = parsed.from?.value?.[0];
  const fromEmail = String(from?.address ?? "").toLowerCase();
  if (!fromEmail) return { status: "ignored", reason: "no sender" };

  const subject = String(parsed.subject ?? "").slice(0, 300);
  const html = typeof parsed.html === "string" && parsed.html ? parsed.html.slice(0, MAX_HTML) : null;
  const text = (parsed.text?.trim() ? parsed.text : html ? htmlToPlain(html) : "").slice(0, MAX_TEXT);
  const auto = isAutoReply(headerText(parsed.headers), fromEmail, subject);

  // The address the contact wrote to: the sender address the conversation belongs to.
  const { data: identity } = conversation.sender_identity_id
    ? await db.from("sender_identities").select("email").eq("id", conversation.sender_identity_id).maybeSingle()
    : { data: null };

  const messageId = randomUUID();
  const { error } = await db.from("inbox_messages").insert({
    id: messageId,
    workspace_id: conversation.workspace_id,
    conversation_id: conversation.id,
    direction: "inbound",
    from_email: fromEmail,
    from_name: String(from?.name ?? "").slice(0, 120),
    to_email: identity?.email ?? "",
    subject,
    text_body: text,
    html_body: html,
    provider_message_id: input.providerMessageId || null,
    rfc_message_id: parsed.messageId ?? null,
    in_reply_to: typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : null,
    status: "delivered",
    auto,
    spam: input.spam,
    attachments: [],
  });
  if (error) {
    if (error.code === "23505") return { status: "duplicate", conversationId: conversation.id };
    throw new Error(error.message);
  }

  // Files are kept (up to 10 of at most 10 MB each) so the thread can open them. Files that run programs are listed, not kept.
  const kept = [];
  for (const a of (parsed.attachments ?? []).slice(0, 10)) {
    const content = Buffer.isBuffer(a.content) ? a.content : null;
    const name = String(a.filename ?? "attachment");
    if (!content || content.length === 0) continue;
    kept.push(
      content.length > 10 * 1024 * 1024
        ? { id: randomUUID(), name: name.slice(0, 120), size: content.length, type: String(a.contentType ?? "").slice(0, 100), blocked: true, reason: `${name.slice(0, 60)} is larger than 10 MB, so it wasn’t kept.`, path: null }
        : await storeAttachment(db, { workspaceId: conversation.workspace_id, conversationId: conversation.id, messageId }, { name, type: String(a.contentType ?? ""), content }),
    );
  }
  if (kept.length > 0) await db.from("inbox_messages").update({ attachments: kept }).eq("id", messageId);

  const now = new Date().toISOString();
  if (auto || input.spam) {
    // Kept with the conversation, but it is not a person answering: nothing is marked unread or reopened.
    await db.from("conversations").update({ last_message_at: now }).eq("id", conversation.id);
  } else {
    await db.from("conversations").update({
      last_message_at: now, last_inbound_at: now, last_direction: "inbound", status: "open", snippet: snippetOf(text),
      // A direct conversation started by the contact has no subject yet.
      ...(conversation.subject ? {} : { subject }),
    }).eq("id", conversation.id);

    // A campaign counts one reply per email, however many messages follow.
    if (conversation.kind === "campaign" && conversation.send_id) {
      const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("send_id", conversation.send_id).eq("type", "reply");
      if (!count) {
        await db.from("events").insert({
          workspace_id: conversation.workspace_id, campaign_id: conversation.campaign_id, send_id: conversation.send_id, contact_id: conversation.contact_id, type: "reply",
        });
      }
    }

    // "Please unsubscribe me" is honoured at once, from the contact's own address only: a reply from somebody
    // else can't unsubscribe a contact.
    if (looksLikeUnsubscribe(text) && fromEmail === String(conversation.contact_email).toLowerCase()) {
      await unsubscribeContact(db, {
        workspaceId: conversation.workspace_id, contactId: conversation.contact_id, email: conversation.contact_email,
        campaignId: conversation.campaign_id, sendId: conversation.send_id, meta: { via: "reply", message_id: messageId },
      });
      await db.from("inbox_messages").update({ unsubscribe_requested: true }).eq("id", messageId);
    }
    await notifyNewReply(db, conversation as Parameters<typeof notifyNewReply>[1], text);
  }
  return { status: "stored", conversationId: conversation.id };
}
