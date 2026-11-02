"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type SettingsNavItem = { id: string; label: string; hint?: string };

/**
 * The section list beside (large screens) or above (small screens) a Settings page. Plain `#anchor` links, so it
 * works without JavaScript; the script only highlights the section you are reading.
 */
export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const key = items.map((i) => i.id).join("|");

  useEffect(() => {
    const els = key.split("|").map((id) => document.getElementById(id)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
        // The first section (in page order) that is inside the reading band wins.
        const first = els.find((el) => seen.has(el.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);

  return (
    <nav
      aria-label="Settings sections"
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-mist bg-canvas/95 px-4 py-2 backdrop-blur max-lg:sticky max-lg:top-16 max-lg:z-10 sm:-mx-8 sm:px-8 lg:sticky lg:top-8 lg:mx-0 lg:block lg:space-y-1 lg:self-start lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0"
    >
      {items.map((i) => {
        const on = i.id === active;
        return (
          <a
            key={i.id}
            href={`#${i.id}`}
            onClick={() => setActive(i.id)}
            aria-current={on ? "location" : undefined}
            className={cn(
              "block shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors lg:whitespace-normal",
              on ? "bg-brand-50 text-brand-800" : "text-ink-muted hover:bg-mist-100 hover:text-ink",
            )}
          >
            {i.label}
            {i.hint ? <span className="hidden text-xs font-normal text-ink-muted lg:block">{i.hint}</span> : null}
          </a>
        );
      })}
    </nav>
  );
}
