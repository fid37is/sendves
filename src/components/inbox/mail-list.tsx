"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ChevronDown, CircleAlert, Clock, Inbox, Mail, MailOpen, MoreVertical, Paperclip, RefreshCw, RotateCcw, ShieldAlert, Star, Trash2, type LucideIcon } from "lucide-react";
import { bulkConversationsAction, bulkDraftsAction, emptyBinAction, setStarAction, type BulkOp } from "@/app/(dashboard)/app/inbox/actions";
import { useCompose } from "@/components/inbox/compose-window";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { isDraftFolder, type ConversationRow, type DraftRow, type InboxFolder } from "@/lib/inbox";

export type ListConversation = ConversationRow & { when: string; href: string };
export type ListDraft = DraftRow & { when: string };

type Act = { op: BulkOp | "discard" | "unschedule"; label: string; icon: LucideIcon; danger?: boolean };

const ACT = {
  close: { op: "close", label: "Close conversation", icon: Archive },
  reopen: { op: "reopen", label: "Reopen conversation", icon: ArchiveRestore },
  junk: { op: "junk", label: "Report junk", icon: ShieldAlert },
  notJunk: { op: "not_junk", label: "Not junk", icon: Inbox },
  trash: { op: "trash", label: "Move to Bin", icon: Trash2 },
  restore: { op: "restore", label: "Restore", icon: RotateCcw },
  forever: { op: "delete_forever", label: "Delete forever", icon: Trash2, danger: true },
  read: { op: "read", label: "Mark as read", icon: MailOpen },
  unread: { op: "unread", label: "Mark as unread", icon: Mail },
  discard: { op: "discard", label: "Discard", icon: Trash2, danger: true },
  unschedule: { op: "unschedule", label: "Cancel schedule", icon: RotateCcw },
} satisfies Record<string, Act>;

const iconBtn = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-mist-100 hover:text-ink disabled:pointer-events-none disabled:opacity-50";

/** What can be done to the selected conversations in this folder. */
function bulkActs(folder: InboxFolder): Act[] {
  if (folder === "bin") return [ACT.restore, ACT.forever];
  if (folder === "junk") return [ACT.notJunk, ACT.trash];
  if (folder === "drafts") return [ACT.discard];
  if (folder === "scheduled") return [ACT.unschedule, ACT.discard];
  const closedPossible = folder === "all" || folder === "read" || folder === "sent";
  return [ACT.close, ...(closedPossible ? [ACT.reopen] : []), ACT.junk, ACT.trash, ACT.read, ACT.unread];
}

/** Unread means the other person wrote last and the conversation is open, so a conversation you wrote last (Sent) can never be marked unread. */
const canBeUnread = (r: ListConversation) => r.status === "open" && r.lastDirection === "inbound" && Boolean(r.lastInboundAt);

/** What can be done to one row, shown when the pointer is over it. */
function rowActs(folder: InboxFolder, row: ListConversation): Act[] {
  if (folder === "bin") return [ACT.restore, ACT.forever];
  if (folder === "junk") return [ACT.notJunk, ACT.trash];
  return [row.status === "closed" ? ACT.reopen : ACT.close, ACT.trash, ...(row.unread ? [ACT.read] : canBeUnread(row) ? [ACT.unread] : [])];
}

/**
 * The list of mail, laid out like a mail program: a toolbar to select and act, then one line per
 * conversation (or draft). Unread lines are bold on white, read lines are grey.
 */
