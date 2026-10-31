// src/components/dashboard/add-contacts-drawer.tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Plus, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { parsePastedContacts } from "@/lib/validation/paste-contacts";
import { Drawer } from "@/components/dashboard/drawer";
import { addContactsAction, type AddContactsResult } from "@/app/(dashboard)/app/contacts/actions";

type Row = { id: number; firstName: string; lastName: string; email: string; error?: string };
type Mode = "type" | "paste";

const MAX_ROWS = 50;
const MAX_PASTE = 500; // keep in sync with MAX_BATCH in contacts/actions.ts
const NEW_LIST = "__new__";
const NO_LIST = "__none__";

const blankRow = (id: number): Row => ({ id, firstName: "", lastName: "", email: "" });
const isBlank = (r: Row) => !r.email.trim() && !r.firstName.trim() && !r.lastName.trim();

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Audience mode. Pass `lists` (and/or `newListName`) to show an "Add to" picker; the people are
   * put in the chosen list and already-subscribed contacts are included instead of rejected.
   */
  lists?: { id: string; name: string }[];
  /** Name used when "A new list" is chosen. Passing it also turns on audience mode. */
  newListName?: string;
  /** Pre-selected list id; leave empty to default to a new list (or to "No list" with `allowNoList`). */
  defaultListId?: string;
  /** Adds a "No list" choice and makes it the default. For the Contacts page, where a list is optional. */
  allowNoList?: boolean;
  /** Replaces the helper text under the "Add to" picker. */
  listHint?: string;
  title?: string;
  description?: string;
  onAdded?: (result: AddContactsResult) => void;
};

/**
 * Add one or many contacts in a right-side drawer, by typing them in or pasting a list.
 * Closing keeps the draft; Cancel or a successful save clears it. Used on the Contacts page and
 * inside the campaign editor (audience mode).
 */
