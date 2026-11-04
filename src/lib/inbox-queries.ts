/**
 * Read queries for the inbox. Like the other read queries, they use the service-role client, so the rules about
 * who may see a conversation are applied HERE, in the query itself (not only in the page): a person without
 * "see every conversation" only ever gets conversations they own or that are assigned to them.
 */
import type { ScopeCtx as Ctx } from "@/lib/workspace";
import { can } from "@/lib/access";
import { isDraftFolder, isUnreadFor, publicAttachments, toImportance, type ConversationRow, type DraftFull, type DraftRow, type InboxFolder, type MessageRow, type ReactionSummary, type SavedReply } from "@/lib/inbox";
import { snippetOf } from "@/server/inbox/text";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INBOX_PAGE = 30;
const DAY_MS = 86_400_000;

const CONVERSATION_COLUMNS =
  "id, contact_id, contact_email, contact_name, subject, kind, campaign_id, sender_identity_id, owner_id, assigned_to, status, last_direction, last_message_at, last_inbound_at, snippet, campaigns(name), sender_identities(email), conversation_reads(last_read_at), trashed_at, is_junk, importance, conversation_stars(user_id)";

/** Limits a conversations query to what this person may open. */
function visible<T>(query: T, ctx: Ctx, userId: string): T {
  if (!can(ctx.access, "inbox.view")) return (query as any).eq("id", "00000000-0000-0000-0000-000000000000") as T;
  if (can(ctx.access, "inbox.all")) return query;
  return (query as any).or(`owner_id.eq.${userId},assigned_to.eq.${userId}`) as T;
}

async function nameMap(ctx: Ctx, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((i): i is string => !!i && UUID_RE.test(i))));
  if (!ctx.db || unique.length === 0) return new Map();
  const { data } = await ctx.db.from("profiles").select("id, full_name, email").in("id", unique);
  return new Map(((data ?? []) as any[]).map((p) => [p.id as string, (p.full_name as string) || (p.email as string) || ""]));
}

const toConversation = (r: any, names: Map<string, string>, messageCount = 0): ConversationRow => ({
  id: r.id, contactId: r.contact_id ?? null, contactEmail: r.contact_email, contactName: r.contact_name ?? "", subject: r.subject ?? "",
  kind: r.kind === "campaign" ? "campaign" : "direct", campaignId: r.campaign_id ?? null, campaignName: r.campaigns?.name ?? null,
  senderIdentityId: r.sender_identity_id ?? null, senderEmail: r.sender_identities?.email ?? null,
  ownerId: r.owner_id ?? null, assignedTo: r.assigned_to ?? null, assignedName: r.assigned_to ? names.get(r.assigned_to) ?? null : null,
  status: r.status === "closed" ? "closed" : "open", lastDirection: r.last_direction === "inbound" ? "inbound" : "outbound",
  unread: isUnreadFor(
    { status: r.status, lastDirection: r.last_direction, lastInboundAt: r.last_inbound_at ?? null },
    // The query only embeds THIS person's read row, so whatever is there is theirs.
    Array.isArray(r.conversation_reads) ? r.conversation_reads[0]?.last_read_at ?? null : null,
  ),
  lastMessageAt: r.last_message_at, lastInboundAt: r.last_inbound_at ?? null, snippet: r.snippet ?? "",
  messageCount, trashed: Boolean(r.trashed_at), junk: Boolean(r.is_junk),
  // The query only embeds THIS person's star row, so any row there is theirs.
  starred: Array.isArray(r.conversation_stars) && r.conversation_stars.length > 0, importance: toImportance(r.importance),
});

const emails = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** The reactions on these messages, grouped by emoji, with whether the person looking used each one. */
async function reactionsFor(ctx: Ctx, ids: string[], userId: string): Promise<Map<string, ReactionSummary[]>> {
  const out = new Map<string, ReactionSummary[]>();
  if (!ctx.db || ids.length === 0) return out;
  const { data } = await ctx.db.from("message_reactions").select("message_id, user_id, emoji").in("message_id", ids).order("created_at", { ascending: true }).limit(5000);
  for (const r of (data ?? []) as { message_id: string; user_id: string; emoji: string }[]) {
    const list = out.get(r.message_id) ?? [];
    let entry = list.find((x) => x.emoji === r.emoji);
    if (!entry) { entry = { emoji: r.emoji, count: 0, mine: false }; list.push(entry); }
    entry.count += 1;
    if (r.user_id === userId) entry.mine = true;
    out.set(r.message_id, list);
  }
  return out;
}

