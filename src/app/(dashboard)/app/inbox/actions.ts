"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { checkAttachmentSet, canSeeConversation, isReactionEmoji, MAX_EXTRA_RECIPIENTS, parseAddressList, toImportance, type AttachmentInfo, type DraftFull, type Importance } from "@/lib/inbox";
import { getDraft } from "@/lib/inbox-queries";
import { requireWorkspace } from "@/lib/workspace";
import { serverEnv } from "@/lib/env.server";
import { replyAddress } from "@/server/inbox/address";
import { ingestInbound } from "@/server/inbox/inbound";
import { readAttachment, removeAttachments, storeAttachment, type StoredAttachment } from "@/server/inbox/attachments";
import { deliverInboxEmail } from "@/server/inbox/outbound";
import { replySubject } from "@/server/inbox/text";

export type InboxActionResult = { ok: boolean; message?: string; error?: string; id?: string; /** The files a draft now holds (names and sizes only). */ attachments?: AttachmentInfo[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ws = Awaited<ReturnType<typeof requireWorkspace>>;
const NOT_FOUND = "That conversation isn’t available any more.";

/** One conversation of this organization that this person may open, or null. Checked on the server for every action. */
async function openConversation(ctx: Ws, id: unknown) {
  const cid = String(id ?? "");
  if (!UUID_RE.test(cid)) return null;
  const { data } = await ctx.db.from("conversations").select("*").eq("id", cid).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, any>;
  return canSeeConversation(ctx.access, ctx.user.id, { ownerId: row.owner_id ?? null, assignedTo: row.assigned_to ?? null }) ? row : null;
}

const done = () => revalidatePath("/app/inbox");

/** The files chosen in a form, checked before anything is read into memory. */
async function readFiles(fd: FormData): Promise<{ files: { name: string; type: string; content: Buffer }[] } | { error: string }> {
  const picked = fd.getAll("files").filter((v): v is File => typeof v !== "string" && v.size > 0);
  const error = checkAttachmentSet(picked.map((f) => ({ name: f.name, size: f.size })));
  if (error) return { error };
  return { files: await Promise.all(picked.map(async (f) => ({ name: f.name, type: f.type, content: Buffer.from(await f.arrayBuffer()) }))) };
}

/** Cc, Bcc and importance from a form. Bcc leaves out anyone already in Cc. */
function readExtras(fd: FormData): { extraTo: string[]; cc: string[]; bcc: string[]; importance: Importance } | { error: string } {
  const to = parseAddressList(fd.get("to"));
  if ("error" in to) return { error: to.error };
  const cc = parseAddressList(fd.get("cc"));
  if ("error" in cc) return { error: cc.error };
  const bcc = parseAddressList(fd.get("bcc"));
  if ("error" in bcc) return { error: bcc.error };
  const copied = cc.list.filter((a) => !to.list.includes(a));
  const blind = bcc.list.filter((a) => !to.list.includes(a) && !copied.includes(a));
  if (to.list.length + copied.length + blind.length > MAX_EXTRA_RECIPIENTS) return { error: `Add at most ${MAX_EXTRA_RECIPIENTS} people to To, Cc and Bcc together.` };
  return { extraTo: to.list, cc: copied, bcc: blind, importance: toImportance(fd.get("importance")) };
}

/** Answers a conversation, from the address the contact wrote to. */
export async function sendReplyAction(formData: FormData): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  const conv = await openConversation(ctx, formData.get("conversationId"));
  if (!conv) return { ok: false, error: NOT_FOUND };
  if (!conv.sender_identity_id) return { ok: false, error: "The address this conversation was sent from was removed, so it can’t be answered from here." };

  const picked = await readFiles(formData);
  if ("error" in picked) return { ok: false, error: picked.error };
  const extras = readExtras(formData);
  if ("error" in extras) return { ok: false, error: extras.error };

  // Mail programs thread by Message-ID: answer the latest real message from the contact.
  const { data: last } = await ctx.db.from("inbox_messages").select("rfc_message_id").eq("conversation_id", conv.id).eq("direction", "inbound").eq("auto", false)
    .not("rfc_message_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const res = await deliverInboxEmail({
    db: ctx.db, workspace: ctx.workspace, actorId: ctx.user.id,
    conversation: { id: conv.id, contact_id: conv.contact_id ?? null, contact_email: conv.contact_email },
    identityId: conv.sender_identity_id, subject: replySubject(conv.subject || ""), text: String(formData.get("body") ?? ""),
    outreach: false, inReplyTo: (last as { rfc_message_id?: string } | null)?.rfc_message_id ?? null, attachments: picked.files, ...extras,
  });
  // A message the provider refused stays in the thread with a Send again button, so the box can be cleared.
  if (!res.ok) { if (res.messageId) done(); return { ok: false, error: res.error, id: res.messageId ? conv.id : undefined }; }
  done();
  return { ok: true, message: "Reply sent.", id: conv.id };
}

