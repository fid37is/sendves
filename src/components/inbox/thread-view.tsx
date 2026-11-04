"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsDownUp, ChevronsUpDown, CornerUpLeft, CornerUpRight, ExternalLink, Printer, X } from "lucide-react";
import { bulkConversationsAction } from "@/app/(dashboard)/app/inbox/actions";
import { useCompose } from "@/components/inbox/compose-window";
import { MessageCard } from "@/components/inbox/message-card";
import { ReplyBox } from "@/components/inbox/reply-box";
import { ThreadToolbar } from "@/components/inbox/thread-controls";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { ConversationRow, MessageRow, SavedReply } from "@/lib/inbox";

export type ThreadMessage = MessageRow & { when: string; ago: string };

const pill = "inline-flex h-9 items-center gap-2 rounded-full border border-ink-muted/40 bg-white px-5 text-sm font-semibold text-ink-soft transition-colors hover:bg-mist-100 hover:text-ink";
const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-mist-100 hover:text-ink";

/** Hidden messages are folded into one circle once a conversation has this many. */
const FOLD_FROM = 5;

/**
 * An open conversation, laid out like a mail program: the toolbar, the subject, then the messages. The first
 * message and the last two stay in view; everything in between is folded into a numbered circle that opens
 * them all. Only the newest message starts open.
 */