/** How many messages each of these conversations holds. One query for the whole page. */
async function messageCounts(ctx: Ctx, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ctx.db || ids.length === 0) return out;
  const { data } = await ctx.db.from("inbox_messages").select("conversation_id").in("conversation_id", ids).limit(5000);
  for (const m of (data ?? []) as { conversation_id: string }[]) out.set(m.conversation_id, (out.get(m.conversation_id) ?? 0) + 1);
  return out;
}

/** Just the unread number, for the sidebar: it runs on every page, so it is one cheap call. Unread is per person. */
export async function getUnreadCount(ctx: Ctx, userId: string): Promise<number> {
  if (!ctx.db || !ctx.workspace || !can(ctx.access, "inbox.view")) return 0;
  const { count, error } = await ctx.db.rpc("inbox_unread", { p_workspace: ctx.workspace.id, p_user: userId, p_all: can(ctx.access, "inbox.all") }, { count: "exact", head: true });
  return error ? 0 : count ?? 0;
}

/** The numbers shown in the menu: unread conversations, and the person's own drafts. Two cheap counts, on every page. */
export async function getMailboxBadges(ctx: Ctx, userId: string): Promise<{ unread: number; drafts: number }> {
  if (!ctx.db || !ctx.workspace || !can(ctx.access, "inbox.view")) return { unread: 0, drafts: 0 };
  const unread = await getUnreadCount(ctx, userId);
  if (!can(ctx.access, "inbox.reply")) return { unread, drafts: 0 };
  const { count } = await ctx.db.from("inbox_drafts").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).eq("user_id", userId).eq("status", "draft");
  return { unread, drafts: count ?? 0 };
}

export type ListQuery = {
  folder: InboxFolder;
  q?: string;
  /** Someone who can see everything can narrow it to what is theirs. */
  mine?: boolean;
  kind?: "campaign" | "direct" | "";
  status?: "open" | "closed" | "";
  /** Only conversations with a message in the last N days. */
  within?: number;
  page?: number;
  size?: number;
  /** For one neighbouring row (the "2 of 5" arrows): start here and return at most `limit` rows. Overrides page and size. */
  offset?: number;
  limit?: number;
};
export type ListResult = { rows: ConversationRow[]; total: number; page: number; size: number };

const cleanTerm = (q: string | undefined) => (q ?? "").replace(/[^\p{L}\p{N}@.+_\- ]/gu, "").trim().slice(0, 80);

export async function getConversations(ctx: Ctx, userId: string, opts: ListQuery): Promise<ListResult> {
  const size = Math.min(100, Math.max(1, opts.size ?? INBOX_PAGE));
  const page = Math.max(1, opts.page ?? 1);
  const from = opts.offset ?? (page - 1) * size;
  const count = opts.limit ?? size;
  const empty = { rows: [], total: 0, page, size };
  if (!ctx.db || !ctx.workspace || !can(ctx.access, "inbox.view") || isDraftFolder(opts.folder)) return empty;

  const term = cleanTerm(opts.q);
  const mine = Boolean(opts.mine) && can(ctx.access, "inbox.all");
  const since = opts.within && opts.within > 0 ? new Date(Date.now() - opts.within * DAY_MS).toISOString() : null;
  let data: any[] = [];
  let total = 0;

  if (opts.folder === "unread" || opts.folder === "read") {
    // Unread is per person, so the database works out the page (see inbox_page in migration 0013).
    const { data: ids } = await ctx.db.rpc("inbox_page", {
      p_workspace: ctx.workspace.id, p_user: userId, p_all: can(ctx.access, "inbox.all"), p_mode: opts.folder,
      p_q: term || null, p_mine: mine, p_kind: opts.kind || null, p_status: opts.status || null, p_since: since, p_limit: count, p_offset: from,
    });
    const found = (ids ?? []) as { id: string; total: number | string }[];
    total = found.length ? Number(found[0].total) : 0;
    if (found.length) {
      const order = found.map((f) => f.id);
      const { data: rows } = await ctx.db.from("conversations").select(CONVERSATION_COLUMNS).eq("workspace_id", ctx.workspace.id).in("id", order).eq("conversation_reads.user_id", userId).eq("conversation_stars.user_id", userId);
      const byId = new Map(((rows ?? []) as any[]).map((r) => [r.id as string, r]));
      data = order.map((id) => byId.get(id)).filter(Boolean);
    }
  } else {
    // Sent: a conversation that holds at least one email from us.
    const columns = opts.folder === "sent" ? `${CONVERSATION_COLUMNS}, inbox_messages!inner(id)` : CONVERSATION_COLUMNS;
    let q: any = visible(ctx.db.from("conversations").select(columns, { count: "exact" }).eq("workspace_id", ctx.workspace.id).eq("conversation_reads.user_id", userId).eq("conversation_stars.user_id", userId), ctx, userId);
    if (opts.folder === "bin") q = q.not("trashed_at", "is", null);
    else {
      q = q.is("trashed_at", null).eq("is_junk", opts.folder === "junk");
      if (opts.folder === "inbox") q = q.eq("status", "open").not("last_inbound_at", "is", null);
      if (opts.folder === "sent") q = q.eq("inbox_messages.direction", "outbound").in("inbox_messages.status", ["sent", "delivered", "bounced", "complained"]);
    }
    if (mine) q = q.or(`owner_id.eq.${userId},assigned_to.eq.${userId}`);
    if (opts.kind) q = q.eq("kind", opts.kind);
    if (opts.status) q = q.eq("status", opts.status);
    if (since) q = q.gte("last_message_at", since);
    if (term) q = q.or(`contact_email.ilike.%${term}%,contact_name.ilike.%${term}%,subject.ilike.%${term}%`);
    const res = await q.order("last_message_at", { ascending: false }).range(from, from + count - 1);
    data = (res.data ?? []) as any[];
    total = res.count ?? 0;
  }

  // A page that is past the end (rows were removed meanwhile): show the first one instead.
  if (data.length === 0 && total === 0 && from > 0 && opts.offset === undefined) return getConversations(ctx, userId, { ...opts, page: 1 });

  const [names, counts] = await Promise.all([nameMap(ctx, data.map((r) => r.assigned_to)), messageCounts(ctx, data.map((r) => r.id))]);
  return { rows: data.map((r) => toConversation(r, names, counts.get(r.id) ?? 0)), total, page, size };
}