type Recipient = { contact: { id: string; email: string; first_name: string | null; last_name: string | null; status: string } | null; email: string };

/**
 * Who a new email is for. Anyone can be emailed: a contact picked from the list (by id), or any plain address.
 * A plain address that happens to belong to a contact is treated as that contact, so their status (for example
 * "unsubscribed") still protects them.
 */
async function resolveRecipient(ctx: Ws, fd: FormData): Promise<{ ok: true; recipient: Recipient } | { ok: false; error: string }> {
  const contactId = String(fd.get("contactId") ?? "");
  if (UUID_RE.test(contactId)) {
    const { data: contact } = await ctx.db.from("contacts").select("id, email, first_name, last_name, status").eq("id", contactId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!contact) return { ok: false, error: "That contact no longer exists." };
    return { ok: true, recipient: { contact: contact as Recipient["contact"], email: String(contact.email).toLowerCase() } };
  }
  const parsed = parseAddressList(fd.get("primary"));
  if ("error" in parsed) return { ok: false, error: parsed.error };
  if (parsed.list.length !== 1) return { ok: false, error: "Choose who to email." };
  const email = parsed.list[0];
  const { data: existing } = await ctx.db.from("contacts").select("id, email, first_name, last_name, status").eq("workspace_id", ctx.workspace.id).eq("email", email).maybeSingle();
  return { ok: true, recipient: { contact: (existing as Recipient["contact"]) ?? null, email } };
}

/** Starts a new conversation by emailing someone (a contact or any address). A draft it was written in is used up by it. */
export async function startEmailAction(formData: FormData): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", ["inbox.reply", "contacts.view"]);
  const identityId = String(formData.get("identityId") ?? "");
  if (!UUID_RE.test(identityId)) return { ok: false, error: "Choose which address to send from." };

  const who = await resolveRecipient(ctx, formData);
  if (!who.ok) return { ok: false, error: who.error };
  const { contact, email: toEmail } = who.recipient;
  // You send as yourself: your own work email or one of your aliases, never a colleague's address.
  const { data: identity } = await ctx.db.from("sender_identities").select("id").eq("id", identityId).eq("workspace_id", ctx.workspace.id).eq("user_id", ctx.user.id).maybeSingle();
  if (!identity) return { ok: false, error: "You can only send from your own addresses." };

  const picked = await readFiles(formData);
  if ("error" in picked) return { ok: false, error: picked.error };

  const extras = readExtras(formData);
  if ("error" in extras) return { ok: false, error: extras.error };

  // Files already kept with the draft go out with it.
  const draft = await ownDraft(ctx, formData.get("draftId"));
  const files = [...picked.files];
  if (draft) {
    const keep = keepIds(formData);
    for (const a of storedList(draft)) {
      if (!keep.has(a.id) || !a.path) continue;
      const content = await readAttachment(ctx.db, a.path);
      if (!content) return { ok: false, error: `${a.name} is no longer available. Attach it again.` };
      files.push({ name: a.name, type: a.type, content });
    }
    const problem = checkAttachmentSet(files.map((f) => ({ name: f.name, size: f.content.length })));
    if (problem) return { ok: false, error: problem };
  }

  const subject = String(formData.get("subject") ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const { data: conv, error } = await ctx.db.from("conversations").insert({
    workspace_id: ctx.workspace.id, contact_id: contact?.id ?? null, contact_email: toEmail,
    contact_name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "", subject, kind: "direct",
    sender_identity_id: identityId, owner_id: ctx.user.id, created_by: ctx.user.id, last_direction: "outbound",
  }).select("id").single();
  if (error || !conv) return { ok: false, error: "That didn’t work. Try again." };

  const res = await deliverInboxEmail({
    db: ctx.db, workspace: ctx.workspace, actorId: ctx.user.id,
    conversation: { id: conv.id, contact_id: contact?.id ?? null, contact_email: toEmail },
    identityId, subject, text: String(formData.get("body") ?? ""), outreach: true, attachments: files, ...extras,
  });
  if (!res.ok) {
    // Refused by a rule here: nothing was recorded, so no empty conversation is left behind. Refused by the
    // email provider: the message stays, as "Not sent", and the person lands on it to send it again.
    if (res.messageId) { if (draft) await dropDraft(ctx, draft); done(); return { ok: false, error: res.error, id: conv.id }; }
    await ctx.db.from("conversations").delete().eq("id", conv.id);
    return { ok: false, error: res.error };
  }
  if (draft) await dropDraft(ctx, draft);
  done();
  return { ok: true, message: "Email sent.", id: conv.id };
}

export async function setConversationStatusAction(input: { conversationId: string; status: "open" | "closed" }): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  const conv = await openConversation(ctx, input?.conversationId);
  if (!conv) return { ok: false, error: NOT_FOUND };
  const status = input?.status === "closed" ? "closed" : "open";
  await ctx.db.from("conversations").update({ status }).eq("id", conv.id);
  done();
  return { ok: true, message: status === "closed" ? "Conversation closed." : "Conversation reopened." };
}

