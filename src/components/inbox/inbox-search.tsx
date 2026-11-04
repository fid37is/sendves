"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { STATUS_FILTERS, WITHIN_FILTERS } from "@/lib/inbox";
import { cn } from "@/lib/utils";

/**
 * The search bar at the top of the mail list: words, and a filter panel behind the sliders icon.
 * It is a plain GET form, so a search is a link that can be shared, and the filters stay in the address.
 * The panel is hidden, not removed, so its values are still sent when Enter is pressed in the search box.
 */
export function InboxSearch({
  folder, q, status, within, mine, canSeeAll, size, resetHref,
}: {
  folder: string; q: string; status: string; within: string; mine: boolean; canSeeAll: boolean; size: number | null; resetHref: string;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  const active = [status, within, mine ? "1" : ""].filter(Boolean).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <form ref={box} action="/app/inbox" method="get" role="search" className="relative min-w-0 flex-1">
      {folder !== "inbox" ? <input type="hidden" name="folder" value={folder} /> : null}
      {size ? <input type="hidden" name="size" value={size} /> : null}
      <div className="flex h-12 items-center gap-2 rounded-full bg-mist-100 pl-4 pr-2 transition-shadow focus-within:bg-white focus-within:shadow-md focus-within:ring-1 focus-within:ring-mist">
        <button type="submit" aria-label="Search mail" className="rounded-full p-1.5 text-ink-soft hover:bg-mist hover:text-ink"><Search className="h-5 w-5" aria-hidden="true" /></button>
        <input name="q" defaultValue={q} type="search" maxLength={80} placeholder="Search mail" aria-label="Search mail" className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`${uid}-filters`}
          aria-label="Show search options"
          title="Show search options"
          className={cn("relative rounded-full p-2 text-ink-soft hover:bg-mist hover:text-ink", open && "bg-mist text-ink")}
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          {active > 0 ? <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-brand-700 ring-2 ring-mist-100" aria-label={`${active} filters on`} /> : null}
        </button>
      </div>

      <div id={`${uid}-filters`} className={cn("absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border border-mist bg-white p-4 shadow-xl sm:left-auto sm:w-[26rem]", !open && "hidden")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-status`} className="mb-1.5 block text-sm font-semibold text-ink">Status</label>
            <Select id={`${uid}-status`} name="status" defaultValue={status} className="h-10">
              {STATUS_FILTERS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor={`${uid}-within`} className="mb-1.5 block text-sm font-semibold text-ink">Date</label>
            <Select id={`${uid}-within`} name="within" defaultValue={within} className="h-10">
              {WITHIN_FILTERS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </Select>
          </div>
        </div>
        {canSeeAll ? (
          <label className="mt-4 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="h-4 w-4 rounded border-mist text-brand-700 focus:ring-brand-500" />
            Only conversations that are mine or assigned to me
          </label>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-mist pt-3">
          <Link href={resetHref} className={buttonStyles({ variant: "outline", size: "sm" })} onClick={() => setOpen(false)}>
            <X className="h-4 w-4" aria-hidden="true" />
            Clear all
          </Link>
          <Button type="submit" size="sm">Search</Button>
        </div>
      </div>
    </form>
  );
}