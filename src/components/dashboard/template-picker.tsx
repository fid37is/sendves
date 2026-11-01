"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export type PickerOption = { id: string; name: string; description: string; group: "builtin" | "mine" };

/**
 * The "Starting point" choice of a new campaign. Built to stay usable with many templates: your own are
 * grouped under their own heading, the list scrolls inside a fixed height, and once there are more than a
 * handful it can be searched. Every option stays in the page (filtered ones are only hidden), so the chosen
 * template is always the one submitted.
 */
export function TemplatePicker({ options, selected }: { options: PickerOption[]; selected: string }) {
  const [q, setQ] = useState("");
  const searchable = options.length > 8;
  const term = q.trim().toLowerCase();
  const matches = useMemo(() => new Set(options.filter((o) => !term || `${o.name} ${o.description}`.toLowerCase().includes(term)).map((o) => o.id)), [options, term]);
  const groups = [
    { key: "builtin" as const, title: "Built-in templates" },
    { key: "mine" as const, title: "Your templates" },
  ];
  const shown = matches.size;

  return (
    <div>
      {searchable ? (
        <div className="mb-3">
          <label htmlFor="tplSearch" className="sr-only">Search templates</label>
          <Input id="tplSearch" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${options.length} templates`} />
          <p className="mt-1.5 text-xs text-ink-muted" role="status">{term ? `${shown} of ${options.length} templates` : `${options.length} templates`}</p>
        </div>
      ) : null}
      <div className={searchable || options.length > 6 ? "max-h-[26rem] overflow-y-auto pr-1" : undefined} tabIndex={searchable || options.length > 6 ? 0 : undefined} aria-label="Templates">
        {groups.map((g) => {
          const list = options.filter((o) => o.group === g.key);
          if (!list.length) return null;
          const visible = list.filter((o) => matches.has(o.id)).length;
          return (
            <section key={g.key} className={visible === 0 ? "hidden" : "mb-4 last:mb-0"}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{g.title} <span className="font-normal normal-case">({list.length})</span></h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((t) => (
                  <label key={t.id} className={`cursor-pointer items-start gap-3 rounded-2xl border border-mist p-4 hover:border-brand-500 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50 ${matches.has(t.id) ? "flex" : "hidden"}`}>
                    <input type="radio" name="template" value={t.id} defaultChecked={t.id === selected} className="mt-1 accent-brand-700" />
                    <span className="min-w-0"><span className="block truncate text-sm font-bold text-ink">{t.name}</span><span className="block text-sm text-ink-muted [overflow-wrap:anywhere]">{t.description}</span></span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
        {term && shown === 0 ? <p className="py-6 text-center text-sm text-ink-muted">No templates match “{q.trim()}”.</p> : null}
      </div>
    </div>
  );
}
