import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = { key: string; label: string; href: string; count?: number | string };

/** Page-level tabs that are plain links (the active tab lives in the URL), so they work without JavaScript and can be bookmarked. */
export function LinkTabs({ tabs, active, label = "Sections" }: { tabs: TabItem[]; active: string; label?: string }) {
  return (
    // The rule under the tabs is drawn by this wrapper, and the row slides down by 1px to sit on it. Putting the
    // overlap on the scrolling row itself (a negative margin on each tab) made the row 1px taller than its box,
    // which browsers show as a tiny vertical scrollbar even though nothing scrolls.
    <div className="mb-6 border-b border-mist">
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto overflow-y-hidden">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
              on ? "border-brand-700 text-brand-800" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", on ? "bg-brand-50 text-brand-800" : "bg-mist-100 text-ink-muted")}>{t.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
    </div>
  );
}

/** A small label/value list for facts about one thing (a campaign, a workspace, a person). */
export function FactList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 p-6 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{i.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-ink">{i.value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}