/** Hands a conversation to a colleague (or back to nobody). Only for people who can see every conversation. */
export async function assignConversationAction(input: { conversationId: string; userId: string | null }): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", ["inbox.all", "inbox.reply"]);
  const conv = await openConversation(ctx, input?.conversationId);
  if (!conv) return { ok: false, error: NOT_FOUND };

  let target: string | null = null;
  if (input?.userId) {
    const uid = String(input.userId);
    const { data: member } = UUID_RE.test(uid)
      ? await ctx.db.from("workspace_members").select("user_id").eq("workspace_id", ctx.workspace.id).eq("user_id", uid).eq("status", "active").maybeSingle()
      : { data: null };
    if (!member) return { ok: false, error: "That person isn’t an active member of this organization." };
    target = uid;
  }
  await ctx.db.from("conversations").update({ assigned_to: target }).eq("id", conv.id);
  done();
  return { ok: true, message: target ? "Conversation assigned." : "Conversation unassigned." };
}

export async function markReadAction(conversationId: string): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.view");
  const conv = await openConversation(ctx, conversationId);
  if (!conv) return { ok: false, error: NOT_FOUND };
  // Read is per person: opening it clears it for you, not for a colleague who hasn't looked yet.
  await ctx.db.from("conversation_reads").upsert({ conversation_id: conv.id, user_id: ctx.user.id, last_read_at: new Date().toISOString() });
  return { ok: true };
}

export type ContactHit = { id: string; email: string; name: string; status: string };

/** Finds contacts to write to. */
export async function searchContactsAction(query: string): Promise<ContactHit[]> {
  const ctx = await requireWorkspace("/app/inbox", ["inbox.reply", "contacts.view"]);
  const term = String(query ?? "").replace(/[^\p{L}\p{N}@.+_\- ]/gu, "").trim().slice(0, 80);
  if (!term) {
    // Nothing typed yet: only the two people this person emailed most recently, never the whole contact list.
    const { data: recent } = await ctx.db.from("conversations").select("contact_id, contacts(id, email, first_name, last_name, status)")
      .eq("workspace_id", ctx.workspace.id).eq("owner_id", ctx.user.id).not("contact_id", "is", null).not("last_direction", "is", null)
      .order("last_message_at", { ascending: false }).limit(20);
    const seen = new Set<string>();
    const out: ContactHit[] = [];
    for (const r of (recent ?? []) as any[]) {
      const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ id: c.id, email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(" "), status: c.status });
      if (out.length === 2) break;
    }
    return out;
  }
  let q = ctx.db.from("contacts").select("id, email, first_name, last_name, status").eq("workspace_id", ctx.workspace.id);
  if (term) q = q.or(`email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  const { data } = await q.order("created_at", { ascending: false }).limit(5);
  return ((data ?? []) as any[]).map((c) => ({ id: c.id, email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(" "), status: c.status }));
}

/**
 * Development only (the console sending provider): pretends the contact replied, by running a real message
 * through the same receiving code SES uses. Lets the inbox be tried without any mail setup.
 */
export async function simulateReplyAction(input: { conversationId: string; body: string }): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  if (serverEnv.sending.provider !== "console") return { ok: false, error: "Simulated replies are only available while sending is set to the console." };
  const conv = await openConversation(ctx, input?.conversationId);
  if (!conv) return { ok: false, error: NOT_FOUND };
  const to = replyAddress("c", conv.id);
  if (!to) return { ok: false, error: "Set INBOUND_DOMAIN in .env.local to try replies." };

  const body = String(input?.body ?? "").trim() || "Thanks, this is a test reply.";
  const raw = [
    `From: ${conv.contact_name ? `"${String(conv.contact_name).replace(/"/g, "")}" ` : ""}<${conv.contact_email}>`,
    `To: ${to}`,
    `Subject: ${replySubject(conv.subject || "")}`,
    `Message-ID: <sim-${Date.now()}@simulated.test>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");
  const result = await ingestInbound(ctx.db, { raw: Buffer.from(raw), recipients: [to], providerMessageId: `sim-${conv.id}-${Date.now()}`, spam: false, virus: false });
  if (result.status !== "stored") return { ok: false, error: "The simulated reply wasn’t stored." };
  done();
  return { ok: true, message: "A reply arrived." };
}

/**
 * Sends a message again: one the email provider refused ("Not sent"), or one that bounced once the address has
 * been put right. It goes out as a new message with the same words and files, through the same rules as any
 * other, so an address that still can't be emailed says so.
 */