export function ThreadView({
  conversation: c, messages, folderName, backHref, position, members, canAct, canMarkUnread, canCompose,
  replyBlocked, replyFrom, canSimulate, savedReplies, vars, replyTo, campaignHref, contactHref, popOutHref,
}: {
  conversation: ConversationRow;
  messages: ThreadMessage[];
  /** The label beside the subject: Inbox, Sent, Bin… */
  folderName: string;
  backHref: string;
  position: { label: string; prevHref: string | null; nextHref: string | null } | null;
  members: { id: string; name: string }[];
  canAct: boolean;
  canMarkUnread: boolean;
  /** Can start a new email (needed to forward). */
  canCompose: boolean;
  replyBlocked: string | null;
  replyFrom: string | null;
  canSimulate: boolean;
  savedReplies: SavedReply[];
  vars: { firstName?: string | null; name?: string | null; myName?: string | null };
  replyTo: string;
  campaignHref: string | null;
  contactHref: string | null;
  popOutHref: string;
}) {
  const router = useRouter();
  const compose = useCompose();
  const n = messages.length;
  const lastId = messages[n - 1]?.id;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [folded, setFolded] = useState(n >= FOLD_FROM);
  const [replying, setReplying] = useState(false);
  const [busy, setBusy] = useState(false);
  const replyRef = useRef<HTMLDivElement>(null);

  const isOpen = (m: ThreadMessage) => open[m.id] ?? m.id === lastId;
  const allOpen = messages.every(isOpen);
  const hiddenFrom = 1;
  const hiddenTo = n - 3; // indexes hiddenFrom..hiddenTo are folded
  const hiddenCount = folded && n >= FOLD_FROM ? hiddenTo - hiddenFrom + 1 : 0;

  function toggleAll() {
    setFolded(false);
    setOpen(Object.fromEntries(messages.map((m) => [m.id, !allOpen ? true : m.id === lastId])));
  }

  function openReply() {
    setReplying(true);
    setTimeout(() => replyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  function forward() {
    const m = messages[n - 1];
    if (!m || !compose) return;
    const subject = c.subject || "";
    const from = m.direction === "inbound" ? `${m.fromName || c.contactName || m.fromEmail} <${m.fromEmail}>` : `${m.sentByName || m.fromName || "Me"} <${m.fromEmail}>`;
    compose.open({
      subject: /^fwd?:/i.test(subject) ? subject : `Fwd: ${subject}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${from}\nDate: ${m.when}\nSubject: ${subject}\nTo: ${m.direction === "inbound" ? "me" : m.toEmail}\n\n${m.text}`,
    });
  }

  async function restore() {
    setBusy(true);
    try {
      const res = await bulkConversationsAction({ ids: [c.id], op: c.trashed ? "restore" : "not_junk" });
      if (!res.ok) return void toast.error(res.error ?? "That didn’t work. Try again.");
      toast.success(res.message ?? "Done.");
      router.refresh();
    } catch (e) {
      toast.fail("That didn’t work. Try again.", e);
    } finally {
      setBusy(false);
    }
  }

  const card = (m: ThreadMessage) => (
    <MessageCard
      key={m.id}
      message={m}
      when={m.when}
      ago={m.ago}
      contactName={c.contactName}
      subject={c.subject}
      canReply={canAct}
      expanded={isOpen(m)}
      onToggle={() => setOpen((cur) => ({ ...cur, [m.id]: !isOpen(m) }))}
      onReply={replyBlocked ? null : openReply}
    />
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-mist bg-white" aria-label={`Conversation: ${c.subject || "(no subject)"}`}>
      <ThreadToolbar
        conversationId={c.id}
        status={c.status}
        trashed={c.trashed}
        junk={c.junk}
        assignedTo={c.assignedTo}
        members={members}
        canAct={canAct}
        canMarkUnread={canMarkUnread}
        backHref={backHref}
        position={position}
      />

      {c.trashed || c.junk ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mist bg-warning-soft px-4 py-2.5 text-sm font-medium text-warning sm:px-5">
          <span>{c.trashed ? "This conversation is in the Bin. Restore it to reply." : "This conversation is in Junk."}</span>
          {canAct ? <Button size="sm" variant="outline" onClick={restore} loading={busy}>{c.trashed ? "Restore" : "Not junk"}</Button> : null}
        </div>
      ) : null}

      <div className="flex items-start gap-3 px-4 pb-2 pt-4 sm:px-5 sm:pl-[4.25rem]">
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[1.375rem] font-normal leading-7 text-ink">
            <span className="break-words">{c.subject || "(no subject)"}</span>
            <Link href={backHref} className="inline-flex items-center gap-1 rounded bg-mist px-1.5 text-xs font-medium leading-5 text-ink-soft hover:bg-mist-100" title={`Back to ${folderName}`}>
              {folderName}
              <X className="h-3 w-3" aria-label="Close this conversation view" />
            </Link>
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {c.kind === "campaign" && c.campaignName ? (campaignHref ? <Link href={campaignHref} className="font-semibold text-brand-800 hover:underline">Reply to {c.campaignName}</Link> : <span>Reply to {c.campaignName}</span>) : null}
            {c.senderEmail ? <span>via {c.senderEmail}</span> : null}
            {contactHref ? <Link href={contactHref} className="font-semibold text-brand-800 hover:underline">View contact</Link> : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={toggleAll} className={iconBtn} title={allOpen ? "Collapse all" : "Expand all"} aria-label={allOpen ? "Collapse all messages" : "Expand all messages"}>
            {allOpen ? <ChevronsDownUp className="h-[18px] w-[18px]" aria-hidden="true" /> : <ChevronsUpDown className="h-[18px] w-[18px]" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => window.print()} className={`${iconBtn} hidden sm:inline-flex`} title="Print all" aria-label="Print all"><Printer className="h-[18px] w-[18px]" aria-hidden="true" /></button>
          <a href={popOutHref} target="_blank" rel="noreferrer" className={`${iconBtn} hidden sm:inline-flex`} title="In new window" aria-label="Open in a new window"><ExternalLink className="h-[18px] w-[18px]" aria-hidden="true" /></a>
        </div>
      </div>

      <div className="divide-y divide-mist/70 border-t border-mist/70">
        {messages.map((m, i) => {
          if (hiddenCount > 0 && i >= hiddenFrom && i <= hiddenTo) {
            // The folded stretch: one circle stands in for all of it.
            return i === hiddenFrom ? (
              <div key="fold" className="flex items-center px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => setFolded(false)}
                  aria-label={`Show ${hiddenCount} more messages`}
                  title={`Show ${hiddenCount} more messages`}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-mist bg-white text-xs font-medium text-ink-soft transition-colors hover:bg-mist-100 hover:text-ink"
                >
                  {hiddenCount}
                </button>
                <span className="ml-3 hidden h-px flex-1 bg-mist sm:block" aria-hidden="true" />
              </div>
            ) : null;
          }
          return card(m);
        })}
      </div>

      <div ref={replyRef} className="px-4 pb-6 pt-4 sm:pl-[4.25rem] sm:pr-5">
        {replyBlocked ? (
          <ReplyBox conversationId={c.id} from={replyFrom} blocked={replyBlocked} canSimulate={false} savedReplies={[]} vars={{}} to={replyTo} />
        ) : replying ? (
          <ReplyBox conversationId={c.id} from={replyFrom} blocked={null} canSimulate={canSimulate} savedReplies={savedReplies} vars={vars} to={replyTo} onClose={() => setReplying(false)} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {canAct ? <button type="button" onClick={openReply} className={pill}><CornerUpLeft className="h-4 w-4" aria-hidden="true" />Reply</button> : null}
            {canCompose ? <button type="button" onClick={forward} className={pill}><CornerUpRight className="h-4 w-4" aria-hidden="true" />Forward</button> : null}
          </div>
        )}
      </div>
    </section>
  );
}