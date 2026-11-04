import { can, type Access } from "./access";
import { isBlockedFileName, nameProblem } from "./file-check";

/** What the inbox pages and actions share. Pure: it runs in the browser too, but only the server enforces it. */
export type ConversationStatus = "open" | "closed";

export type ConversationRow = {
  id: string;
  contactId: string | null;
  contactEmail: string;
  contactName: string;
  subject: string;
  kind: "campaign" | "direct";
  campaignId: string | null;
  campaignName: string | null;
  senderIdentityId: string | null;
  senderEmail: string | null;
  ownerId: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  status: ConversationStatus;
  /** For the person looking: the contact spoke last and they haven't opened it since. */
  unread: boolean;
  lastDirection: "inbound" | "outbound";
  lastMessageAt: string;
  lastInboundAt: string | null;
  snippet: string;
  /** How many messages the conversation holds (shown next to the name, like "me, lei 17"). */
  messageCount: number;
  /** In the Bin, or in Junk. */
  trashed: boolean;
  junk: boolean;
  /** Starred by the person looking. Stars are personal. */
  starred: boolean;
  /** The importance of the latest email we sent in it. */
  importance: Importance;
};

/** An email that has not gone out yet: a draft, or one scheduled for later. Private to the person who wrote it. */
export type DraftStatus = "draft" | "scheduled" | "sending" | "failed";
export type DraftRow = {
  id: string;
  contactId: string | null;
  contactEmail: string;
  contactName: string;
  contactStatus: string | null;
  identityId: string | null;
  subject: string;
  /** The first words of the message, for the list. */
  snippet: string;
  status: DraftStatus;
  scheduledAt: string | null;
  error: string | null;
  hasAttachments: boolean;
  updatedAt: string;
};
/** What the composer needs to open a draft. */
export type DraftFull = DraftRow & { body: string; attachments: AttachmentInfo[]; toEmails: string[]; ccEmails: string[]; bccEmails: string[]; importance: Importance };

export type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string | null;
  status: "sending" | "sent" | "delivered" | "bounced" | "complained" | "failed";
  error: string | null;
  auto: boolean;
  spam: boolean;
  attachments: AttachmentInfo[];
  /** The contact asked to be unsubscribed in this message, and was. */
  unsubscribeRequested: boolean;
  sentByName: string | null;
  createdAt: string;
  /** Copied and blind-copied addresses of an email we sent. */
  /** Other people the email was addressed to, besides the contact. */
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  importance: Importance;
  reactions: ReactionSummary[];
};

export type AttachmentInfo = { id: string; name: string; size: number; type: string; blocked: boolean; /** Why a file was not kept. */ reason?: string };

/** The part of a stored attachment list the browser may see: no storage path. */
export const publicAttachments = (list: unknown): AttachmentInfo[] =>
  (Array.isArray(list) ? list : []).map((a: any) => ({ id: String(a.id ?? ""), name: String(a.name ?? "attachment"), size: Number(a.size) || 0, type: String(a.type ?? ""), blocked: Boolean(a.blocked), ...(a.reason ? { reason: String(a.reason).slice(0, 200) } : {}) }));

export type SavedReply = { id: string; title: string; body: string };

/** Importance travels with an email as its Importance and X-Priority headers. */
export const IMPORTANCE_LEVELS = ["low", "normal", "high"] as const;
export type Importance = (typeof IMPORTANCE_LEVELS)[number];
export const toImportance = (v: unknown): Importance => (v === "high" || v === "low" ? v : "normal");

/** Reactions are internal: the team sees them in the thread, the contact never does. */
export const REACTION_EMOJIS = ["👍", "❤️", "😄", "🎉", "🙏", "👀"] as const;
export const isReactionEmoji = (v: unknown): v is (typeof REACTION_EMOJIS)[number] => REACTION_EMOJIS.some((e) => e === v);
export type ReactionSummary = { emoji: string; count: number; /** The person looking has used it. */ mine: boolean };

/** Other To addresses, Cc and Bcc together, per email. */
export const MAX_EXTRA_RECIPIENTS = 10;
const ADDRESS_RE = /^[^\s@<>"',;()[\]\\]+@[^\s@<>"',;()[\]\\]+\.[^\s@<>"',;()[\]\\]{2,}$/;

/** Reads a typed or pasted list of addresses ("a@x.com, Bo <b@y.com>") into lowercase, distinct addresses. */
export function parseAddressList(input: unknown): { list: string[] } | { error: string } {
  const out: string[] = [];
  for (const part of String(input ?? "").split(/[,;\n]+/)) {
    const t = part.trim();
    if (!t) continue;
    const angle = t.match(/<([^<>]+)>/);
    for (const token of angle ? [angle[1]] : t.split(/\s+/)) {
      const address = token.trim().toLowerCase();
      if (!address) continue;
      if (address.length > 254 || !ADDRESS_RE.test(address)) return { error: `“${token.trim().slice(0, 60)}” isn’t a valid email address.` };
      if (!out.includes(address)) out.push(address);
    }
  }
  if (out.length > MAX_EXTRA_RECIPIENTS) return { error: `Add at most ${MAX_EXTRA_RECIPIENTS} people to To, Cc and Bcc together.` };
  return { list: out };
}

