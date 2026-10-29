"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import { ArrowLeft } from "lucide-react";

/** Where "back" goes from the current page. Provided by AppShell; null on the home page. */
export type BackTarget = { href: string; label: string } | null;
export const BackContext = createContext<BackTarget>(null);

/**
 * Round arrow shown beside a page title (see PageHeader). It links to the page's section list,
 * or to the home page from a section's own page, and renders nothing on the home page.
 */
export function BackButton() {
  const back = useContext(BackContext);
  if (!back) return null;
  return (
    <Link
      href={back.href}
      aria-label={`Back to ${back.label}`}
      title={`Back to ${back.label}`}
      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-mist bg-white text-ink-soft transition-colors hover:border-ink/30 hover:bg-mist-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 sm:mt-1 sm:h-10 sm:w-10"
    >
      <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
    </Link>
  );
}