export function MailList({
  folder, rows, drafts, canAct, pager, tabs, empty,
}: {
  folder: InboxFolder;
  rows: ListConversation[];
  drafts: ListDraft[];
  canAct: boolean;
  /** The "1–30 of 120" arrows, drawn by the page. */
  pager: ReactNode;
  /** The tab strip under the toolbar, drawn by the page. */
  tabs: ReactNode;
  empty: string;
}) {
  const router = useRouter();
  const compose = useCompose();
  const draftMode = isDraftFolder(folder);
  const ids = draftMode ? drafts.map((d) => d.id) : rows.map((r) => r.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [menu, setMenu] = useState<null | "select" | "more">(null);
  const bar = useRef<HTMLDivElement>(null);

  // A new page, folder or search starts with nothing selected.
  const key = ids.join(",");
  useEffect(() => setSelected(new Set()), [key]);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (bar.current && !bar.current.contains(e.target as Node)) setMenu(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  const count = selected.size;
  const all = ids.length > 0 && count === ids.length;

  function toggle(id: string) {
    setSelected((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function pick(mode: "all" | "none" | "read" | "unread") {
    setMenu(null);
    if (mode === "all") setSelected(new Set(ids));
    else if (mode === "none") setSelected(new Set());
    else setSelected(new Set(rows.filter((r) => (mode === "unread") === r.unread).map((r) => r.id)));
  }

  function act(op: Act["op"], targets: string[]) {
    if (targets.length === 0) return;
    startTransition(async () => {
      try {
        const res = draftMode
          ? await bulkDraftsAction({ ids: targets, op: op as "discard" | "unschedule" })
          : await bulkConversationsAction({ ids: targets, op: op as BulkOp });
        if (!res.ok) return void toast.error(res.error ?? "That didn’t work. Try again.");
        toast.success(res.message ?? "Done.");
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.fail("That didn’t work. Try again.", e);
      }
    });
  }

  function emptyBin() {
    setMenu(null);
    if (!window.confirm("Delete everything in the Bin for good? This can’t be undone.")) return;
    startTransition(async () => {
      try {
        const res = await emptyBinAction();
        if (!res.ok) return void toast.error(res.error ?? "That didn’t work. Try again.");
        toast.success(res.message ?? "Bin emptied.");
        router.refresh();
      } catch (e) {
        toast.fail("That didn’t work. Try again.", e);
      }
    });
  }

  // The toolbar only offers what applies to the chosen conversations: "Mark as read" needs an unread one, "Mark as unread" one that
  // can be unread (the other person wrote last), Close an open one and Reopen a closed one.
  const pool = rows.filter((r) => selected.has(r.id));
  const applies = (op: Act["op"]) => {
    if (draftMode) return true;
    if (op === "read") return pool.some((r) => r.unread);
    if (op === "unread") return pool.some((r) => canBeUnread(r) && !r.unread);
    if (op === "close") return pool.some((r) => r.status === "open");
    if (op === "reopen") return pool.some((r) => r.status === "closed");
    return true;
  };
  const acts = (canAct ? bulkActs(folder) : bulkActs(folder).filter((a) => a.op === "read" || a.op === "unread")).filter((a) => applies(a.op));
  const canMarkAllRead = !draftMode && !["bin", "junk", "sent"].includes(folder) && rows.some((r) => r.unread);

  return (
    <div>
      <div ref={bar} className="relative flex min-h-[3.25rem] flex-wrap items-center gap-1 border-b border-mist px-2 py-1.5 sm:px-3">
        <div className="relative flex items-center">
          <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-l-full hover:bg-mist-100">
            <span className="sr-only">Select all on this page</span>
            <input
              type="checkbox"
              checked={all}
              ref={(el) => { if (el) el.indeterminate = count > 0 && !all; }}
              onChange={() => pick(all || count > 0 ? "none" : "all")}
              disabled={ids.length === 0}
              className="h-4 w-4 cursor-pointer rounded accent-brand-700 focus:ring-brand-500"
            />
          </label>
          <button type="button" onClick={() => setMenu(menu === "select" ? null : "select")} aria-haspopup="menu" aria-expanded={menu === "select"} aria-label="Select options" className="flex h-9 w-6 items-center justify-center rounded-r-full text-ink-soft hover:bg-mist-100">
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
          {menu === "select" ? (
            <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-40 rounded-xl border border-mist bg-white py-1 shadow-xl">
              {(draftMode ? (["all", "none"] as const) : (["all", "none", "read", "unread"] as const)).map((m) => (
                <button key={m} type="button" role="menuitem" onClick={() => pick(m)} className="block w-full px-4 py-2 text-left text-sm capitalize text-ink hover:bg-mist-100">{m}</button>
              ))}
            </div>
          ) : null}
        </div>

        {count === 0 ? (
          <>
            <button type="button" onClick={() => router.refresh()} aria-label="Refresh" title="Refresh" className={iconBtn}>
              <RefreshCw className={cn("h-[18px] w-[18px]", pending && "animate-spin")} aria-hidden="true" />
            </button>
            {folder === "bin" || canMarkAllRead ? (
              <div className="relative">
                <button type="button" onClick={() => setMenu(menu === "more" ? null : "more")} aria-haspopup="menu" aria-expanded={menu === "more"} aria-label="More" title="More" className={iconBtn}>
                  <MoreVertical className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
                {menu === "more" ? (
                  <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-52 rounded-xl border border-mist bg-white py-1 shadow-xl">
                    {canMarkAllRead ? (
                      <button type="button" role="menuitem" onClick={() => { setMenu(null); act("read", rows.filter((r) => r.unread).map((r) => r.id)); }} className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-mist-100">Mark all on this page as read</button>
                    ) : null}
                    {folder === "bin" && canAct ? (
                      <button type="button" role="menuitem" onClick={emptyBin} className="block w-full px-4 py-2 text-left text-sm font-semibold text-danger hover:bg-mist-100">Empty Bin now</button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <span className="px-2 text-sm font-semibold text-ink" aria-live="polite">{count} selected</span>
            {acts.map((a) => (
              <button key={a.op} type="button" disabled={pending} onClick={() => act(a.op, Array.from(selected))} title={a.label} aria-label={a.label} className={cn(iconBtn, a.danger && "hover:text-danger")}>
                <a.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            ))}
          </>
        )}
        <div className="ml-auto">{pager}</div>
      </div>

      {tabs}

      {ids.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul>
          {draftMode
            ? drafts.map((d) => (
                <DraftLine key={d.id} d={d} checked={selected.has(d.id)} onCheck={() => toggle(d.id)} onOpen={() => compose?.open({ draftId: d.id })} acts={canAct ? (folder === "scheduled" ? [ACT.unschedule, ACT.discard] : [ACT.discard]) : []} onAct={(op) => act(op, [d.id])} />
              ))
            : rows.map((r) => (
                <ConversationLine key={r.id} r={r} folder={folder} checked={selected.has(r.id)} onCheck={() => toggle(r.id)} acts={rowActs(folder, r).filter((a) => canAct || a.op === "read" || a.op === "unread")} onAct={(op) => act(op, [r.id])} />
              ))}
        </ul>
      )}
    </div>
  );
}

const lineBase = "group relative flex items-start gap-1.5 border-b border-mist/70 px-2 transition-shadow sm:items-center sm:gap-3 sm:px-4 hover:z-10 hover:shadow-[0_1px_3px_rgba(60,64,67,0.25)]";

function Check({ checked, onCheck, label }: { checked: boolean; onCheck: () => void; label: string }) {
  return (
    <label className="flex h-12 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-mist/70 sm:h-14">
      <span className="sr-only">{label}</span>
      <input type="checkbox" checked={checked} onChange={onCheck} className="h-4 w-4 cursor-pointer rounded accent-brand-700 focus:ring-brand-500" />
    </label>
  );
}

/** The star beside a conversation. It changes at once and goes back if it could not be saved. */
function StarButton({ id, starred }: { id: string; starred: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(starred);
  const [, startTransition] = useTransition();
  useEffect(() => setOn(starred), [starred]);

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      try {
        const res = await setStarAction({ ids: [id], starred: next });
        if (!res.ok) { setOn(!next); return void toast.error(res.error ?? "That didn’t work. Try again."); }
        router.refresh();
      } catch (e) {
        setOn(!next);
        toast.fail("That didn’t work. Try again.", e);
      }
    });
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={on} aria-label={on ? "Remove star" : "Add star"} title={on ? "Starred" : "Not starred"} className="flex h-12 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-amber-500 sm:h-14">
      <Star className={cn("h-[18px] w-[18px]", on && "fill-amber-400 text-amber-500")} aria-hidden="true" />
    </button>
  );
}

function HoverActs({ acts, onAct }: { acts: Act[]; onAct: (op: Act["op"]) => void }) {
  if (acts.length === 0) return null;
  return (
    <div className="absolute inset-y-0 right-3 hidden items-center gap-0.5 bg-inherit pl-4 group-focus-within:flex group-hover:flex sm:group-hover:flex">
      {acts.map((a) => (
        <button key={a.op} type="button" onClick={() => onAct(a.op)} title={a.label} aria-label={a.label} className={cn(iconBtn, "h-8 w-8", a.danger && "hover:text-danger")}>
          <a.icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function ConversationLine({ r, folder, checked, onCheck, acts, onAct }: { r: ListConversation; folder: InboxFolder; checked: boolean; onCheck: () => void; acts: Act[]; onAct: (op: Act["op"]) => void }) {
  const who = r.contactName || r.contactEmail;
  const sender = folder === "sent" ? `To: ${who}` : who;
  return (
    <li className={cn(lineBase, checked ? "bg-brand-50" : r.unread ? "bg-white" : "bg-mist-50")}>
      <Check checked={checked} onCheck={onCheck} label={`Select conversation with ${who}`} />
      <StarButton id={r.id} starred={r.starred} />
      <Link href={r.href} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-3.5 text-sm sm:grid-cols-[13rem_minmax(0,1fr)_auto] sm:py-0 sm:leading-[3.5rem]">
        <span className={cn("truncate", r.unread ? "font-bold text-ink" : "text-ink-soft")}>
          {sender}
          {r.messageCount > 1 ? <span className="font-normal text-ink-muted">{folder === "sent" ? " " : ", me "}<span className="text-xs">{r.messageCount}</span></span> : null}
        </span>
        <span className="col-start-2 row-start-1 whitespace-nowrap text-xs sm:col-start-3 sm:text-xs">
          <span className={cn("group-hover:invisible", r.unread ? "font-bold text-ink" : "text-ink-muted")}>{r.when}</span>
        </span>
        <span className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <span className="min-w-0 truncate">
            <span className={cn(r.unread ? "font-bold text-ink" : "text-ink")}>{r.subject || "(no subject)"}</span>
            <span className="text-ink-muted"> – {r.snippet}</span>
          </span>
          {r.importance === "high" ? <span className="shrink-0" title="High importance"><CircleAlert className="h-4 w-4 text-danger" aria-label="High importance" /></span> : null}
          {r.status === "closed" ? <span className="hidden shrink-0 rounded bg-mist px-1.5 text-[11px] font-semibold leading-5 text-ink-soft sm:inline">Closed</span> : null}
          {r.kind === "campaign" ? <span className="hidden shrink-0 rounded bg-brand-50 px-1.5 text-[11px] font-semibold leading-5 text-brand-800 md:inline">Campaign</span> : null}
          {r.assignedName ? <span className="hidden shrink-0 rounded bg-mist px-1.5 text-[11px] font-semibold leading-5 text-ink-soft lg:inline">{r.assignedName}</span> : null}
        </span>
      </Link>
      <HoverActs acts={acts} onAct={onAct} />
    </li>
  );
}

function DraftLine({ d, checked, onCheck, onOpen, acts, onAct }: { d: ListDraft; checked: boolean; onCheck: () => void; onOpen: () => void; acts: Act[]; onAct: (op: Act["op"]) => void }) {
  const who = d.contactName || d.contactEmail;
  const scheduled = d.status !== "draft";
  const failed = d.status === "failed";
  return (
    <li className={cn(lineBase, checked ? "bg-brand-50" : "bg-white")}>
      <Check checked={checked} onCheck={onCheck} label={`Select email to ${who || "no one yet"}`} />
      <button type="button" onClick={onOpen} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-3.5 text-left text-sm sm:grid-cols-[13rem_minmax(0,1fr)_auto] sm:py-0 sm:leading-[3.5rem]">
        <span className="truncate">
          {failed ? <span className="font-semibold text-danger">Not sent</span> : scheduled ? <span className="text-ink">To: {who || "—"}</span> : <><span className="text-danger">Draft</span>{who ? <span className="text-ink-soft">, {who}</span> : null}</>}
        </span>
        <span className="col-start-2 row-start-1 inline-flex items-center gap-1 whitespace-nowrap text-xs text-ink-muted sm:col-start-3">
          {d.status === "scheduled" || d.status === "sending" ? <Clock className="h-3.5 w-3.5" aria-hidden="true" /> : null}
          <span className="group-hover:invisible">{d.status === "sending" ? "Sending…" : d.when}</span>
        </span>
        <span className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <span className="min-w-0 truncate">
            <span className="font-semibold text-ink">{d.subject || "(no subject)"}</span>
            <span className={failed ? "text-danger" : "text-ink-muted"}> – {failed && d.error ? d.error : d.snippet}</span>
          </span>
          {d.hasAttachments ? <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-label="Has attachments" /> : null}
        </span>
      </button>
      <HoverActs acts={d.status === "sending" ? [] : acts} onAct={onAct} />
    </li>
  );
}