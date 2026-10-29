// src/components/dashboard/add-contacts-drawer.tsx
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { addContactsAction } from "@/app/(dashboard)/app/contacts/actions";

type Row = { id: number; firstName: string; lastName: string; email: string; error?: string };

const MAX_ROWS = 50;
const ANIMATION_MS = 350; // keep in sync with the duration-[350ms] classes below

const blankRow = (id: number): Row => ({ id, firstName: "", lastName: "", email: "" });
const isBlank = (r: Row) => !r.email.trim() && !r.firstName.trim() && !r.lastName.trim();

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * "Add contact" button plus a slide-over panel (rendered in a portal) for adding one or many
 * contacts at once. Closing the panel keeps the draft; Cancel or a successful save clears it.
 */
export function AddContactsDrawer() {
  const uid = useId();
  const nextId = useRef(2);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false); // mounted in the DOM
  const [visible, setVisible] = useState(false); // slid in
  const [rows, setRows] = useState<Row[]>(() => [blankRow(1)]);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusRowId, setFocusRowId] = useState<number | null>(null);

  const filled = rows.filter((r) => !isBlank(r)).length;

  const openDrawer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    triggerRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  };

  const closeDrawer = useCallback(() => {
    setVisible(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      triggerRef.current?.focus?.();
    }, ANIMATION_MS);
  }, []);

  const requestClose = () => {
    if (!saving) closeDrawer();
  };

  const cancel = () => {
    if (saving) return;
    setRows([blankRow(nextId.current++)]);
    setConsent(false);
    closeDrawer();
  };

  // Slide in one frame after mounting so the transition actually runs.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setVisible(true);
      setFocusRowId((id) => id ?? rows[0]?.id ?? null);
    }, 16);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock page scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes; Tab stays inside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        e.preventDefault();
        closeDrawer();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, saving, closeDrawer]);

  // Focus the requested row (its email field if it has an error) and scroll it into view.
  useEffect(() => {
    if (focusRowId === null || !open) return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-row="${focusRowId}"]`);
    if (!el) return;
    const row = rows.find((r) => r.id === focusRowId);
    const target = el.querySelector<HTMLInputElement>(row?.error ? "[data-field=email]" : "input");
    target?.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFocusRowId(null);
  }, [focusRowId, rows, open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const addRow = () => {
    if (rows.length >= MAX_ROWS) {
      toast.info(`You can add up to ${MAX_ROWS} people at a time. To add more, import a CSV.`);
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
    if (index < rows.length - 1) {
      setFocusRowId(rows[index + 1].id);
    } else if (row.email.trim()) {
      addRow();
    } else {
      formRef.current?.requestSubmit();
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (filled === 0) {
      toast.error("Add at least one email address.");
      return;
    }
    if (!consent) {
      toast.error("Confirm that these people agreed to receive your emails.");
      return;
    }

    setSaving(true);
    try {
      const res = await addContactsAction({
        consent,
        contacts: rows.map(({ firstName, lastName, email }) => ({ firstName, lastName, email })),
      });

      const errorByIndex = new Map(res.rowErrors.map((x) => [x.index, x.message]));
      const next = rows.map((r, i) => ({ ...r, error: errorByIndex.get(i) }));
      const failed = next.filter((r) => r.error);

      if (res.added === 0) {
        setRows(next);
        toast.error(res.error ?? "Couldn’t add the contacts. Try again.");
        if (failed.length) setFocusRowId(failed[0].id);
        return;
      }

      // Saved rows leave the form; rows that failed stay, with their reason shown inline.
      setRows(failed.length ? failed : [blankRow(nextId.current++)]);
      if (res.message) toast.success(res.message);
      if (failed.length) {
        toast.warning(`${failed.length} ${failed.length === 1 ? "person needs" : "people need"} attention. Fix the highlighted ${failed.length === 1 ? "row" : "rows"} and save again.`);
        setFocusRowId(failed[0].id);
      } else {
        setConsent(false);
        closeDrawer();
      }
    } catch {
      toast.error("Couldn’t add the contacts. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const titleId = `${uid}-title`;

  return (
    <>
      <Button onClick={openDrawer} aria-haspopup="dialog">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add contact
      </Button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[90]">
              <div
                aria-hidden="true"
                onClick={requestClose}
                className={cn(
                  "absolute inset-0 bg-night/50 backdrop-blur-[2px] transition-opacity duration-[350ms] ease-out motion-reduce:transition-none",
                  visible ? "opacity-100" : "opacity-0",
                )}
              />

              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={cn(
                  "absolute inset-y-0 right-0 flex w-full max-w-[34rem] flex-col bg-canvas shadow-2xl shadow-night/30 transition-transform duration-[350ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none sm:rounded-l-3xl",
                  visible ? "translate-x-0" : "translate-x-full",
                )}
              >
                <div className="flex items-start justify-between gap-4 border-b border-mist px-6 py-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100 ring-1 ring-accent-200">
                      <UserPlus className="h-5 w-5 text-brand-800" aria-hidden="true" />
                    </span>
                    <div>
                      <h2 id={titleId} className="text-lg font-bold text-ink">Add contacts</h2>
                      <p className="mt-0.5 text-sm text-ink-muted">Add one person or several. Press Enter in the email field to add the next one.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={requestClose}
                    aria-label="Close"
                    className="rounded-full p-2 text-ink-muted transition-colors hover:bg-mist-100 hover:text-ink"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <form ref={formRef} onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                  <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                    {rows.map((row, i) => (
                      <div
                        key={row.id}
                        data-row={row.id}
                        style={{ animationDelay: visible ? "0ms" : `${120 + Math.min(i, 5) * 60}ms` }}
                        className={cn(
                          "animate-rise-fast rounded-2xl border bg-white p-4 shadow-sm transition-colors",
                          row.error ? "border-danger/60" : "border-mist",
                        )}
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

                    <button
                      type="button"
                      onClick={addRow}
                      disabled={rows.length >= MAX_ROWS}
                      className="group flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-mist px-4 py-3.5 text-sm font-semibold text-brand-800 transition-all duration-200 hover:border-brand-500 hover:bg-brand-50 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 transition-transform duration-300 group-hover:rotate-90">
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </span>
                      Add another person
                    </button>
                  </div>

                  <div className="space-y-4 border-t border-mist bg-white px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                    <label className="flex items-start gap-3 text-sm text-ink-soft">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-brand-700"
                      />
                      {filled > 1 ? "These people agreed to receive emails from me." : "This person agreed to receive emails from me."}
                    </label>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={cancel} disabled={saving}>Cancel</Button>
                      <Button type="submit" className="flex-1" disabled={saving}>
                        {saving ? "Saving…" : filled > 1 ? `Save ${filled} contacts` : "Save contact"}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
