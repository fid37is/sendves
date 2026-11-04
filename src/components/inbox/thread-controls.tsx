"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Check, ChevronLeft, ChevronRight, Inbox, Mail, MoreVertical, Printer, RotateCcw, ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { assignConversationAction, bulkConversationsAction, type BulkOp } from "@/app/(dashboard)/app/inbox/actions";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const btn = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-mist-100 hover:text-ink disabled:pointer-events-none disabled:opacity-50";
const divider = <span className="mx-1 h-5 w-px shrink-0 bg-mist" aria-hidden="true" />;

/**
 * The bar above an open conversation, like a mail program's: back to the list, close, report junk, delete,
 * mark as unread, assign, more, and on the right where you are in the list ("2 of 5") with the arrows.
 */
export function ThreadToolbar({
  conversationId, status, trashed, junk, assignedTo, members, canAct, canMarkUnread, backHref, position,
}: {
  conversationId: string;
  status: "open" | "closed";
  trashed: boolean;
  junk: boolean;
  assignedTo: string | null;
  /** People it can be assigned to. Empty (no picker) for anyone who can't assign. */
  members: { id: string; name: string }[];
  canAct: boolean;
  /** Only a conversation that is open and was last written by the contact can be marked unread. */
  canMarkUnread: boolean;
  backHref: string;
  position: { label: string; prevHref: string | null; nextHref: string | null } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<null | "assign" | "more">(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (bar.current && !bar.current.contains(e.target as Node)) setMenu(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  async function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>, leave: boolean) {
    setBusy(true);
    setMenu(null);
    try {
      const res = await action();
      if (!res.ok) return void toast.error(res.error ?? "That didn’t work. Try again.");
      if (res.message) toast.success(res.message);
      if (leave) router.push(backHref);
      router.refresh();
    } catch (e) {
      toast.fail("That didn’t work. Try again.", e);
    } finally {
      setBusy(false);
    }
  }
  const bulk = (op: BulkOp, leave: boolean) => run(() => bulkConversationsAction({ ids: [conversationId], op }), leave);

  return (
    <div ref={bar} className="relative flex flex-wrap items-center gap-0.5 border-b border-mist px-2 py-1.5 sm:px-3">
      <Link href={backHref} className={btn} title="Back to the list" aria-label="Back to the list"><ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" /></Link>
      {canAct ? (
        <>
          {divider}
          {trashed ? (
            <>
              <button type="button" disabled={busy} onClick={() => bulk("restore", false)} className={btn} title="Restore from Bin" aria-label="Restore from Bin"><RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" /></button>
              <button type="button" disabled={busy} onClick={() => { if (window.confirm("Delete this conversation for good? This can’t be undone.")) void bulk("delete_forever", true); }} className={cn(btn, "hover:text-danger")} title="Delete forever" aria-label="Delete forever"><Trash2 className="h-[18px] w-[18px]" aria-hidden="true" /></button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => bulk(status === "open" ? "close" : "reopen", false)} className={btn} title={status === "open" ? "Close conversation" : "Reopen conversation"} aria-label={status === "open" ? "Close conversation" : "Reopen conversation"}>
                {status === "open" ? <Archive className="h-[18px] w-[18px]" aria-hidden="true" /> : <ArchiveRestore className="h-[18px] w-[18px]" aria-hidden="true" />}
              </button>
              <button type="button" disabled={busy} onClick={() => bulk(junk ? "not_junk" : "junk", true)} className={btn} title={junk ? "Not junk" : "Report junk"} aria-label={junk ? "Not junk" : "Report junk"}>
                {junk ? <Inbox className="h-[18px] w-[18px]" aria-hidden="true" /> : <ShieldAlert className="h-[18px] w-[18px]" aria-hidden="true" />}
              </button>
              <button type="button" disabled={busy} onClick={() => bulk("trash", true)} className={btn} title="Move to Bin" aria-label="Move to Bin"><Trash2 className="h-[18px] w-[18px]" aria-hidden="true" /></button>
              {divider}
              <button type="button" disabled={busy || !canMarkUnread} onClick={() => bulk("unread", true)} className={btn} title={canMarkUnread ? "Mark as unread" : "Only conversations waiting for your reply can be marked as unread"} aria-label="Mark as unread"><Mail className="h-[18px] w-[18px]" aria-hidden="true" /></button>
              {members.length > 0 ? (
                <div className="relative">
                  <button type="button" disabled={busy} onClick={() => setMenu(menu === "assign" ? null : "assign")} aria-haspopup="menu" aria-expanded={menu === "assign"} className={cn(btn, assignedTo && "text-brand-800")} title="Assign to" aria-label="Assign to"><UserPlus className="h-[18px] w-[18px]" aria-hidden="true" /></button>
                  {menu === "assign" ? (
                    <div role="menu" aria-label="Assign to" className="absolute left-0 top-full z-20 mt-1 max-h-72 w-60 overflow-y-auto rounded-xl border border-mist bg-white py-1 shadow-xl">
                      {[{ id: "", name: "Unassigned" }, ...members].map((m) => (
                        <button key={m.id || "none"} type="button" role="menuitemradio" aria-checked={(assignedTo ?? "") === m.id} onClick={() => run(() => assignConversationAction({ conversationId, userId: m.id || null }), false)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink hover:bg-mist-100">
                          <Check className={cn("h-4 w-4 shrink-0", (assignedTo ?? "") === m.id ? "text-brand-700" : "invisible")} aria-hidden="true" />
                          <span className="truncate">{m.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
      <div className="relative">
        <button type="button" onClick={() => setMenu(menu === "more" ? null : "more")} aria-haspopup="menu" aria-expanded={menu === "more"} className={btn} title="More" aria-label="More"><MoreVertical className="h-[18px] w-[18px]" aria-hidden="true" /></button>
        {menu === "more" ? (
          <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-44 rounded-xl border border-mist bg-white py-1 shadow-xl">
            <button type="button" role="menuitem" onClick={() => { setMenu(null); window.print(); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink hover:bg-mist-100"><Printer className="h-4 w-4" aria-hidden="true" />Print</button>
          </div>
        ) : null}
      </div>

      {position ? (
        <div className="ml-auto flex items-center gap-1 text-xs text-ink-muted">
          <span className="px-2" aria-live="polite">{position.label}</span>
          {position.prevHref ? <Link href={position.prevHref} className={btn} title="Newer" aria-label="Newer conversation"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Link> : <span className={cn(btn, "opacity-40")} aria-hidden="true"><ChevronLeft className="h-4 w-4" /></span>}
          {position.nextHref ? <Link href={position.nextHref} className={btn} title="Older" aria-label="Older conversation"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link> : <span className={cn(btn, "opacity-40")} aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>}
        </div>
      ) : null}
    </div>
  );
}