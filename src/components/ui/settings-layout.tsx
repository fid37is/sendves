import type { ReactNode } from "react";
import { SettingsNav, type SettingsNavItem } from "@/components/ui/settings-nav";

export type { SettingsNavItem };

/**
 * One Settings page, many sections. The sections are stacked on a single page and the navigation jumps between
 * them (and follows you as you scroll), so nothing is hidden behind a tab or a separate address.
 */
export function SettingsLayout({ sections, children }: { sections: SettingsNavItem[]; children: ReactNode }) {
  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[210px_minmax(0,1fr)]">
      <SettingsNav items={sections} />
      <div className="min-w-0 max-w-3xl space-y-14 pb-16">{children}</div>
    </div>
  );
}

/** A titled group of cards. `id` is the anchor the navigation jumps to. */
export function SettingsSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 lg:scroll-mt-8">
      <div className="mb-5">
        <h2 id={`${id}-title`} className="font-display text-xl font-extrabold text-ink">{title}</h2>
        {description ? <p className="mt-1 max-w-xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      <div className="grid gap-6">{children}</div>
    </section>
  );
}