export async function resendMessageAction(messageId: string): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  const mid = String(messageId ?? "");
  if (!UUID_RE.test(mid)) return { ok: false, error: NOT_FOUND };
  const { data: m } = await ctx.db.from("inbox_messages").select("*").eq("id", mid).eq("workspace_id", ctx.workspace.id).eq("direction", "outbound").maybeSingle();
  if (!m || !["failed", "bounced"].includes(m.status)) return { ok: false, error: "That message can’t be sent again." };
  const conv = await openConversation(ctx, m.conversation_id);
  if (!conv) return { ok: false, error: NOT_FOUND };
  if (!conv.sender_identity_id) return { ok: false, error: "The address this conversation was sent from was removed, so it can’t be answered from here." };

  const files: { name: string; type: string; content: Buffer }[] = [];
  for (const a of Array.isArray(m.attachments) ? m.attachments : []) {
    const content = a.path ? await readAttachment(ctx.db, a.path) : null;
    if (!content) return { ok: false, error: `${a.name ?? "An attachment"} is no longer available. Write the message again.` };
    files.push({ name: a.name, type: a.type, content });
  }
  // The first email of a conversation we started is outreach (it carries the unsubscribe footer); later ones are answers.
  const { count } = await ctx.db.from("inbox_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).lt("created_at", m.created_at);
  const outreach = conv.kind === "direct" && !count;

  const res = await deliverInboxEmail({
    db: ctx.db, workspace: ctx.workspace, actorId: ctx.user.id,
    conversation: { id: conv.id, contact_id: conv.contact_id ?? null, contact_email: conv.contact_email },
    identityId: conv.sender_identity_id, subject: m.subject, text: m.text_body, outreach, attachments: files,
    extraTo: Array.isArray(m.to_emails) ? m.to_emails : [], cc: Array.isArray(m.cc_emails) ? m.cc_emails : [], bcc: Array.isArray(m.bcc_emails) ? m.bcc_emails : [], importance: toImportance(m.importance),
  });
  // Whether it went out or the provider refused again, the new message takes the place of one that never left.
  if (m.status === "failed" && (res.ok || res.messageId)) await dropMessage(ctx, m);
  done();
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, message: "Sent." };
}

/** Deletes a message and the files that went with it. */
async function dropMessage(ctx: Ws, m: Record<string, any>) {
  await removeAttachments(ctx.db, (Array.isArray(m.attachments) ? m.attachments : []).map((a: any) => a.path ?? null));
  await ctx.db.from("inbox_messages").delete().eq("id", m.id);
}

/** Throws away a message that never went out. */
export async function discardMessageAction(messageId: string): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  const mid = String(messageId ?? "");
  if (!UUID_RE.test(mid)) return { ok: false, error: NOT_FOUND };
  const { data: m } = await ctx.db.from("inbox_messages").select("id, conversation_id, status, attachments").eq("id", mid).eq("workspace_id", ctx.workspace.id).eq("direction", "outbound").maybeSingle();
  if (!m || m.status !== "failed") return { ok: false, error: "Only a message that wasn’t sent can be discarded." };
  const conv = await openConversation(ctx, m.conversation_id);
  if (!conv) return { ok: false, error: NOT_FOUND };
  await dropMessage(ctx, m);
  // A conversation that only ever held that message goes with it.
  const { count } = await ctx.db.from("inbox_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id);
  if (!count) await ctx.db.from("conversations").delete().eq("id", conv.id);
  done();
  return { ok: true, message: "Discarded." };
}

/** Saved replies are shared by the organization; anyone who can reply can add one. */
export async function saveReplyAction(input: { id?: string; title: string; body: string }): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  const title = String(input?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const body = String(input?.body ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 5000);
  if (!title) return { ok: false, error: "Give it a short title." };
  if (!body) return { ok: false, error: "Write the reply." };

  if (input?.id) {
    const rid = String(input.id);
    const { data: row } = UUID_RE.test(rid) ? await ctx.db.from("saved_replies").select("id, created_by").eq("id", rid).eq("workspace_id", ctx.workspace.id).maybeSingle() : { data: null };
    if (!row) return { ok: false, error: "That saved reply no longer exists." };
    // Yours, or you can manage the whole inbox.
    if (row.created_by !== ctx.user.id && !can(ctx.access, "inbox.all")) return { ok: false, error: "Only the person who wrote it can change it." };
    await ctx.db.from("saved_replies").update({ title, body, updated_at: new Date().toISOString() }).eq("id", row.id);
  } else {
    const { count } = await ctx.db.from("saved_replies").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
    if ((count ?? 0) >= 100) return { ok: false, error: "You have 100 saved replies. Delete one you don’t use first." };
    const { error } = await ctx.db.from("saved_replies").insert({ workspace_id: ctx.workspace.id, title, body, created_by: ctx.user.id });
    if (error) return { ok: false, error: "That didn’t save. Try again." };
  }
  done();
  return { ok: true, message: "Saved." };
}

export async function deleteReplyAction(id: string): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  const rid = String(id ?? "");
  const { data: row } = UUID_RE.test(rid) ? await ctx.db.from("saved_replies").select("id, created_by").eq("id", rid).eq("workspace_id", ctx.workspace.id).maybeSingle() : { data: null };
  if (!row) return { ok: false, error: "That saved reply no longer exists." };
  if (row.created_by !== ctx.user.id && !can(ctx.access, "inbox.all")) return { ok: false, error: "Only the person who wrote it can delete it." };
  await ctx.db.from("saved_replies").delete().eq("id", row.id);
  done();
  return { ok: true, message: "Deleted." };
}