const DRAFT_COLUMNS = "id, contact_id, identity_id, subject, body, attachments, to_emails, cc_emails, bcc_emails, importance, status, scheduled_at, error, updated_at, contacts(email, first_name, last_name, status)";

const toDraft = (r: any): DraftRow => {
  const c = r.contacts ?? null;
  return {
    id: r.id, contactId: r.contact_id ?? null, contactEmail: c?.email ?? (r.contact_id ? "" : emails(r.to_emails)[0] ?? ""), contactName: c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "",
    contactStatus: c?.status ?? null, identityId: r.identity_id ?? null, subject: r.subject ?? "", snippet: snippetOf(r.body ?? ""),
    status: r.status, scheduledAt: r.scheduled_at ?? null, error: r.error ?? null,
    hasAttachments: Array.isArray(r.attachments) && r.attachments.length > 0, updatedAt: r.updated_at,
  };
};

/** The person's own unsent emails. Drafts are private: nobody else sees them, whatever their role. */
export async function getDrafts(
  ctx: Ctx, userId: string, opts: { folder: "drafts" | "scheduled"; q?: string; page?: number; size?: number },
): Promise<{ rows: DraftRow[]; total: number; page: number; size: number }> {
  const size = Math.min(100, Math.max(1, opts.size ?? INBOX_PAGE));
  const page = Math.max(1, opts.page ?? 1);
  if (!ctx.db || !ctx.workspace || !can(ctx.access, "inbox.reply")) return { rows: [], total: 0, page, size };
  let q: any = ctx.db.from("inbox_drafts").select(DRAFT_COLUMNS, { count: "exact" }).eq("workspace_id", ctx.workspace.id).eq("user_id", userId);
  q = opts.folder === "drafts" ? q.eq("status", "draft") : q.in("status", ["scheduled", "sending", "failed"]);
  const term = cleanTerm(opts.q);
  if (term) q = q.or(`subject.ilike.%${term}%,body.ilike.%${term}%`);
  q = opts.folder === "scheduled" ? q.order("scheduled_at", { ascending: true }) : q.order("updated_at", { ascending: false });
  const { data, count } = await q.range((page - 1) * size, page * size - 1);
  if (!data?.length && (count ?? 0) === 0 && page > 1) return getDrafts(ctx, userId, { ...opts, page: 1 });
  return { rows: ((data ?? []) as any[]).map(toDraft), total: count ?? 0, page, size };
}

/** One draft, with its words, for the composer. Only its author can open it. */
export async function getDraft(ctx: Ctx, userId: string, id: string): Promise<DraftFull | null> {
  if (!ctx.db || !ctx.workspace || !UUID_RE.test(id) || !can(ctx.access, "inbox.reply")) return null;
  const { data } = await ctx.db.from("inbox_drafts").select(DRAFT_COLUMNS).eq("id", id).eq("workspace_id", ctx.workspace.id).eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const r = data as any;
  return { ...toDraft(r), body: r.body ?? "", attachments: publicAttachments(r.attachments), toEmails: emails(r.to_emails), ccEmails: emails(r.cc_emails), bccEmails: emails(r.bcc_emails), importance: toImportance(r.importance) };
}

