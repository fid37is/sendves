"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, FlaskConical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { sendReplyAction, simulateReplyAction } from "@/app/(dashboard)/app/inbox/actions";
import { AttachFiles } from "@/components/inbox/attach-field";
import { SavedReplies } from "@/components/inbox/saved-replies";
import { ImportanceSelect, RecipientField } from "@/components/inbox/compose-window";
import type { Importance, SavedReply } from "@/lib/inbox";

export function ReplyBox({
  conversationId, from, blocked, canSimulate, savedReplies, vars, to, onClose,
}: {
  conversationId: string;
  /** Who the reply goes to, as "Name <email>". */
  to: string;
  /** Closes the box without sending (the bin icon). Whatever was typed is dropped. */
  onClose?: () => void;
  /** The address the reply goes out from, or null when it can't be answered. */
  from: string | null;
  /** Why replying isn't possible (shown instead of the box), or null. */
  blocked: string | null;
  /** The console sending provider is on: offers a button that pretends the contact replied. */
  canSimulate: boolean;
  savedReplies: SavedReply[];
  /** Names for {{first_name}}, {{name}} and {{my_name}} in a saved reply. */
  vars: { firstName?: string | null; name?: string | null; myName?: string | null };
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const [alsoTo, setAlsoTo] = useState<string[]>([]);
  const [showTo, setShowTo] = useState(false);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [importance, setImportance] = useState<Importance>("normal");
  const resetExtras = () => { setAlsoTo([]); setShowTo(false); setCc([]); setBcc([]); setShowCc(false); setShowBcc(false); setImportance("normal"); };

  if (blocked) {
    return <p className="rounded-2xl border border-dashed border-mist bg-white px-4 py-4 text-sm text-ink-muted">{blocked}</p>;
  }

  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("conversationId", conversationId);
      form.set("body", text);
      form.set("to", alsoTo.join(","));
      form.set("cc", cc.join(","));
      form.set("bcc", bcc.join(","));
      form.set("importance", importance);
      for (const f of files) form.append("files", f);
      const res = await sendReplyAction(form);
      if (!res.ok) {
        toast.error(res.error ?? "That didn’t send. Try again.");
        // Refused by the email provider: the message is now in the thread as "Not sent", so the box is clear.
        if (res.id) { setText(""); setFiles([]); resetExtras(); router.refresh(); }
        return;
      }
      toast.success(res.message ?? "Reply sent.");
      setText("");
      setFiles([]);
      resetExtras();
      router.refresh();
    } catch (e) {
      toast.fail("That didn’t send. Try again.", e);
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    setBusy(true);
    try {
      const res = await simulateReplyAction({ conversationId, body: text });
      if (!res.ok) return void toast.error(res.error ?? "That didn’t work.");
      toast.success(res.message ?? "A reply arrived.");
      setText("");
      router.refresh();
    } catch (e) {
      toast.fail("That didn’t work.", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-mist bg-white p-3 shadow-sm sm:p-4">
      <p className="mb-2 flex items-center gap-2 border-b border-mist pb-2 text-sm text-ink-soft">
        <CornerUpLeft className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span className="min-w-0 truncate">{to}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs font-semibold text-ink-muted">
          {showTo ? null : <button type="button" onClick={() => setShowTo(true)} className="hover:text-ink">To</button>}
          {showCc ? null : <button type="button" onClick={() => setShowCc(true)} className="hover:text-ink">Cc</button>}
          {showBcc ? null : <button type="button" onClick={() => setShowBcc(true)} className="hover:text-ink">Bcc</button>}
        </span>
      </p>
      {showTo || alsoTo.length > 0 ? <RecipientField id="reply-to" label="To" list={alsoTo} onChange={setAlsoTo} max={10 - cc.length - bcc.length} disabled={busy} className="flex items-center gap-3 border-b border-mist py-2 text-sm" /> : null}
      {showCc || cc.length > 0 ? <RecipientField id="reply-cc" label="Cc" list={cc} onChange={setCc} max={10 - alsoTo.length - bcc.length} disabled={busy} className="flex items-center gap-3 border-b border-mist py-2 text-sm" /> : null}
      {showBcc || bcc.length > 0 ? <RecipientField id="reply-bcc" label="Bcc" list={bcc} onChange={setBcc} max={10 - alsoTo.length - cc.length} disabled={busy} className="flex items-center gap-3 border-b border-mist py-2 text-sm" /> : null}
      <label htmlFor="reply-text" className="sr-only">Your reply</label>
      <Textarea
        id="reply-text"
        ref={area}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Write your reply"
        autoFocus
        maxLength={20000}
        className="min-h-[110px] resize-y border-0 px-1 py-1 hover:border-0 focus:ring-0"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-mist pt-3">
        <SavedReplies replies={savedReplies} vars={vars} onInsert={(t) => { setText((cur) => (cur.trim() ? `${cur.replace(/\s+$/, "")}\n\n${t}` : t)); area.current?.focus(); }} disabled={busy} />
        <AttachFiles files={files} onChange={setFiles} disabled={busy} />
        <ImportanceSelect value={importance} onChange={setImportance} disabled={busy} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 truncate text-xs text-ink-muted">Sends from <span className="font-semibold text-ink-soft">{from}</span></p>
        <div className="ml-auto flex items-center justify-end gap-2">
          {canSimulate ? (
            <Button size="sm" variant="ghost" onClick={simulate} disabled={busy} title="Development only: pretend the contact wrote back">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Simulate reply
            </Button>
          ) : null}
          {onClose ? (
            <button type="button" onClick={() => { setText(""); setFiles([]); resetExtras(); onClose(); }} disabled={busy} title="Discard reply" aria-label="Discard reply" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-mist-100 hover:text-danger disabled:opacity-60">
              <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          ) : null}
          <Button size="sm" onClick={send} loading={busy} disabled={!text.trim()}>Send reply</Button>
        </div>
      </div>
    </div>
  );
}