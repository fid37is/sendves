import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow, rangeLabel } from "@/lib/inbox-format";
import { PAGE_SIZES } from "@/lib/inbox";
import { cn } from "@/lib/utils";

/** Paging only appears once a folder holds this many conversations. */
export const PAGER_FROM = 20;

const arrow = "inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors";

/** "1–30 of 120" with older and newer arrows, as at the top of a mail list. */
export function RangePager({ page, size, total, hrefFor }: { page: number; size: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  // One page of mail needs no arrows, and "0 of 0" says nothing.
  if (total < PAGER_FROM || pages <= 1) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-ink-muted">
      <span className="px-2" aria-live="polite">{rangeLabel(page, size, total)}</span>
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} aria-label="Newer" title="Newer" className={cn(arrow, "hover:bg-mist-100 hover:text-ink")}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Link>
      ) : (
        <span aria-hidden="true" className={cn(arrow, "opacity-40")}><ChevronLeft className="h-4 w-4" /></span>
      )}
      {page < pages ? (
        <Link href={hrefFor(page + 1)} aria-label="Older" title="Older" className={cn(arrow, "hover:bg-mist-100 hover:text-ink")}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
      ) : (
        <span aria-hidden="true" className={cn(arrow, "opacity-40")}><ChevronRight className="h-4 w-4" /></span>
      )}
    </div>
  );
}

/** Page numbers at the foot of the list, with how many rows a page holds. */
export function NumberedPager({
  page, size, total, hrefFor, sizeHref,
}: {
  page: number; size: number; total: number; hrefFor: (page: number) => string; sizeHref: (size: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total < PAGER_FROM) return null;
  const item = "inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-mist px-3 py-3 sm:px-4">
      <p className="flex items-center gap-1 text-sm text-ink-muted">
        <span className="mr-1">Rows</span>
        {PAGE_SIZES.map((n) => (
          <Link key={n} href={sizeHref(n)} aria-current={n === size ? "true" : undefined} className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold", n === size ? "bg-brand-50 text-brand-800" : "hover:bg-mist-100")}>{n}</Link>
        ))}
      </p>
      {pages > 1 ? (
        <nav className="ml-auto flex flex-wrap items-center justify-end gap-1" aria-label="Pages">
          {page > 1 ? <Link href={hrefFor(page - 1)} className={cn(item, "text-ink-soft hover:bg-mist-100")}>Previous</Link> : null}
          {pageWindow(page, pages).map((n, i) => n === null
            ? <span key={`gap-${i}`} className="px-1 text-ink-muted" aria-hidden="true">…</span>
            : <Link key={n} href={hrefFor(n)} aria-current={n === page ? "page" : undefined} className={cn(item, n === page ? "bg-brand-700 text-white" : "text-ink-soft hover:bg-mist-100")}>{n}</Link>)}
          {page < pages ? <Link href={hrefFor(page + 1)} className={cn(item, "text-ink-soft hover:bg-mist-100")}>Next</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}