/** Limits for files attached to an email. The total keeps the encoded message under the provider's 10 MB cap. */
export const ATTACHMENT_LIMITS = { files: 5, perFile: 5 * 1024 * 1024, total: 7 * 1024 * 1024 } as const;

/** Files that run programs, hide their type, or can't be looked into are never sent and never kept (see lib/file-check.ts). */
export { isBlockedFileName };

/** Why a set of files can't be attached, or null when they can. */
export function checkAttachmentSet(files: { name: string; size: number }[]): string | null {
  if (files.length > ATTACHMENT_LIMITS.files) return `Attach at most ${ATTACHMENT_LIMITS.files} files.`;
  let total = 0;
  for (const f of files) {
    if (f.size <= 0) return `${f.name} is empty.`;
    if (isBlockedFileName(f.name)) return nameProblem(f.name) ?? `${f.name} can’t be sent.`;
    if (f.size > ATTACHMENT_LIMITS.perFile) return `${f.name} is larger than 5 MB.`;
    total += f.size;
  }
  return total > ATTACHMENT_LIMITS.total ? "Attachments can add up to 7 MB at most." : null;
}

/** Fills a saved reply for one conversation. Unknown {{tokens}} are left as they are, so a typo stays visible. */
export function fillSavedReply(body: string, v: { firstName?: string | null; name?: string | null; myName?: string | null }): string {
  const first = (v.firstName ?? "").trim() || (v.name ?? "").trim().split(/\s+/)[0] || "there";
  return String(body ?? "")
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, (v.name ?? "").trim() || first)
    .replace(/\{\{\s*my_name\s*\}\}/gi, (v.myName ?? "").trim());
}

/** Unread for one person: the contact spoke last, the conversation is open, and they haven't opened it since. */
export function isUnreadFor(c: { status: string; lastDirection: string; lastInboundAt: string | null }, readAt: string | null): boolean {
  if (c.status !== "open" || c.lastDirection !== "inbound" || !c.lastInboundAt) return false;
  return !readAt || new Date(readAt).getTime() < new Date(c.lastInboundAt).getTime();
}

/**
 * The mail folders, in the order a mail program lists them: what needs attention first, the archive and the
 * rubbish last. The menu shows the first few and folds the rest behind "More". `compose` folders hold the
 * person's own unsent emails, so they are only offered to people who can write emails.
 */
export const INBOX_FOLDERS = [
  { key: "inbox", label: "Inbox", icon: "inbox", compose: false },
  { key: "unread", label: "Unread", icon: "mail", compose: false },
  { key: "sent", label: "Sent", icon: "send", compose: false },
  { key: "drafts", label: "Drafts", icon: "file", compose: true },
  { key: "scheduled", label: "Scheduled", icon: "clock", compose: true },
  { key: "read", label: "Read", icon: "mailopen", compose: false },
  { key: "all", label: "All mail", icon: "layers", compose: false },
  { key: "junk", label: "Junk", icon: "junk", compose: false },
  { key: "bin", label: "Bin", icon: "trash", compose: false },
] as const;
export type InboxFolder = (typeof INBOX_FOLDERS)[number]["key"];
export const DEFAULT_FOLDER: InboxFolder = "inbox";
export const isInboxFolder = (v: unknown): v is InboxFolder => INBOX_FOLDERS.some((f) => f.key === v);
export const folderLabel = (key: InboxFolder) => INBOX_FOLDERS.find((f) => f.key === key)?.label ?? "Inbox";
/** Folders that list drafts rather than conversations. */
export const isDraftFolder = (key: InboxFolder) => key === "drafts" || key === "scheduled";
/** How many folders the menu shows before "More". */
export const FOLDERS_SHOWN = 3;

/** Filters from the search box. "within" is a number of days. */
export const KIND_FILTERS = [{ key: "", label: "Any" }, { key: "campaign", label: "Campaign replies" }, { key: "direct", label: "Emails I sent" }] as const;
export const STATUS_FILTERS = [{ key: "", label: "Any" }, { key: "open", label: "Open" }, { key: "closed", label: "Closed" }] as const;
export const WITHIN_FILTERS = [{ key: "", label: "Any time" }, { key: "1", label: "Past day" }, { key: "7", label: "Past week" }, { key: "30", label: "Past month" }, { key: "365", label: "Past year" }] as const;
export const PAGE_SIZES = [20, 30, 50, 100] as const;

/**
 * Who may open a conversation: people with "see every conversation", the person who owns the address it was
 * sent from, and whoever it is assigned to. Everyone else gets nothing, not even its existence.
 */
export function canSeeConversation(access: Access | null | undefined, userId: string, c: { ownerId: string | null; assignedTo: string | null }): boolean {
  if (!access || !can(access, "inbox.view")) return false;
  if (can(access, "inbox.all")) return true;
  return c.ownerId === userId || c.assignedTo === userId;
}