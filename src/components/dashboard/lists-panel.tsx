// src/components/dashboard/lists-panel.tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, FolderPlus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { Drawer } from "@/components/dashboard/drawer";
import { createListAction, deleteListAction, renameListAction } from "@/app/(dashboard)/app/contacts/actions";

export type ListSummary = { id: string; name: string; count: number };

const focusFirstInput = (panel: HTMLElement) => panel.querySelector<HTMLInputElement>("input")?.focus();

// ── New list ────────────────────────────────────────────────────────

function NewListDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const formId = `${uid}-form`;
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setError(undefined);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) return setError("Give the list a name.");
    setSaving(true);
    try {
      const res = await createListAction({ name });
      if (!res.ok) return setError(res.error ?? "Couldn’t create the list.");
      toast.success(res.message ?? "List created.");
      onClose();
      // Open the new list so the next step (add or import people) is right there.
      if (res.id) router.push(`/app/contacts?list=${res.id}`);
    } catch {
      setError("Couldn’t create the list. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={saving}
      title="New list"
      description="Lists group contacts so you can choose who gets each campaign. A contact can be in more than one list."
      icon={<FolderPlus className="h-5 w-5" aria-hidden="true" />}
      widthClass="max-w-[28rem]"
      onOpened={focusFirstInput}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form={formId} disabled={saving}>{saving ? "Creating…" : "Create list"}</Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Field label="List name" htmlFor={`${uid}-name`} error={error} hint="Only you see this name.">
          <Input
            id={`${uid}-name`}
            value={name}
            maxLength={80}
            autoComplete="off"
            placeholder="Newsletter"
            aria-invalid={error ? true : undefined}
            onChange={(e) => { setName(e.target.value); setError(undefined); }}
          />
        </Field>
      </form>
    </Drawer>
  );
}

// ── The rail ────────────────────────────────────────────────────────

type RailProps = {
  lists: ListSummary[];
  /** All contacts in the workspace. */
  total: number;
  currentId: string | null;
  /** True while viewing contacts that are not in any list. */
  unassigned: boolean;
};

/** Switches the Contacts page between All contacts, "Not in a list" and each list. */
export function ListsRail({ lists, total, currentId, unassigned }: RailProps) {
  const [creating, setCreating] = useState(false);
  const all = !currentId && !unassigned;

  const item = (active: boolean) =>
    cn(
      "flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
      active ? "bg-brand-50 text-brand-800" : "text-ink-soft hover:bg-mist-100 hover:text-ink",
    );
  const count = (n: number) => <span className="text-xs font-medium text-ink-muted">{n.toLocaleString("en-US")}</span>;

  return (
    <>
      <Card className="h-fit">
        <div className="flex items-center justify-between gap-3 border-b border-mist px-4 py-3">
          <h2 className="text-sm font-bold text-ink">Lists</h2>
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)} aria-haspopup="dialog">
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            New list
          </Button>
        </div>
        <nav aria-label="Contact lists" className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
          <Link href="/app/contacts" aria-current={all ? "page" : undefined} className={item(all)}>
            <span>All contacts</span>
            {count(total)}
          </Link>
          <Link href="/app/contacts?list=none" aria-current={unassigned ? "page" : undefined} className={item(unassigned)}>
            <span>Not in a list</span>
          </Link>
          {lists.map((l) => (
            <Link key={l.id} href={`/app/contacts?list=${l.id}`} aria-current={currentId === l.id ? "page" : undefined} className={item(currentId === l.id)}>
              <span className="max-w-[10rem] truncate lg:max-w-none">{l.name}</span>
              {count(l.count)}
            </Link>
          ))}
        </nav>
        {lists.length === 0 ? (
          <p className="border-t border-mist px-4 py-3 text-xs text-ink-muted">No lists yet. Create one, then add or import contacts into it.</p>
        ) : null}
      </Card>
      <NewListDrawer open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

// ── The selected list ───────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy the link. Select it and copy manually.");
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={copy}>
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

function ListSettingsDrawer({ list, signupUrl, open, onClose }: { list: ListSummary; signupUrl: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const formId = `${uid}-form`;
  const [name, setName] = useState(list.name);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;
  const confirm = useConfirm();

  useEffect(() => {
    if (open) {
      setName(list.name);
      setError(undefined);
    }
  }, [open, list.name]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Give the list a name.");
    if (name.trim() === list.name) return onClose();
    setSaving(true);
    try {
      const res = await renameListAction({ listId: list.id, name });
      if (!res.ok) return setError(res.error ?? "Couldn’t rename the list.");
      toast.success(res.message ?? "List renamed.");
      onClose();
    } catch {
      setError("Couldn’t rename the list. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    const people = list.count === 1 ? "1 contact" : `${list.count.toLocaleString("en-US")} contacts`;
    const ok = await confirm({
      title: `Delete “${list.name}”?`,
      description: `The ${people} in it stay in your account. Only the list is removed, and its public signup page stops working.`,
      confirmLabel: "Delete list",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await deleteListAction({ listId: list.id });
      if (!res.ok) return void toast.error(res.error ?? "Couldn’t delete the list.");
      toast.success(res.message ?? "List deleted.");
      onClose();
      router.push("/app/contacts");
    } catch {
      toast.error("Couldn’t delete the list. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={busy}
      title="List settings"
      description={`${list.count.toLocaleString("en-US")} ${list.count === 1 ? "contact" : "contacts"} in this list.`}
      icon={<Settings2 className="h-5 w-5" aria-hidden="true" />}
      widthClass="max-w-[28rem]"
      onOpened={focusFirstInput}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form={formId} disabled={busy}>{saving ? "Saving…" : "Save name"}</Button>
        </div>
      }
    >
      <div className="space-y-8">
        <form id={formId} onSubmit={save} noValidate>
          <Field label="List name" htmlFor={`${uid}-name`} error={error}>
            <Input
              id={`${uid}-name`}
              value={name}
              maxLength={80}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              onChange={(e) => { setName(e.target.value); setError(undefined); }}
            />
          </Field>
        </form>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink">Public signup page</p>
          <p className="mb-3 text-xs text-ink-muted">Anyone who signs up here is added to this list.</p>
          <div className="flex items-center gap-3">
            <Input readOnly value={signupUrl} aria-label="Signup page link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <CopyButton value={signupUrl} />
          </div>
        </div>

        <div className="rounded-2xl border border-danger/30 p-4">
          <p className="text-sm font-semibold text-ink">Delete this list</p>
          <p className="mt-1 text-xs text-ink-muted">
            Contacts stay in your account; only the list goes away, and its signup page stops working. A list can’t be deleted while a draft, scheduled or sending campaign uses it.
          </p>
          <Button variant="danger" size="sm" className="mt-3" onClick={remove} disabled={busy}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {deleting ? "Deleting…" : "Delete list"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

/** Heading for the list being viewed, with its settings. */
export function ListHeader({ list, signupUrl }: { list: ListSummary; signupUrl: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-ink">{list.name}</h2>
          <p className="text-sm text-ink-muted">{list.count.toLocaleString("en-US")} {list.count === 1 ? "contact" : "contacts"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          List settings
        </Button>
      </div>
      <ListSettingsDrawer list={list} signupUrl={signupUrl} open={open} onClose={() => setOpen(false)} />
    </>
  );
}