/* ── Drafts and scheduled emails ───────────────────────────────────────────────
 * Private to their author. A draft is saved as it is written; a scheduled email is a draft with a time, sent by
 * the worker (src/server/inbox/scheduled.ts) through the same rules as any other email. */

type DraftRowDb = Record<string, any>;
const MAX_DRAFTS = 200;

/** One draft of this person, or null. Nobody else's draft can be opened, whatever their role. */
async function ownDraft(ctx: Ws, id: unknown): Promise<DraftRowDb | null> {
  const did = String(id ?? "");
  if (!UUID_RE.test(did)) return null;
  const { data } = await ctx.db.from("inbox_drafts").select("*").eq("id", did).eq("workspace_id", ctx.workspace.id).eq("user_id", ctx.user.id).maybeSingle();
  return (data as DraftRowDb | null) ?? null;
}

const storedList = (d: DraftRowDb): StoredAttachment[] => (Array.isArray(d.attachments) ? d.attachments : []) as StoredAttachment[];

/** Which of the files a draft already holds are still wanted. */
function keepIds(fd: FormData): Set<string> {
  try {
    const list = JSON.parse(String(fd.get("keep") ?? "[]"));
    return new Set((Array.isArray(list) ? list : []).map(String));
  } catch {
    return new Set();
  }
}

/** Deletes a draft and the files kept with it. */
async function dropDraft(ctx: Ws, d: DraftRowDb) {
  await removeAttachments(ctx.db, storedList(d).map((a) => a.path ?? null));
  await ctx.db.from("inbox_drafts").delete().eq("id", d.id);
}

type Persisted = { ok: true; id: string; attachments: AttachmentInfo[] } | { ok: false; error: string; gone?: boolean };

/** Creates or updates the person's draft from a form, and brings its files in line with what they chose to keep and add. */
async function persistDraft(ctx: Ws, fd: FormData, next: { status: "draft" | "scheduled"; scheduledAt: string | null }): Promise<Persisted> {
  const contactRaw = String(fd.get("contactId") ?? "");
  const identityRaw = String(fd.get("identityId") ?? "");
  const contactId = UUID_RE.test(contactRaw) ? contactRaw : null;
  let identityId: string | null = null;
  if (UUID_RE.test(identityRaw)) {
    const { data: identity } = await ctx.db.from("sender_identities").select("id").eq("id", identityRaw).eq("workspace_id", ctx.workspace.id).eq("user_id", ctx.user.id).maybeSingle();
    if (!identity) return { ok: false, error: "You can only send from your own addresses." };
    identityId = identityRaw;
  }
  if (contactId) {
    const { data: contact } = await ctx.db.from("contacts").select("id").eq("id", contactId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!contact) return { ok: false, error: "That contact no longer exists." };
  }
  const subject = String(fd.get("subject") ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const body = String(fd.get("body") ?? "").replace(/\r\n?/g, "\n").slice(0, 20000);

  const picked = await readFiles(fd);
  if ("error" in picked) return { ok: false, error: picked.error };
  const extras = readExtras(fd);
  if ("error" in extras) return { ok: false, error: extras.error };

  const existing = fd.get("draftId") ? await ownDraft(ctx, fd.get("draftId")) : null;
  if (fd.get("draftId") && !existing) return { ok: false, error: "That draft isn’t there any more.", gone: true };
  if (existing && (existing.status === "sending" || (existing.status === "scheduled" && next.status === "draft"))) {
    return { ok: false, error: existing.status === "sending" ? "That email is being sent right now." : "Cancel the schedule before changing this email." };
  }

  const keep = keepIds(fd);
  const kept = existing ? storedList(existing).filter((a) => keep.has(a.id)) : [];
  const problem = checkAttachmentSet([...kept.map((a) => ({ name: a.name, size: a.size })), ...picked.files.map((f) => ({ name: f.name, size: f.content.length }))]);
  if (problem) return { ok: false, error: problem };

  if (!existing) {
    const { count } = await ctx.db.from("inbox_drafts").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).eq("user_id", ctx.user.id);
    if ((count ?? 0) >= MAX_DRAFTS) return { ok: false, error: `You have ${MAX_DRAFTS} drafts and scheduled emails. Delete some first.` };
  }

  // Someone who isn't a contact is kept as the first address in "To" (a draft without a contact has no other way to name them).
  const primary = contactId ? null : (() => { const p = parseAddressList(fd.get("primary")); return "list" in p ? p.list[0] ?? null : null; })();
  const toEmails = primary ? [primary, ...extras.extraTo.filter((a) => a !== primary)] : extras.extraTo;
  const fields = { contact_id: contactId, identity_id: identityId, subject, body, to_emails: toEmails, cc_emails: extras.cc, bcc_emails: extras.bcc, importance: extras.importance, status: next.status, scheduled_at: next.scheduledAt, error: null, updated_at: new Date().toISOString() };
  let id: string;
  if (existing) {
    id = existing.id;
    const { error } = await ctx.db.from("inbox_drafts").update(fields).eq("id", id);
    if (error) return { ok: false, error: "That didn’t save. Try again." };
  } else {
    const { data, error } = await ctx.db.from("inbox_drafts").insert({ ...fields, workspace_id: ctx.workspace.id, user_id: ctx.user.id }).select("id").single();
    if (error || !data) return { ok: false, error: "That didn’t save. Try again." };
    id = data.id as string;
  }

  // Files: the ones dropped are deleted, the new ones kept with the draft.
  const stored: StoredAttachment[] = [];
  for (const f of picked.files) stored.push(await storeAttachment(ctx.db, { workspaceId: ctx.workspace.id, conversationId: "drafts", messageId: id }, f));
  const refused = stored.find((a) => a.blocked);
  if (refused) {
    await removeAttachments(ctx.db, stored.map((a) => a.path));
    if (!existing) await ctx.db.from("inbox_drafts").delete().eq("id", id);
    return { ok: false, error: refused.reason ?? "An attachment couldn’t be stored. Try again." };
  }
  if (existing) await removeAttachments(ctx.db, storedList(existing).filter((a) => !keep.has(a.id)).map((a) => a.path ?? null));
  const all = [...kept, ...stored];
  await ctx.db.from("inbox_drafts").update({ attachments: all }).eq("id", id);
  return { ok: true, id, attachments: all.map(({ path: _path, ...info }) => info) };
}