export async function getConversation(ctx: Ctx, userId: string, id: string): Promise<{ conversation: ConversationRow; messages: MessageRow[] } | null> {
  if (!ctx.db || !ctx.workspace || !UUID_RE.test(id) || !can(ctx.access, "inbox.view")) return null;
  const { data } = await visible(ctx.db.from("conversations").select(CONVERSATION_COLUMNS).eq("workspace_id", ctx.workspace.id).eq("id", id).eq("conversation_reads.user_id", userId).eq("conversation_stars.user_id", userId), ctx, userId).maybeSingle();
  if (!data) return null;
  const { data: msgs } = await ctx.db.from("inbox_messages")
    .select("id, direction, from_email, from_name, to_email, subject, text_body, html_body, status, error, auto, spam, attachments, unsubscribe_requested, sent_by, created_at, to_emails, cc_emails, bcc_emails, importance")
    .eq("conversation_id", id).order("created_at", { ascending: true }).limit(200);
  const rows = (msgs ?? []) as any[];
  const names = await nameMap(ctx, [(data as any).assigned_to, ...rows.map((m) => m.sent_by)]);
  const reactions = await reactionsFor(ctx, rows.map((m) => m.id), userId);
  return {
    conversation: toConversation(data, names, rows.length),
    messages: rows.map((m) => ({
      id: m.id, direction: m.direction, fromEmail: m.from_email, fromName: m.from_name ?? "", toEmail: m.to_email ?? "", subject: m.subject ?? "",
      text: m.text_body ?? "", html: m.html_body ?? null, status: m.status, error: m.error ?? null, auto: Boolean(m.auto), spam: Boolean(m.spam),
      attachments: publicAttachments(m.attachments), unsubscribeRequested: Boolean(m.unsubscribe_requested), sentByName: m.sent_by ? names.get(m.sent_by) ?? null : null, createdAt: m.created_at,
      toEmails: emails(m.to_emails), ccEmails: emails(m.cc_emails), bccEmails: emails(m.bcc_emails), importance: toImportance(m.importance), reactions: reactions.get(m.id) ?? [],
    })),
  };
}

/** Active members a conversation can be handed to (only offered to people who may assign). */
export async function getAssignableMembers(ctx: Ctx): Promise<{ id: string; name: string }[]> {
  if (!ctx.db || !ctx.workspace || !can(ctx.access, "inbox.all")) return [];
  const { data } = await ctx.db.from("workspace_members").select("user_id").eq("workspace_id", ctx.workspace.id).eq("status", "active");
  const ids = ((data ?? []) as { user_id: string }[]).map((m) => m.user_id);
  const names = await nameMap(ctx, ids);
  return ids.map((id) => ({ id, name: names.get(id) || "Team member" })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The addresses the person can send from: active, on a domain that passes DKIM, SPF and DMARC. */
export async function getSendableIdentities(ctx: Ctx, userId: string): Promise<{ id: string; email: string; fromName: string; kind: "primary" | "alias" }[]> {
  if (!ctx.db || !ctx.workspace) return [];
  const { data } = await ctx.db.from("sender_identities")
    .select("id, email, from_name, kind, status, sending_domains(status, dkim_ok, spf_ok, dmarc_ok)")
    .eq("workspace_id", ctx.workspace.id).eq("user_id", userId).eq("status", "active");
  return ((data ?? []) as any[])
    .filter((r) => r.sending_domains?.status === "verified" && r.sending_domains.dkim_ok && r.sending_domains.spf_ok && r.sending_domains.dmarc_ok)
    .map((r) => ({ id: r.id as string, email: r.email as string, fromName: r.from_name as string, kind: (r.kind === "primary" ? "primary" : "alias") as "primary" | "alias" }))
    .sort((a, b) => (a.kind === b.kind ? a.email.localeCompare(b.email) : a.kind === "primary" ? -1 : 1));
}

/** Saved replies are shared by the organization. */
export async function getSavedReplies(ctx: Ctx): Promise<SavedReply[]> {
  if (!ctx.db || !ctx.workspace || !can(ctx.access, "inbox.reply")) return [];
  const { data } = await ctx.db.from("saved_replies").select("id, title, body").eq("workspace_id", ctx.workspace.id).order("title", { ascending: true }).limit(100);
  return ((data ?? []) as SavedReply[]).map((r) => ({ id: r.id, title: r.title, body: r.body }));
}