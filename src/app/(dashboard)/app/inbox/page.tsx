import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Megaphone, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { NoAccess } from "@/components/dashboard/no-access";
import { ComposeButton, ComposeProvider } from "@/components/inbox/compose-window";
import { InboxSearch } from "@/components/inbox/inbox-search";
import { MailList, type ListConversation, type ListDraft } from "@/components/inbox/mail-list";
import { NumberedPager, RangePager } from "@/components/inbox/mail-pager";
import { MarkRead } from "@/components/inbox/mark-read";
import { ThreadView, type ThreadMessage } from "@/components/inbox/thread-view";
import { can } from "@/lib/access";
import { DEFAULT_FOLDER, PAGE_SIZES, folderLabel, isDraftFolder, isInboxFolder, type InboxFolder } from "@/lib/inbox";
import { agoLabel, gmailDate, listTime, scheduleTime } from "@/lib/inbox-format";
import { getAssignableMembers, getConversation, getConversations, getDrafts, getSavedReplies, getSendableIdentities, INBOX_PAGE, type ListQuery } from "@/lib/inbox-queries";
import { serverEnv } from "@/lib/env.server";
import { getContext } from "@/lib/workspace";
import { inboundEnabled } from "@/server/inbox/address";
import { cn } from "@/lib/utils";
import type { SearchParams } from "@/types";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WITHIN = ["1", "7", "30", "365"];

const TABS = [
  { key: "", label: "All", icon: Inbox },
  { key: "campaign", label: "Campaign replies", icon: Megaphone },
  { key: "direct", label: "Direct emails", icon: Send },
] as const;

