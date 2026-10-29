// src/components/dashboard/contacts-table.tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { FolderInput, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { Drawer } from "@/components/dashboard/drawer";
import type { ListSummary } from "@/components/dashboard/lists-panel";
import type { ContactRow } from "@/lib/queries";
import {
  addToListAction, deleteContactsAction, moveContactsAction, removeFromListAction,
  type ListActionResult,
} from "@/app/(dashboard)/app/contacts/actions";

type PickerMode = "add" | "move";

type Props = {
  rows: ContactRow[];
  lists: ListSummary[];
  /** The list being viewed, or null for All contacts / Not in a list. */
  current: { id: string; name: string } | null;
  emptyMessage: string;
};

/** Picks the destination list for "Add to list" and "Move to another list". */
function ListPickerDrawer({
  mode, count, lists, currentName, onClose, onConfirm,
}: {
  mode: PickerMode | null;
  count: number;
  lists: { id: string; name: string }[];
  currentName?: string;
  onClose: () => void;
  onConfirm: (listId: string) => Promise<boolean>;
}) {
  const uid = useId();
  const open = mode !== null;
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  // Keep the wording while the drawer slides out.
  const shown = useRef<PickerMode>("add");
  if (mode) shown.current = mode;
  const move = shown.current === "move";
  // The selection is cleared on success while the drawer is still sliding out; keep the last count.
  const lastCount = useRef(count);
  if (count > 0) lastCount.current = count;
  const people = `${lastCount.current} ${lastCount.current === 1 ? "contact" : "contacts"}`;

  useEffect(() => {
    if (open) setTarget(lists[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const confirm = async () => {
    if (!target || saving) return;
    setSaving(true);
    try {
      if (await onConfirm(target)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={saving}
      title={move ? `Move ${people}` : `Add ${people} to a list`}
      description={move ? `They leave “${currentName}” and join the list you choose.` : "They stay in any lists they’re already in."}
      icon={move ? <FolderInput className="h-5 w-5" aria-hidden="true" /> : <FolderPlus className="h-5 w-5" aria-hidden="true" />}
      widthClass="max-w-[28rem]"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={confirm} disabled={saving || !target}>{saving ? "Saving…" : move ? "Move" : "Add to list"}</Button>
        </div>
      }
    >
      {lists.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {move ? "There’s no other list to move them to." : "You don’t have any lists yet."} Close this and use <span className="font-semibold text-ink">New list</span> to create one.
        </p>
      ) : (
        <Field label={move ? "Move to" : "Add to"} htmlFor={`${uid}-target`}>
          <Select id={`${uid}-target`} value={target} onChange={(e) => setTarget(e.target.value)}>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
      )}
    </Drawer>
  );
}

export function ContactsTable({ rows, lists, current, emptyMessage }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  // Drop selections that are no longer on the page (after a filter, page change or action).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      const next = new Set(Array.from(prev).filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;
  const ids = Array.from(selected);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  /** Runs an action, reports the outcome, and clears the selection on success. */
  const run = async (action: () => Promise<ListActionResult>): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong. Try again.");
        return false;
      }
      if (res.message) toast.success(res.message);
      setSelected(new Set());
      return true;
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmPicker = (listId: string) =>
    run(() => (picker === "move" && current ? moveContactsAction({ fromListId: current.id, toListId: listId, contactIds: ids }) : addToListAction({ listId, contactIds: ids })));

  const removeFromCurrent = () => {
    if (!current) return;
    void run(() => removeFromListAction({ listId: current.id, contactIds: ids }));
  };

  const deleteSelected = async () => {
    const n = ids.length;
    const ok = await confirm({
      title: n === 1 ? "Delete this contact?" : `Delete ${n} contacts?`,
      description: "They’re removed from your account and every list, and can’t be recovered. People who unsubscribed stay blocked from future emails.",
      confirmLabel: n === 1 ? "Delete contact" : `Delete ${n} contacts`,
      tone: "danger",
    });
    if (ok) await run(() => deleteContactsAction({ contactIds: ids }));
  };

  const pickerLists = lists.filter((l) => l.id !== current?.id).map(({ id, name }) => ({ id, name }));

  return (
    <>
      {selected.size > 0 ? (
        <div role="region" aria-label="Actions for selected contacts" className="flex flex-wrap items-center gap-3 border-b border-mist bg-brand-50 px-4 py-3">
          <p className="text-sm font-semibold text-brand-800" aria-live="polite">{selected.size} selected</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPicker("add")} disabled={busy}>Add to list</Button>
            {current ? <Button size="sm" variant="outline" onClick={() => setPicker("move")} disabled={busy}>Move to another list</Button> : null}
            {current ? <Button size="sm" variant="outline" onClick={removeFromCurrent} disabled={busy}>Remove from this list</Button> : null}
            <Button size="sm" variant="danger" onClick={deleteSelected} disabled={busy}>Delete</Button>
          </div>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-sm font-semibold text-brand-800 hover:underline">Clear</button>
        </div>
      ) : null}

      <Table>
        <thead>
          <tr>
            <TH className="w-10">
              <input
                type="checkbox"
                aria-label="Select all contacts on this page"
                checked={allSelected}
                disabled={rows.length === 0}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                className="h-4 w-4 accent-brand-700"
              />
            </TH>
            <TH>Contact</TH><TH>Status</TH><TH>Lists</TH><TH>Added</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className={selected.has(c.id) ? "bg-brand-50/50" : undefined}>
              <TD className="w-10">
                <input
                  type="checkbox"
                  aria-label={`Select ${c.email}`}
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4 accent-brand-700"
                />
              </TD>
              <TD><p className="font-semibold text-ink">{c.name}</p><p className="text-xs text-ink-muted">{c.email}</p></TD>
              <TD><StatusBadge status={c.status} /></TD>
              <TD>
                {c.lists.length === 0 ? "-" : (
                  <span className="flex flex-wrap gap-1.5">
                    {c.lists.map((l) => (
                      <Link key={l.id} href={`/app/contacts?list=${l.id}`} className="rounded-full bg-mist-100 px-2.5 py-0.5 text-xs font-medium text-ink-soft hover:bg-brand-50 hover:text-brand-800">{l.name}</Link>
                    ))}
                  </span>
                )}
              </TD>
              <TD>{c.added}</TD>
            </tr>
          ))}
          {rows.length === 0 ? <EmptyRow cols={5} message={emptyMessage} /> : null}
        </tbody>
      </Table>

      <ListPickerDrawer
        mode={picker}
        count={selected.size}
        lists={pickerLists}
        currentName={current?.name}
        onClose={() => setPicker(null)}
        onConfirm={confirmPicker}
      />
    </>
  );
}