/** Saves what is being written, so it can be finished later. Called as the person types. */
export async function saveDraftAction(formData: FormData): Promise<InboxActionResult & { gone?: boolean }> {
  const ctx = await requireWorkspace("/app/inbox", ["inbox.reply", "contacts.view"]);
  const res = await persistDraft(ctx, formData, { status: "draft", scheduledAt: null });
  if (!res.ok) return { ok: false, error: res.error, gone: res.gone };
  revalidatePath("/app/inbox");
  return { ok: true, id: res.id, attachments: res.attachments };
}

/** Opens a draft or a scheduled email in the composer. */
export async function loadDraftAction(id: string): Promise<{ ok: true; draft: DraftFull } | { ok: false; error: string }> {
  const ctx = await requireWorkspace("/app/inbox", ["inbox.reply", "contacts.view"]);
  const draft = await getDraft(ctx, ctx.user.id, String(id ?? ""));
  return draft ? { ok: true, draft } : { ok: false, error: "That draft isn’t there any more." };
}

/** Throws a draft away, with the files that went with it. */
export async function discardDraftAction(id: string): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  const draft = await ownDraft(ctx, id);
  if (!draft) return { ok: true };
  if (draft.status === "sending") return { ok: false, error: "That email is being sent right now." };
  await dropDraft(ctx, draft);
  revalidatePath("/app/inbox");
  return { ok: true, message: "Draft discarded." };
}

/** Sends an email at a later time. It goes out through the same rules as one sent now, when its time comes. */
export async function scheduleEmailAction(formData: FormData): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", ["inbox.reply", "contacts.view"]);
  const when = new Date(String(formData.get("scheduledAt") ?? ""));
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Choose when to send it." };
  if (when.getTime() < Date.now() + 60_000) return { ok: false, error: "Choose a time at least a minute from now." };
  if (when.getTime() > Date.now() + 365 * 86_400_000) return { ok: false, error: "Emails can be scheduled up to a year ahead." };

  const who = await resolveRecipient(ctx, formData);
  if (!who.ok) return { ok: false, error: who.error };
  if (who.recipient.contact && who.recipient.contact.status !== "subscribed") return { ok: false, error: "This contact isn’t subscribed, so a new email to them can’t be sent." };
  if (!UUID_RE.test(String(formData.get("identityId") ?? ""))) return { ok: false, error: "Choose which address to send from." };
  if (!String(formData.get("subject") ?? "").trim()) return { ok: false, error: "Add a subject." };
  if (!String(formData.get("body") ?? "").trim()) return { ok: false, error: "Write a message first." };

  const res = await persistDraft(ctx, formData, { status: "scheduled", scheduledAt: when.toISOString() });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/app/inbox");
  return { ok: true, id: res.id, message: "Email scheduled." };
}

/** Takes a scheduled (or failed) email back to a draft. */
export async function unscheduleAction(id: string): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  const draft = await ownDraft(ctx, id);
  if (!draft) return { ok: false, error: "That email isn’t there any more." };
  if (draft.status === "sending") return { ok: false, error: "That email is being sent right now." };
  await ctx.db.from("inbox_drafts").update({ status: "draft", scheduled_at: null, error: null, updated_at: new Date().toISOString() }).eq("id", draft.id).neq("status", "sending");
  revalidatePath("/app/inbox");
  return { ok: true, message: "Schedule cancelled. It’s back in Drafts." };
}