const EMPTY: Record<InboxFolder, string> = {
  inbox: "You’re all caught up. Nothing is waiting in your Inbox.",
  unread: "No unread conversations.",
  sent: "You haven’t sent anything yet.",
  drafts: "No drafts. An email you start and don’t send is saved here.",
  scheduled: "No scheduled emails. Use the arrow beside Send to schedule one.",
  read: "Nothing here yet.",
  all: "No conversations yet. Replies to your campaigns appear here, and you can start one with Compose.",
  junk: "No junk. Messages the email provider flags as spam land here.",
  bin: "The Bin is empty.",
};

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  if (!can(ctx?.access, "inbox.view")) return <NoAccess title="Inbox" what="the inbox" />;
  const me = ctx!.user.id;
  const tz = ctx!.workspace?.timezone ?? "UTC";
  const canReply = can(ctx!.access, "inbox.reply");
  const canCompose = canReply && can(ctx!.access, "contacts.view");
  const canAssign = can(ctx!.access, "inbox.all") && canReply;
  const canSeeAll = can(ctx!.access, "inbox.all");

  const selectedId = searchParams.c && UUID_RE.test(searchParams.c) ? searchParams.c : null;
  let folder: InboxFolder = isInboxFolder(searchParams.folder) ? searchParams.folder : DEFAULT_FOLDER;
  // Drafts are for people who can write emails, and an open conversation always belongs to a conversation folder.
  if (isDraftFolder(folder) && (!canCompose || selectedId)) folder = DEFAULT_FOLDER;
  const draftMode = isDraftFolder(folder);

  const q = (searchParams.q ?? "").slice(0, 80);
  const mine = searchParams.mine === "1" && canSeeAll;
  const kind = searchParams.kind === "campaign" || searchParams.kind === "direct" ? searchParams.kind : "";
  const status = searchParams.status === "open" || searchParams.status === "closed" ? searchParams.status : "";
  const within = WITHIN.includes(searchParams.within ?? "") ? (searchParams.within as string) : "";
  const sizeParam = Number(searchParams.size);
  const size = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : INBOX_PAGE;
  const page = Math.max(1, Math.floor(Number(searchParams.page ?? 1)) || 1);

  const listQuery: ListQuery = { folder, q, mine, kind, status, within: within ? Number(within) : undefined, page, size };

  const [list, drafts, identities, savedReplies] = await Promise.all([
    draftMode ? Promise.resolve(null) : getConversations(ctx!, me, listQuery),
    draftMode ? getDrafts(ctx!, me, { folder: folder as "drafts" | "scheduled", q, page, size }) : Promise.resolve(null),
    canCompose ? getSendableIdentities(ctx!, me) : Promise.resolve([]),
    getSavedReplies(ctx!),
  ]);
  const myName = ctx!.user.fullName ?? "";
  const view = (draftMode ? drafts : list)!;

  const selected = selectedId ? await getConversation(ctx!, me, selectedId) : null;
  // A link to a conversation that is gone, or that this person may not open: back to the list.
  if (searchParams.c && !selected) redirect("/app/inbox");
  const members = selected && canAssign ? await getAssignableMembers(ctx!) : [];

  // "Email" on a contact opens the composer with that person chosen.
  let initialContact = null;
  if (canCompose && searchParams.compose && UUID_RE.test(searchParams.compose) && ctx!.db && ctx!.workspace) {
    const { data } = await ctx!.db.from("contacts").select("id, email, first_name, last_name, status").eq("id", searchParams.compose).eq("workspace_id", ctx!.workspace.id).maybeSingle();
    if (data) initialContact = { id: data.id as string, email: data.email as string, name: [data.first_name, data.last_name].filter(Boolean).join(" "), status: data.status as string };
  }

  /** A link to this same view with something changed. A value of undefined drops that part of the address. */
  const href = (extra: Record<string, string | undefined> = {}) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      folder: folder === DEFAULT_FOLDER ? undefined : folder, q: q || undefined, mine: mine ? "1" : undefined, kind: kind || undefined,
      status: status || undefined, within: within || undefined, size: size === INBOX_PAGE ? undefined : String(size), page: view.page > 1 ? String(view.page) : undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/inbox${s ? `?${s}` : ""}`;
  };
  const resetHref = `/app/inbox${folder === DEFAULT_FOLDER ? "" : `?folder=${folder}`}`;
  const now = new Date();
  const showSetupNotice = !inboundEnabled() && can(ctx!.access, "org.settings");

  const bar = (
    <div className="flex flex-wrap items-center gap-3">
      <InboxSearch folder={folder} q={q} status={status} within={within} mine={mine} canSeeAll={canSeeAll} size={size === INBOX_PAGE ? null : size} resetHref={resetHref} />
      {canCompose ? <ComposeButton className="ml-auto shrink-0" /> : null}
    </div>
  );

  let body;
  if (selected) {
    const c = selected.conversation;
    // Where this conversation sits in the list it was opened from: "2 of 5" and the arrows to its neighbours.
    let position: { label: string; prevHref: string | null; nextHref: string | null } | null = null;
    if (list) {
      const idx = list.rows.findIndex((r) => r.id === c.id);
      if (idx >= 0) {
        const absolute = (list.page - 1) * list.size + idx;
        const around = async (offset: number) => (offset < 0 || offset >= list.total ? null : (await getConversations(ctx!, me, { ...listQuery, offset, limit: 1 })).rows[0] ?? null);
        const [prev, next] = await Promise.all([idx > 0 ? Promise.resolve(list.rows[idx - 1]) : around(absolute - 1), idx < list.rows.length - 1 ? Promise.resolve(list.rows[idx + 1]) : around(absolute + 1)]);
        const pageOf = (offset: number) => String(Math.floor(offset / list.size) + 1);
        position = {
          label: `${absolute + 1} of ${list.total}`,
          prevHref: prev ? href({ c: prev.id, page: pageOf(absolute - 1) }) : null,
          nextHref: next ? href({ c: next.id, page: pageOf(absolute + 1) }) : null,
        };
      }
    }
    const replyBlocked = !canReply
      ? "Your role can read this conversation but not reply to it."
      : c.trashed
        ? "Restore this conversation from the Bin to reply."
        : !c.senderIdentityId
          ? "The address this conversation was sent from was removed, so it can’t be answered from here."
          : null;
    const messages: ThreadMessage[] = selected.messages.map((m) => ({ ...m, when: gmailDate(m.createdAt, tz, now), ago: agoLabel(m.createdAt, now) }));
    const named = searchParams.folder && isInboxFolder(searchParams.folder);
    const folderName = c.trashed ? "Bin" : c.junk ? "Junk" : named ? folderLabel(folder) : !c.lastInboundAt ? "Sent" : c.status === "open" ? "Inbox" : "All mail";
    body = (
      <>
        <MarkRead conversationId={c.id} unread={c.unread} />
        <ThreadView
          conversation={c}
          messages={messages}
          folderName={folderName}
          backHref={href({ c: undefined })}
          position={position}
          members={members}
          canAct={canReply}
          canMarkUnread={c.status === "open" && c.lastDirection === "inbound" && Boolean(c.lastInboundAt) && !c.trashed}
          canCompose={canCompose}
          replyBlocked={replyBlocked}
          replyFrom={c.senderEmail}
          canSimulate={serverEnv.sending.provider === "console" && inboundEnabled() && canReply}
          savedReplies={savedReplies}
          vars={{ firstName: c.contactName.split(/\s+/)[0] || null, name: c.contactName || null, myName }}
          replyTo={c.contactName ? `${c.contactName} <${c.contactEmail}>` : c.contactEmail}
          campaignHref={c.kind === "campaign" && c.campaignId ? `/app/campaigns/${c.campaignId}` : null}
          contactHref={c.contactId ? `/app/contacts?q=${encodeURIComponent(c.contactEmail)}` : null}
          popOutHref={`/app/inbox?c=${c.id}`}
        />
      </>
    );
  } else {
    const rows: ListConversation[] = (list?.rows ?? []).map((r) => ({ ...r, when: listTime(r.lastMessageAt, tz, now), href: href({ c: r.id }) }));
    const draftRows: ListDraft[] = (drafts?.rows ?? []).map((d) => ({ ...d, when: d.status !== "draft" && d.scheduledAt ? scheduleTime(d.scheduledAt, tz) : listTime(d.updatedAt, tz, now) }));
    const tabs = draftMode ? null : (
      <nav className="flex overflow-x-auto overflow-y-hidden border-b border-mist [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Type of conversation">
        {TABS.map((t) => {
          const active = t.key === kind;
          return (
            <Link
              key={t.key || "all"}
              href={href({ kind: t.key || undefined, page: undefined })}
              aria-current={active ? "page" : undefined}
              className={cn("-mb-px inline-flex h-12 shrink-0 items-center gap-3 border-b-[3px] px-4 text-sm font-semibold transition-colors sm:px-8", active ? "border-brand-700 text-brand-800" : "border-transparent text-ink-soft hover:bg-mist-50")}
            >
              <t.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    );
    body = (
      <Card className="overflow-hidden">
        <MailList
          folder={folder}
          rows={rows}
          drafts={draftRows}
          canAct={canReply}
          pager={<RangePager page={view.page} size={view.size} total={view.total} hrefFor={(n) => href({ page: n > 1 ? String(n) : undefined })} />}
          tabs={tabs}
          empty={q || kind || status || within || mine ? "No conversations match your search." : EMPTY[folder]}
        />
        <NumberedPager page={view.page} size={view.size} total={view.total} hrefFor={(n) => href({ page: n > 1 ? String(n) : undefined })} sizeHref={(n) => href({ size: n === INBOX_PAGE ? undefined : String(n), page: undefined })} />
      </Card>
    );
  }

  const content = (
    <div className="space-y-4">
      <h1 className="sr-only">{folderLabel(folder)}</h1>
      {showSetupNotice ? (
        <Card className="border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning sm:px-5">
          Replies can’t reach the inbox yet: no inbound domain is set up. Until then, replies go wherever they went before. The steps are in <span className="font-semibold">docs/inbox.md</span>.
        </Card>
      ) : null}
      {bar}
      {body}
    </div>
  );

  return canCompose ? (
    <ComposeProvider identities={identities} savedReplies={savedReplies} myName={myName} initialContact={initialContact} initialOpen={Boolean(initialContact)}>
      {content}
    </ComposeProvider>
  ) : content;
}