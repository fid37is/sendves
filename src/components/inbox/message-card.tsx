"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleAlert, CornerUpLeft, Ellipsis, MailMinus, MoreVertical, Paperclip, ShieldAlert, SmilePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { discardMessageAction, resendMessageAction, toggleReactionAction } from "@/app/(dashboard)/app/inbox/actions";
import { MailFrame } from "@/components/editor/mail-frame";
import { cn } from "@/lib/utils";
import { REACTION_EMOJIS, type MessageRow, type ReactionSummary } from "@/lib/inbox";
import { snippetOf, splitQuoted } from "@/server/inbox/text";

/**
 * Received HTML is untrusted. It is shown in a frame with no scripts, and this policy also stops it loading
 * anything from the internet, so a sender can't see when or where the email was opened.
 */
const frameDoc = (html: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{margin:0;padding:12px;font:14px/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;word-break:break-word}img{max-width:100%;height:auto}a{color:#1D4ED8}</style></head><body>${html}</body></html>`;

const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`);

const AVATARS = ["bg-emerald-800", "bg-sky-700", "bg-violet-700", "bg-amber-700", "bg-rose-700", "bg-teal-700", "bg-indigo-700", "bg-lime-800"];
const avatarColor = (seed: string) => AVATARS[Array.from(seed).reduce((n, c) => n + c.charCodeAt(0), 0) % AVATARS.length];

/** The round letter at the left of a message, like a mail program's picture. */
function Avatar({ name, seed, mine }: { name: string; seed: string; mine: boolean }) {
  return (
    <span aria-hidden="true" className={cn("flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full text-base font-medium text-white", mine ? "bg-brand-700" : avatarColor(seed))}>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/**
 * One message in a conversation, laid out like a mail program: collapsed it is a single line (picture, name,
 * the first words, the date); open it shows who it went to, the full date, and the message.
 */
export function MessageCard({
  message: m, when, ago, contactName, subject, canReply = false, expanded, onToggle, onReply,
}: {
  message: MessageRow;
  /** "Thu 22 Oct, 11:56". */
  when: string;
  /** "(12 days ago)". */
  ago: string;
  contactName: string;
  subject: string;
  canReply?: boolean;
  expanded: boolean;
  onToggle: () => void;
  /** Opens the reply box. Null when this person can't reply. */
  onReply: (() => void) | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const [formatted, setFormatted] = useState(false);
  const [details, setDetails] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reactions, setReactions] = useState<ReactionSummary[]>(m.reactions);
  const [picker, setPicker] = useState(false);
  const reactionKey = JSON.stringify(m.reactions);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setReactions(m.reactions), [reactionKey]);

  /** Adds or takes back your reaction. It shows at once and goes back if it could not be saved. */
  async function react(emoji: string) {
    setPicker(false);
    const before = reactions;
    const existing = before.find((r) => r.emoji === emoji);
    const next = existing
      ? before.map((r) => (r.emoji === emoji ? { ...r, count: r.count + (existing.mine ? -1 : 1), mine: !existing.mine } : r)).filter((r) => r.count > 0)
      : [...before, { emoji, count: 1, mine: true }];
    setReactions(next);
    try {
      const res = await toggleReactionAction({ messageId: m.id, emoji });
      if (!res.ok) { setReactions(before); return void toast.error(res.error ?? "That didn’t work. Try again."); }
      router.refresh();
    } catch (e) {
      setReactions(before);
      toast.fail("That didn’t work. Try again.", e);
    }
  }

  async function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusy(true);
    try {
      const res = await action();
      if (!res.ok) toast.error(res.error ?? "That didn’t work. Try again.");
      else if (res.message) toast.success(res.message);
      router.refresh();
    } catch (e) {
      toast.fail("That didn’t work. Try again.", e);
    } finally {
      setBusy(false);
    }
  }

  const inbound = m.direction === "inbound";
  const { body, quoted } = splitQuoted(m.text);
  const who = inbound ? m.fromName || contactName || m.fromEmail : m.sentByName || m.fromName || "You";
  const toName = inbound ? "me" : contactName || m.toEmail;
  const seed = inbound ? m.fromEmail : m.fromEmail || who;

  if (!expanded) {
    return (
      <article aria-label={`${inbound ? "Message from" : "Message sent by"} ${who}`}>
        <button type="button" onClick={onToggle} aria-expanded={false} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-mist-50 sm:px-5">
          <Avatar name={who} seed={seed} mine={!inbound} />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-bold text-ink">{who}</span>
            <span className="text-ink-muted"> {snippetOf(body || m.text) || "(no text)"}</span>
          </span>
          {m.attachments.length > 0 ? <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" aria-label="Has attachments" /> : null}
          {m.status === "failed" || m.status === "bounced" ? <Badge tone="danger">{m.status === "failed" ? "Not sent" : "Bounced"}</Badge> : null}
          <time className="hidden shrink-0 text-xs text-ink-muted sm:block">{when} {ago}</time>
          <time className="shrink-0 text-xs text-ink-muted sm:hidden">{when.split(",")[0]}</time>
        </button>
      </article>
    );
  }

  return (
    <article className="px-4 py-4 sm:px-5" aria-label={`${inbound ? "Message from" : "Message sent by"} ${who}`}>
      <header className="flex items-start gap-3">
        <button type="button" onClick={onToggle} aria-expanded aria-label="Collapse this message" className="rounded-full"><Avatar name={who} seed={seed} mine={!inbound} /></button>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <button type="button" onClick={onToggle} className="font-bold text-ink hover:underline">{who}</button>
            <span className="break-all text-xs text-ink-muted">&lt;{inbound ? m.fromEmail : m.fromEmail || who}&gt;</span>
          </p>
          <div className="relative">
            <button type="button" onClick={() => setDetails((v) => !v)} aria-expanded={details} className="inline-flex items-center gap-0.5 text-xs text-ink-muted hover:text-ink">
              to {toName}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {details ? (
              <dl className="absolute left-0 top-full z-10 mt-1 grid w-[min(22rem,calc(100vw-3rem))] grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 rounded-xl border border-mist bg-white p-3 text-xs shadow-xl">
                <dt className="text-ink-muted">from:</dt><dd className="break-all text-ink">{who} &lt;{m.fromEmail}&gt;</dd>
                <dt className="text-ink-muted">to:</dt><dd className="break-all text-ink">{inbound ? "me" : contactName ? `${contactName} <${m.toEmail}>` : m.toEmail}</dd>
                {m.toEmails.length > 0 ? <><dt className="text-ink-muted">also to:</dt><dd className="break-all text-ink">{m.toEmails.join(", ")}</dd></> : null}
                {m.ccEmails.length > 0 ? <><dt className="text-ink-muted">cc:</dt><dd className="break-all text-ink">{m.ccEmails.join(", ")}</dd></> : null}
                {m.bccEmails.length > 0 ? <><dt className="text-ink-muted">bcc:</dt><dd className="break-all text-ink">{m.bccEmails.join(", ")}</dd></> : null}
                <dt className="text-ink-muted">date:</dt><dd className="text-ink">{when}</dd>
                <dt className="text-ink-muted">subject:</dt><dd className="break-words text-ink">{subject || "(no subject)"}</dd>
              </dl>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <time className="mr-1 hidden whitespace-nowrap text-xs text-ink-muted sm:block">{when} {ago}</time>
          {onReply ? (
            <button type="button" onClick={onReply} title="Reply" aria-label="Reply" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-mist-100 hover:text-ink">
              <CornerUpLeft className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          ) : null}
          {inbound && m.html ? (
            <div className="relative">
              <button type="button" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} title="More" aria-label="More" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-mist-100 hover:text-ink">
                <MoreVertical className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
              {menu ? (
                <div role="menu" className="absolute right-0 top-full z-10 mt-1 w-56 rounded-xl border border-mist bg-white py-1 shadow-xl">
                  <button type="button" role="menuitem" onClick={() => { setFormatted((v) => !v); setMenu(false); }} className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-mist-100">
                    {formatted ? "Show as plain text" : "Show original formatting"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      <p className="mt-1 text-xs text-ink-muted sm:hidden">{when} {ago}</p>

      <div className="mt-3 sm:pl-[3.25rem]">
        <div className="flex flex-wrap items-center gap-2 empty:hidden">
          {m.auto ? <Badge tone="neutral">Automatic reply</Badge> : null}
          {m.importance === "high" ? <Badge tone="danger">High importance</Badge> : null}
          {m.importance === "low" ? <Badge tone="neutral">Low importance</Badge> : null}
          {m.status === "bounced" ? <Badge tone="danger">Bounced</Badge> : null}
          {m.status === "failed" ? <Badge tone="danger">Not sent</Badge> : null}
          {m.status === "complained" ? <Badge tone="danger">Marked as spam</Badge> : null}
          {!inbound && m.status === "delivered" ? <Badge tone="success">Delivered</Badge> : null}
        </div>

        {m.spam ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            The email provider flagged this message as possible spam. Be careful with links and attachments.
          </p>
        ) : null}

        {m.unsubscribeRequested ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-mist-100 px-3 py-2 text-xs font-medium text-ink-soft">
            <MailMinus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            They asked to unsubscribe. They have been unsubscribed and won’t get campaigns.
          </p>
        ) : null}

        {!inbound && (m.status === "failed" || m.status === "bounced") ? (
          <div className="mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-xs font-medium text-danger">
            <p className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {m.status === "failed" ? m.error ?? "This email wasn’t sent." : "This email bounced. If the address was wrong, correct the contact, then send it again."}
            </p>
            {canReply ? (
              <div className="mt-2 flex justify-end gap-2">
                {m.status === "failed" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => discardMessageAction(m.id))}>Discard</Button> : null}
                <Button size="sm" disabled={busy} loading={busy} onClick={() => run(() => resendMessageAction(m.id))}>Send again</Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {formatted && m.html ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-mist bg-white">
            <MailFrame doc={frameDoc(m.html)} title={`Message from ${who}, as sent`} />
          </div>
        ) : (
          <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{body || "(no text)"}</div>
        )}

        {!formatted && quoted ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowQuoted((v) => !v)}
              aria-expanded={showQuoted}
              aria-label={showQuoted ? "Hide earlier messages" : "Show earlier messages"}
              className="inline-flex h-6 items-center rounded-full bg-mist-100 px-2 text-ink-muted hover:bg-mist hover:text-ink"
            >
              <Ellipsis className="h-4 w-4" aria-hidden="true" />
            </button>
            {showQuoted ? <div className="mt-2 whitespace-pre-wrap break-words border-l-2 border-mist pl-3 text-xs leading-relaxed text-ink-muted">{quoted}</div> : null}
          </div>
        ) : null}

        {m.attachments.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2 border-t border-mist pt-3" aria-label="Attachments">
            {m.attachments.map((a, i) => (
              <li key={a.id || i}>
                {a.blocked ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-mist-100 px-2.5 py-1 text-xs text-ink-muted" title={a.reason ?? "Files that run programs, and files too large to keep, are listed but not stored"}>
                    <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="max-w-[14rem] truncate line-through">{a.name}</span>
                    <span>not kept</span>
                  </span>
                ) : (
                  <a href={`/api/inbox/attachments?m=${m.id}&a=${a.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-mist-100 px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-800">
                    <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="max-w-[14rem] truncate">{a.name}</span>
                    <span className="text-ink-muted">{size(a.size)}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Reactions">
          {reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              onClick={() => void react(r.emoji)}
              aria-pressed={r.mine}
              aria-label={`${r.emoji} ${r.count}${r.mine ? ", you reacted. Select to take it back" : ""}`}
              className={cn("inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-semibold transition-colors", r.mine ? "border-brand-500 bg-brand-50 text-brand-800" : "border-mist bg-white text-ink-soft hover:bg-mist-100")}
            >
              <span aria-hidden="true">{r.emoji}</span>
              <span>{r.count}</span>
            </button>
          ))}
          <div className="relative">
            <button type="button" onClick={() => setPicker((v) => !v)} aria-haspopup="menu" aria-expanded={picker} title="Add reaction" aria-label="Add reaction" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-mist-100 hover:text-ink">
              <SmilePlus className="h-4 w-4" aria-hidden="true" />
            </button>
            {picker ? (
              <div role="menu" aria-label="Choose a reaction" className="absolute bottom-full left-0 z-10 mb-1 flex gap-0.5 rounded-full border border-mist bg-white p-1 shadow-xl">
                {REACTION_EMOJIS.map((e) => (
                  <button key={e} type="button" role="menuitem" onClick={() => void react(e)} aria-label={`React with ${e}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-lg transition-colors hover:bg-mist-100">{e}</button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}