/** Acts on several drafts at once: from the list, or the Scheduled folder. */
export async function bulkDraftsAction(input: { ids: string[]; op: "discard" | "unschedule" }): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  const ids = Array.from(new Set((Array.isArray(input?.ids) ? input.ids : []).map(String).filter((i) => UUID_RE.test(i)))).slice(0, 100);
  if (ids.length === 0) return { ok: false, error: "Select something first." };
  const { data } = await ctx.db.from("inbox_drafts").select("*").in("id", ids).eq("workspace_id", ctx.workspace.id).eq("user_id", ctx.user.id).neq("status", "sending");
  const rows = (data ?? []) as DraftRowDb[];
  if (rows.length === 0) return { ok: false, error: "Those emails aren’t there any more." };
  if (input.op === "discard") for (const d of rows) await dropDraft(ctx, d);
  else await ctx.db.from("inbox_drafts").update({ status: "draft", scheduled_at: null, error: null, updated_at: new Date().toISOString() }).in("id", rows.map((d) => d.id));
  revalidatePath("/app/inbox");
  const n = rows.length;
  return { ok: true, message: input.op === "discard" ? (n === 1 ? "Discarded." : `${n} emails discarded.`) : (n === 1 ? "Schedule cancelled. It’s back in Drafts." : `${n} schedules cancelled. They’re back in Drafts.`) };
}

/* ── Folders: Bin, Junk, read and unread, closed ───────────────────────────────── */

export type BulkOp = "trash" | "restore" | "junk" | "not_junk" | "read" | "unread" | "close" | "reopen" | "delete_forever";
const BULK_OPS: BulkOp[] = ["trash", "restore", "junk", "not_junk", "read", "unread", "close", "reopen", "delete_forever"];

/** Removes conversations for good, with the files their messages carried. */
async function purge(ctx: Ws, ids: string[]) {
  if (ids.length === 0) return;
  const { data } = await ctx.db.from("inbox_messages").select("attachments").in("conversation_id", ids);
  const paths = ((data ?? []) as { attachments: unknown }[]).flatMap((m) => (Array.isArray(m.attachments) ? m.attachments : []).map((a: any) => a?.path ?? null));
  await removeAttachments(ctx.db, paths);
  await ctx.db.from("conversations").delete().in("id", ids).eq("workspace_id", ctx.workspace.id);
}

const countText = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("{n}", String(n)));

/** One action on one or more conversations: what the list's toolbar and a conversation's toolbar both do. Only conversations this person may open are touched. */
export async function bulkConversationsAction(input: { ids: string[]; op: BulkOp }): Promise<InboxActionResult> {
  const op = input?.op;
  if (!BULK_OPS.includes(op)) return { ok: false, error: "That didn’t work. Try again." };
  const ctx = await requireWorkspace("/app/inbox", op === "read" || op === "unread" ? "inbox.view" : "inbox.reply");
  const ids = Array.from(new Set((Array.isArray(input?.ids) ? input.ids : []).map(String).filter((i) => UUID_RE.test(i)))).slice(0, 100);
  if (ids.length === 0) return { ok: false, error: "Select something first." };

  const { data } = await ctx.db.from("conversations").select("id, owner_id, assigned_to, status, last_direction, last_inbound_at, trashed_at").eq("workspace_id", ctx.workspace.id).in("id", ids);
  const rows = ((data ?? []) as Record<string, any>[]).filter((r) => canSeeConversation(ctx.access, ctx.user.id, { ownerId: r.owner_id ?? null, assignedTo: r.assigned_to ?? null }));
  if (rows.length === 0) return { ok: false, error: NOT_FOUND };
  const mine = rows.map((r) => r.id as string);
  const n = mine.length;
  const now = new Date().toISOString();
  let message = "Done.";

  switch (op) {
    case "trash":
      await ctx.db.from("conversations").update({ trashed_at: now }).in("id", mine);
      message = countText(n, "Moved to Bin.", "{n} conversations moved to Bin.");
      break;
    case "restore":
      await ctx.db.from("conversations").update({ trashed_at: null }).in("id", mine);
      message = countText(n, "Restored.", "{n} conversations restored.");
      break;
    case "junk":
      await ctx.db.from("conversations").update({ is_junk: true }).in("id", mine);
      message = countText(n, "Moved to Junk.", "{n} conversations moved to Junk.");
      break;
    case "not_junk":
      await ctx.db.from("conversations").update({ is_junk: false }).in("id", mine);
      message = countText(n, "Moved to Inbox.", "{n} conversations moved to Inbox.");
      break;
    case "close":
    case "reopen":
      await ctx.db.from("conversations").update({ status: op === "close" ? "closed" : "open" }).in("id", mine);
      message = op === "close" ? countText(n, "Conversation closed.", "{n} conversations closed.") : countText(n, "Conversation reopened.", "{n} conversations reopened.");
      break;
    case "read":
      // Read is per person: opening it clears it for you, not for a colleague who hasn't looked yet.
      await ctx.db.from("conversation_reads").upsert(mine.map((id) => ({ conversation_id: id, user_id: ctx.user.id, last_read_at: now })));
      message = countText(n, "Marked as read.", "{n} conversations marked as read.");
      break;
    case "unread": {
      // Unread means the contact spoke last and it is open: only those can be marked.
      const eligible = rows.filter((r) => r.status === "open" && r.last_direction === "inbound" && r.last_inbound_at);
      if (eligible.length === 0) return { ok: false, error: "Only conversations waiting for your reply can be marked as unread." };
      await ctx.db.from("conversation_reads").upsert(eligible.map((r) => ({ conversation_id: r.id, user_id: ctx.user.id, last_read_at: new Date(new Date(r.last_inbound_at).getTime() - 1000).toISOString() })));
      message = countText(eligible.length, "Marked as unread.", "{n} conversations marked as unread.");
      break;
    }
    case "delete_forever": {
      const inBin = rows.filter((r) => r.trashed_at).map((r) => r.id as string);
      if (inBin.length === 0) return { ok: false, error: "Only conversations in the Bin can be deleted for good." };
      await purge(ctx, inBin);
      message = countText(inBin.length, "Deleted for good.", "{n} conversations deleted for good.");
      break;
    }
  }
  done();
  return { ok: true, message };
}