export function AddContactsDrawer({ open, onOpenChange, lists, newListName, defaultListId, allowNoList = false, listHint, title = "Add contacts", description, onAdded }: Props) {
  const uid = useId();
  const formId = `${uid}-form`;
  const nextId = useRef(2);

  const audienceMode = lists !== undefined || newListName !== undefined;

  const [mode, setMode] = useState<Mode>("type");
  const [rows, setRows] = useState<Row[]>(() => [blankRow(1)]);
  const [pasted, setPasted] = useState("");
  const [pasteErrors, setPasteErrors] = useState<{ email: string; message: string }[]>([]);
  const fallbackTarget = allowNoList ? NO_LIST : NEW_LIST;
  const [target, setTarget] = useState<string>(defaultListId || fallbackTarget);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusRowId, setFocusRowId] = useState<number | null>(null);
  const panelBody = useRef<HTMLDivElement | null>(null);

  // Each time the drawer opens, follow the caller's current choice of list.
  useEffect(() => {
    if (open) setTarget(defaultListId || fallbackTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsed = useMemo(() => parsePastedContacts(pasted), [pasted]);
  const filledRows = rows.filter((r) => !isBlank(r)).length;
  const count = mode === "paste" ? parsed.contacts.length : filledRows;

  const close = () => onOpenChange(false);

  const cancel = () => {
    if (saving) return;
    setRows([blankRow(nextId.current++)]);
    setPasted("");
    setPasteErrors([]);
    setConsent(false);
    close();
  };

  // Focus the requested row (its email field if it has an error) and scroll it into view.
  useEffect(() => {
    if (focusRowId === null || !open) return;
    const el = panelBody.current?.querySelector<HTMLElement>(`[data-row="${focusRowId}"]`);
    if (!el) return;
    const row = rows.find((r) => r.id === focusRowId);
    const field = el.querySelector<HTMLInputElement>(row?.error ? "[data-field=email]" : "input");
    field?.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFocusRowId(null);
  }, [focusRowId, rows, open]);

  const addRow = () => {
    if (rows.length >= MAX_ROWS) {
      toast.info(`Typing in is limited to ${MAX_ROWS} people. For more, paste a list.`);
      return;
    }
    const id = nextId.current++;
    setRows((r) => [...r, blankRow(id)]);
    setFocusRowId(id);
  };

  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch, error: undefined } : row)));

  const removeRow = (id: number) =>
    setRows((r) => (r.length === 1 ? [blankRow(nextId.current++)] : r.filter((row) => row.id !== id)));

  // Enter in an email field adds the next person instead of submitting the form.
  const onEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const row = rows[index];
    if (index < rows.length - 1) setFocusRowId(rows[index + 1].id);
    else if (row.email.trim()) addRow();
    else (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (count === 0) {
      toast.error(mode === "paste" ? "Paste at least one valid email address." : "Add at least one email address.");
      return;
    }
    if (mode === "paste" && count > MAX_PASTE) {
      toast.error(`That’s more than ${MAX_PASTE} addresses. Remove some, or use Import CSV on the Contacts page.`);
      return;
    }
    if (!consent) {
      toast.error("Confirm consent first.");
      return;
    }

    const contacts = mode === "paste" ? parsed.contacts : rows.map(({ firstName, lastName, email }) => ({ firstName, lastName, email }));
    const audience = !audienceMode || target === NO_LIST
      ? undefined
      : target === NEW_LIST
        ? { newListName: newListName?.trim() || "New audience" }
        : { listId: target };

    setSaving(true);
    try {
      const res = await addContactsAction({ consent, contacts, audience });

      if (res.added === 0 || (res.error && !res.list && audienceMode && res.added > 0)) {
        // Nothing usable was saved, or the people were saved but not placed in a list.
        if (mode === "type") {
          const byIndex = new Map(res.rowErrors.map((x) => [x.index, x.message]));
          const next = rows.map((r, i) => ({ ...r, error: byIndex.get(i) }));
          setRows(next);
          const firstFailed = next.find((r) => r.error);
          if (firstFailed) setFocusRowId(firstFailed.id);
        } else {
          setPasteErrors(res.rowErrors.map((x) => ({ email: contacts[x.index]?.email ?? "", message: x.message })));
        }
        toast.error(res.error ?? "Couldn’t add the contacts. Try again.");
        return;
      }

      onAdded?.(res);
      if (res.message) toast.success(res.message);

      // Saved people leave the form; the ones that failed stay, with their reason shown.
      if (mode === "type") {
        const byIndex = new Map(res.rowErrors.map((x) => [x.index, x.message]));
        const failed = rows.map((r, i) => ({ ...r, error: byIndex.get(i) })).filter((r) => r.error);
        setRows(failed.length ? failed : [blankRow(nextId.current++)]);
        if (failed.length) {
          toast.warning(`${failed.length} ${failed.length === 1 ? "person needs" : "people need"} attention. Fix the highlighted ${failed.length === 1 ? "row" : "rows"} and save again.`);
          setFocusRowId(failed[0].id);
          return;
        }
      } else {
        const failedEmails = new Set(res.rowErrors.map((x) => contacts[x.index]?.email).filter(Boolean));
        setPasteErrors(res.rowErrors.map((x) => ({ email: contacts[x.index]?.email ?? "", message: x.message })));
        setPasted(parsed.contacts.filter((c) => failedEmails.has(c.email)).map((c) => (c.firstName || c.lastName ? `${c.firstName} ${c.lastName} <${c.email}>`.trim() : c.email)).join("\n"));
        if (failedEmails.size) {
          toast.warning(`${failedEmails.size} ${failedEmails.size === 1 ? "address needs" : "addresses need"} attention. See the list below.`);
          return;
        }
      }
      setConsent(false);
      close();
    } catch {
      toast.error("Couldn’t add contacts.");
    } finally {
      setSaving(false);
    }
  };

  const consentLabel = count > 1 ? "These people agreed to receive emails from me." : "This person agreed to receive emails from me.";
  const withList = audienceMode && target !== NO_LIST;
  const submitLabel = saving ? "Saving…" : withList ? (count > 1 ? `Add ${count} people` : "Add person") : count > 1 ? `Save ${count} contacts` : "Save contact";

  return (
    <Drawer
      open={open}
      onClose={close}
      busy={saving}
      title={title}
      description={description ?? (mode === "paste" ? "Paste emails, one per line. “Ada Lovelace <ada@example.com>” also works." : "Add one person or several. Press Enter in the email field to add the next one.")}
      icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
      footer={
        <div className="space-y-4">
          <label className="flex items-start gap-3 text-sm text-ink-soft">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-700" />
            {consentLabel}
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={cancel} disabled={saving}>Cancel</Button>
            <Button type="submit" form={formId} disabled={saving}>{submitLabel}</Button>
          </div>
        </div>
      }
    >
      <div ref={panelBody}>
        <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="sticky -top-5 z-10 -mx-6 -mt-5 space-y-3 bg-canvas px-6 pb-3 pt-5">
            <div role="tablist" aria-label="How to add people" className="grid grid-cols-2 gap-1 rounded-full bg-mist-100 p-1 text-sm font-semibold">
              {([
                ["type", "Type in", UserPlus],
                ["paste", "Paste a list", ClipboardPaste],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-full px-4 py-2 transition-colors",
                    mode === value ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            {mode === "type" ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink" aria-live="polite">{rows.length} {rows.length === 1 ? "person" : "people"}</p>
                <Button size="sm" variant="secondary" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add person
                </Button>
              </div>
            ) : null}
          </div>

          {audienceMode ? (
            <Field label="Add to" htmlFor={`${uid}-target`} hint={listHint ?? "Everyone you add goes into this list, and it becomes the campaign’s audience."}>
              <Select id={`${uid}-target`} value={target} onChange={(e) => setTarget(e.target.value)}>
                {allowNoList ? <option value={NO_LIST}>No list</option> : null}
                {!allowNoList || newListName !== undefined ? <option value={NEW_LIST}>A new list{newListName ? `: ${newListName}` : ""}</option> : null}
                {(lists ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          ) : null}

          {mode === "type" ? (
            <>
              {rows.map((row, i) => (
                <div
                  key={row.id}
                  data-row={row.id}
                  className={cn("animate-rise-fast scroll-mt-32 rounded-2xl border bg-white p-4 shadow-sm transition-colors", row.error ? "border-danger/60" : "border-mist")}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Person {i + 1}</p>
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        aria-label={`Remove person ${i + 1}`}
                        className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="First name" htmlFor={`${uid}-${row.id}-first`}>
                      <Input id={`${uid}-${row.id}-first`} value={row.firstName} maxLength={100} autoComplete="off" onChange={(e) => updateRow(row.id, { firstName: e.target.value })} />
                    </Field>
                    <Field label="Last name" htmlFor={`${uid}-${row.id}-last`}>
                      <Input id={`${uid}-${row.id}-last`} value={row.lastName} maxLength={100} autoComplete="off" onChange={(e) => updateRow(row.id, { lastName: e.target.value })} />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Email address" htmlFor={`${uid}-${row.id}-email`} error={row.error}>
                      <Input
                        id={`${uid}-${row.id}-email`}
                        data-field="email"
                        type="email"
                        inputMode="email"
                        autoComplete="off"
                        value={row.email}
                        maxLength={254}
                        aria-invalid={row.error ? true : undefined}
                        className={row.error ? "!border-danger focus:!ring-danger/20" : undefined}
                        onChange={(e) => updateRow(row.id, { email: e.target.value })}
                        onKeyDown={(e) => onEmailKeyDown(e, i)}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="space-y-3">
              <Field label="Emails" htmlFor={`${uid}-paste`}>
                <Textarea
                  id={`${uid}-paste`}
                  value={pasted}
                  onChange={(e) => { setPasted(e.target.value); setPasteErrors([]); }}
                  placeholder={"ada@example.com\nGrace Hopper <grace@example.com>\nalan@example.com, Alan, Turing"}
                  rows={10}
                  spellCheck={false}
                  autoComplete="off"
                  className="min-h-[220px] font-mono text-[13px]"
                />
              </Field>

              <p className="text-sm text-ink-muted" aria-live="polite">
                {pasted.trim() === ""
                  ? "Up to 500 addresses at a time. Names are optional."
                  : [
                      `${parsed.contacts.length} ${parsed.contacts.length === 1 ? "address" : "addresses"} found`,
                      parsed.duplicates ? `${parsed.duplicates} duplicate${parsed.duplicates === 1 ? "" : "s"} ignored` : "",
                      parsed.invalidCount ? `${parsed.invalidCount} not valid` : "",
                    ].filter(Boolean).join(" · ")}
              </p>

              {parsed.invalidCount > 0 ? (
                <p className="rounded-xl bg-warning-soft p-3 text-xs text-ink-soft">
                  Skipped: {parsed.invalid.join(", ")}{parsed.invalidCount > parsed.invalid.length ? ` and ${parsed.invalidCount - parsed.invalid.length} more` : ""}
                </p>
              ) : null}
              {parsed.contacts.length > MAX_PASTE ? (
                <p className="rounded-xl bg-danger-soft p-3 text-xs text-danger">That’s more than {MAX_PASTE} addresses. Remove some, or use Import CSV on the Contacts page.</p>
              ) : null}

              {pasteErrors.length > 0 ? (
                <ul className="space-y-1.5 rounded-xl border border-danger/40 bg-white p-3 text-xs">
                  {pasteErrors.map((x, i) => (
                    <li key={`${x.email}-${i}`}><span className="font-semibold text-ink">{x.email}</span> <span className="text-danger">{x.message}</span></li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </form>
      </div>
    </Drawer>
  );
}

/**
 * The Contacts page's "Add contact" button with its own drawer. The list picker defaults to the list
 * being viewed (or "No list"), so people can be added straight into a list.
 */
export function AddContactsButton({ lists, defaultListId }: { lists: { id: string; name: string }[]; defaultListId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add contact
      </Button>
      <AddContactsDrawer
        open={open}
        onOpenChange={setOpen}
        lists={lists}
        defaultListId={defaultListId}
        allowNoList
        listHint="Optional. If you pick a list, everyone you add goes into it. Contacts you already have are added to it too."
      />
    </>
  );
}