// src/components/dashboard/export-contacts-drawer.tsx
"use client";

import { useEffect, useId, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/dashboard/drawer";
import { cn } from "@/lib/utils";

type ListOption = { id: string; name: string; count: number };
type Scope = "all" | "lists";

/**
 * Export contacts as CSV from a right-side drawer: everyone, or only the people in the lists you tick
 * (one list, two, or as many as you like; someone who is in several of them appears once).
 */
export function ExportContactsButton({ lists, total, defaultListId }: { lists: ListOption[]; total: number; defaultListId?: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  // Each time it opens, start from what the person is looking at: the list they're viewing, or everyone.
  useEffect(() => {
    if (!open) return;
    if (defaultListId && lists.some((l) => l.id === defaultListId)) {
      setScope("lists");
      setPicked(new Set([defaultListId]));
    } else {
      setScope("all");
      setPicked(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canExport = scope === "all" || picked.size > 0;

  const download = () => {
    if (!canExport) return;
    const query = scope === "lists" ? "?" + Array.from(picked).map((id) => `list=${encodeURIComponent(id)}`).join("&") : "";
    const a = document.createElement("a");
    a.href = `/api/contacts/export${query}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setOpen(false);
  };

  const option = (value: Scope, title: string, hint: string, disabled = false) => (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4", scope === value ? "border-brand-600 bg-brand-50/50" : "border-mist hover:bg-mist-50", disabled && "cursor-not-allowed opacity-60")}>
      <input type="radio" name={`${uid}-scope`} checked={scope === value} onChange={() => setScope(value)} disabled={disabled} className="mt-1 h-4 w-4 accent-brand-700" />
      <span>
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Download className="h-4 w-4" aria-hidden="true" />
        Export
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Export contacts"
        description="Download a CSV with email, name, status and the date each person was added."
        icon={<Download className="h-5 w-5" aria-hidden="true" />}
        widthClass="max-w-[30rem]"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={download} disabled={!canExport}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {option("all", "All contacts", `Everyone in your account (${total.toLocaleString("en-US")}).`)}
          {option("lists", "Only some lists", lists.length === 0 ? "You don’t have any lists yet." : "Choose one list or several. Someone in more than one of them is exported once.", lists.length === 0)}

          {scope === "lists" && lists.length > 0 ? (
            <div className="rounded-2xl border border-mist">
              <div className="flex items-center justify-between border-b border-mist px-4 py-2.5 text-sm">
                <span className="font-semibold text-ink" aria-live="polite">{picked.size} of {lists.length} selected</span>
                <span className="flex gap-4">
                  <button type="button" onClick={() => setPicked(new Set(lists.map((l) => l.id)))} className="font-semibold text-brand-800 hover:underline">Select all</button>
                  <button type="button" onClick={() => setPicked(new Set())} disabled={picked.size === 0} className="font-semibold text-brand-800 hover:underline disabled:opacity-50 disabled:no-underline">Clear</button>
                </span>
              </div>
              <ul className="max-h-[22rem] divide-y divide-mist overflow-y-auto">
                {lists.map((l) => (
                  <li key={l.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-mist-50">
                      <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} className="h-4 w-4 accent-brand-700" />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{l.name}</span>
                      <span className="text-xs text-ink-muted">{l.count.toLocaleString("en-US")}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}