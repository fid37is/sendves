"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BookMarked, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Drawer } from "@/components/dashboard/drawer";
import { fillSavedReply, type SavedReply } from "@/lib/inbox";
import { deleteReplyAction, saveReplyAction } from "@/app/(dashboard)/app/inbox/actions";

/**
 * Inserts a saved reply into the box, with {{first_name}}, {{name}} and {{my_name}} filled in, and lets the
 * person add, change and delete them. Saved replies are shared by the whole organization.
 */
export function SavedReplies({
  replies, vars, onInsert, disabled,
}: {
  replies: SavedReply[];
  vars: { firstName?: string | null; name?: string | null; myName?: string | null };
  onInsert: (text: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const pickId = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SavedReply | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setEditing(null); setTitle(""); setBody(""); };

  async function save() {
    setBusy(true);
    try {
      const res = await saveReplyAction({ id: editing?.id, title, body });
      if (!res.ok) return void toast.error(res.error ?? "That didn’t save. Try again.");
      toast.success(res.message ?? "Saved.");
      reset();
      router.refresh();
    } catch (e) {
      toast.fail("That didn’t save. Try again.", e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await deleteReplyAction(id);
      if (!res.ok) return void toast.error(res.error ?? "That didn’t work. Try again.");
      if (editing?.id === id) reset();
      router.refresh();
    } catch (e) {
      toast.fail("That didn’t work. Try again.", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {replies.length > 0 ? (
        <>
          <label htmlFor={pickId} className="sr-only">Insert a saved reply</label>
          <Select
            id={pickId}
            value=""
            disabled={disabled}
            onChange={(e) => {
              const r = replies.find((x) => x.id === e.target.value);
              if (r) onInsert(fillSavedReply(r.body, vars));
            }}
            className="h-9 w-auto min-w-[9rem] max-w-[12rem] rounded-full px-4 py-0 text-sm font-semibold"
          >
            <option value="">Saved replies</option>
            {replies.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </Select>
        </>
      ) : null}
      <Button size="sm" variant="ghost" type="button" disabled={disabled} onClick={() => setOpen(true)}>
        <BookMarked className="h-4 w-4" aria-hidden="true" />
        {replies.length > 0 ? "Manage" : "Saved replies"}
      </Button>

      <Drawer
        open={open}
        onClose={() => !busy && setOpen(false)}
        busy={busy}
        title="Saved replies"
        description="Answers you send often. Shared with everyone in your organization."
        icon={<BookMarked className="h-5 w-5" aria-hidden="true" />}
        widthClass="max-w-[34rem]"
        footer={
          <div className="flex justify-end gap-2">
            {editing ? <Button size="sm" variant="outline" onClick={reset} disabled={busy}>Cancel edit</Button> : null}
            <Button size="sm" onClick={save} loading={busy} disabled={!title.trim() || !body.trim()}>{editing ? "Save changes" : "Add saved reply"}</Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="space-y-5">
            <Field label="Title" htmlFor="sr-title"><Input id="sr-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Pricing question" /></Field>
            <Field label="Reply" htmlFor="sr-body" hint="Use {{first_name}}, {{name}} and {{my_name}} to fill in names when you insert it.">
              <Textarea id="sr-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} className="min-h-[150px]" />
            </Field>
          </div>

          {replies.length > 0 ? (
            <ul className="divide-y divide-mist rounded-xl border border-mist" aria-label="Your saved replies">
              {replies.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{r.title}</p>
                    <p className="line-clamp-2 text-xs text-ink-muted">{r.body}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label={`Edit ${r.title}`} onClick={() => { setEditing(r); setTitle(r.title); setBody(r.body); }} className="rounded-full p-1.5 text-ink-muted hover:bg-mist-100 hover:text-ink"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" aria-label={`Delete ${r.title}`} disabled={busy} onClick={() => remove(r.id)} className="rounded-full p-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}