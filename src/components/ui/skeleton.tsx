import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-mist-100", className)} />;
}

/**
 * Shown instantly while a dashboard or admin page loads its data, so a click always responds
 * immediately. Mirrors the real layout (header, stat cards, two panels) to avoid layout jumps.
 */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-mist bg-white p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-8 w-20" />
            <Skeleton className="mt-4 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-mist bg-white p-6"><Skeleton className="h-64 w-full" /></div>
        <div className="rounded-2xl border border-mist bg-white p-6"><Skeleton className="h-64 w-full" /></div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