/** Empties the Bin: every conversation in it that this person may open is deleted for good. */
export async function emptyBinAction(): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.reply");
  const { data } = await ctx.db.from("conversations").select("id, owner_id, assigned_to").eq("workspace_id", ctx.workspace.id).not("trashed_at", "is", null).limit(500);
  const mine = ((data ?? []) as Record<string, any>[]).filter((r) => canSeeConversation(ctx.access, ctx.user.id, { ownerId: r.owner_id ?? null, assignedTo: r.assigned_to ?? null })).map((r) => r.id as string);
  if (mine.length === 0) return { ok: true, message: "The Bin is already empty." };
  await purge(ctx, mine);
  done();
  return { ok: true, message: "Bin emptied." };
}

/* ── Stars and reactions ───────────────────────────────────────────────────────
 * A star is personal: it is yours alone, like read state. A reaction is shared with the team in the thread and is
 * never sent to the contact. Anyone who can open a conversation may do both, whether or not they can reply. */

/** Stars or unstars conversations for this person. */
export async function setStarAction(input: { ids: string[]; starred: boolean }): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.view");
  const ids = Array.from(new Set((Array.isArray(input?.ids) ? input.ids : []).map(String).filter((i) => UUID_RE.test(i)))).slice(0, 100);
  if (ids.length === 0) return { ok: false, error: "Select something first." };
  const { data } = await ctx.db.from("conversations").select("id, owner_id, assigned_to").eq("workspace_id", ctx.workspace.id).in("id", ids);
  const mine = ((data ?? []) as Record<string, any>[])
    .filter((r) => canSeeConversation(ctx.access, ctx.user.id, { ownerId: r.owner_id ?? null, assignedTo: r.assigned_to ?? null }))
    .map((r) => r.id as string);
  if (mine.length === 0) return { ok: false, error: NOT_FOUND };
  if (input.starred) await ctx.db.from("conversation_stars").upsert(mine.map((id) => ({ conversation_id: id, user_id: ctx.user.id })));
  else await ctx.db.from("conversation_stars").delete().in("conversation_id", mine).eq("user_id", ctx.user.id);
  done();
  return { ok: true };
}

/** Adds your reaction to a message, or takes it back if it is already there. */
export async function toggleReactionAction(input: { messageId: string; emoji: string }): Promise<InboxActionResult> {
  const ctx = await requireWorkspace("/app/inbox", "inbox.view");
  const mid = String(input?.messageId ?? "");
  if (!UUID_RE.test(mid) || !isReactionEmoji(input?.emoji)) return { ok: false, error: "That didn’t work. Try again." };
  const { data: m } = await ctx.db.from("inbox_messages").select("id, conversation_id").eq("id", mid).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!m) return { ok: false, error: NOT_FOUND };
  const conv = await openConversation(ctx, m.conversation_id);
  if (!conv) return { ok: false, error: NOT_FOUND };

  const { data: existing } = await ctx.db.from("message_reactions").select("emoji").eq("message_id", mid).eq("user_id", ctx.user.id).eq("emoji", input.emoji).maybeSingle();
  if (existing) await ctx.db.from("message_reactions").delete().eq("message_id", mid).eq("user_id", ctx.user.id).eq("emoji", input.emoji);
  else {
    const { error } = await ctx.db.from("message_reactions").insert({ message_id: mid, user_id: ctx.user.id, emoji: input.emoji, workspace_id: ctx.workspace.id });
    if (error) return { ok: false, error: "That didn’t work. Try again." };
  }
  done();
  return { ok: true };
}