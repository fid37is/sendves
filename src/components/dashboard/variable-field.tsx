"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Braces, Check } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { BUILT_IN_VARIABLES, type VariableDef } from "@/lib/email/variables";
import { cn } from "@/lib/utils";

export type VariableOption = { key: string; label: string; group: "Recipient" | "Campaign" | "Contact fields"; note?: string };

/**
 * Everything an email can insert: the built-in recipient fields, custom contact fields found in the
 * contacts (extra CSV columns) and the variables defined for this campaign. Pure, so every field in
 * every editor offers exactly the same list.
 */
export function buildVariableOptions(defs: VariableDef[], contactFieldKeys: readonly string[]): VariableOption[] {
  const out: VariableOption[] = BUILT_IN_VARIABLES.map((v) => ({ key: v.key, label: v.label, group: "Recipient" as const, note: v.fallback ? `If missing: “${v.fallback}”` : undefined }));
  const seen = new Set<string>(out.map((o) => o.key));
  const custom = new Map(defs.map((d) => [d.key, d]));
  for (const key of contactFieldKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: key.replace(/_/g, " "), group: "Contact fields", note: custom.get(key)?.fallback ? `If missing: “${custom.get(key)!.fallback}”` : "From your contacts" });
  }
  for (const d of defs) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    out.push({
      key: d.key,
      label: d.key.replace(/_/g, " "),
      group: d.scope === "campaign" ? "Campaign" : "Contact fields",
      note: d.scope === "campaign" ? (d.value ? `Value: ${d.value.length > 28 ? `${d.value.slice(0, 28)}…` : d.value}` : "No value yet") : d.fallback ? `If missing: “${d.fallback}”` : undefined,
    });
  }
  return out;
}

/** Puts `token` at the cursor of an input/textarea the way the browser would, so React state stays in sync. */
function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement, token: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, el.value.slice(0, start) + token + el.value.slice(end));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  const pos = start + token.length;
  el.setSelectionRange(pos, pos);
}

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: VariableOption[];
  hint?: ReactNode;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
};

/**
 * A text field with its own "Insert variable" button. The picker opens as an overlay (absolutely
 * positioned, so nothing around it moves), stays open while you add several variables, and closes
 * when you press Done or Escape, or click outside the field.
 */
export function VariableField({ label, value, onChange, options, hint, multiline = false, rows = 6, maxLength, placeholder, className }: Props) {
  const uid = useId();
  const fieldId = `${uid}-field`;
  const panelId = `${uid}-panel`;
  const wrap = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); field.current?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const groups = useMemo(() => {
    const order: VariableOption["group"][] = ["Recipient", "Contact fields", "Campaign"];
    return order.map((g) => ({ group: g, items: options.filter((o) => o.group === g) })).filter((g) => g.items.length > 0);
  }, [options]);

  const insert = (key: string) => {
    const el = field.current;
    if (!el) return;
    insertAtCursor(el, `{{${key}}}`);
    setAdded(key);
  };

  const common = {
    id: fieldId,
    value,
    placeholder,
    maxLength,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onChange(e.target.value),
  };

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={fieldId} className="block text-sm font-semibold text-ink">{label}</label>
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); setAdded(null); }}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-brand-800 transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <Braces className="h-3.5 w-3.5" aria-hidden="true" />
          Insert variable
        </button>
      </div>

      {multiline ? (
        <Textarea ref={field as React.Ref<HTMLTextAreaElement>} rows={rows} {...common} />
      ) : (
        <Input ref={field as React.Ref<HTMLInputElement>} {...common} />
      )}
      {hint ? <p className="mt-1.5 text-xs text-ink-muted">{hint}</p> : null}

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={`Variables for ${label}`}
          // Floats over the page (absolute), so opening it never moves anything around it.
          className="absolute right-0 top-7 z-30 w-[min(20rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-mist bg-white shadow-lg"
        >
          <div className="max-h-72 overflow-y-auto p-2">
            {groups.map((g) => (
              <div key={g.group} className="mb-1 last:mb-0">
                <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">{g.group}</p>
                {g.items.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    // Keep the cursor in the field: the click must not steal focus from it.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(o.key)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-mist-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{o.label}</span>
                      {o.note ? <span className="block truncate text-xs text-ink-muted">{o.note}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {added === o.key ? <Check className="h-3.5 w-3.5 text-success" aria-label="Inserted" /> : null}
                      <code className="rounded bg-mist-100 px-1.5 py-0.5 text-[11px] text-ink-soft">{`{{${o.key}}}`}</code>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-mist bg-mist-50 px-4 py-2.5">
            <span className="text-xs text-ink-muted">Inserted at your cursor.</span>
            <button type="button" onClick={() => { setOpen(false); field.current?.focus(); }} className="rounded-full px-3 py-1 text-xs font-bold text-brand-800 hover:bg-brand-50">Done</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
