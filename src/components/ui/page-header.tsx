import { AnimatedBar } from "@/components/motion/animated-bar";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/layout/back-button";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-4 sm:mb-8">
      <div className="flex min-w-0 items-start gap-3">
        <BackButton />
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-extrabold text-ink sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{description}</p> : null}
        </div>
      </div>
      {/* Page actions always sit on the right, also when they wrap onto their own line on a phone. */}
      {action ? <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-3">{action}</div> : null}
    </div>
  );
}

type Delta = { text: string; dir: "up" | "down" | "flat" };

/**
 * `progress` (0 to 1) adds a bar that fills as the page loads, for usage against a limit.
 * `delta` shows change against the previous period; `higherIsBetter={false}` colours a rise as bad
 * (bounces, complaints). `status` colours the value itself when it is judged against a threshold.
 */
export function StatCard({
  label, value, note, progress, delta, higherIsBetter = true, status,
}: {
  label: string; value: string; note?: string; progress?: number;
  delta?: Delta | null; higherIsBetter?: boolean; status?: "good" | "warn" | "bad";
}) {
  const good = delta ? (delta.dir === "flat" ? null : (delta.dir === "up") === higherIsBetter) : null;
  const Arrow = delta?.dir === "up" ? ArrowUpRight : delta?.dir === "down" ? ArrowDownRight : ArrowRight;
  return (
    <div className="min-w-0 rounded-2xl border border-mist bg-white p-4 transition-shadow duration-300 hover:shadow-lg hover:shadow-night/5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold",
              good === null ? "bg-accent-100 text-ink-soft" : good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
            title="Compared with the previous period"
          >
            <Arrow className="h-3 w-3" aria-hidden="true" />
            {delta.text}
          </span>
        ) : null}
      </div>
      <p className={cn("mt-2 break-words font-display text-2xl font-extrabold sm:text-3xl", status === "bad" ? "text-danger" : status === "warn" ? "text-warning" : status === "good" ? "text-success" : "text-ink")}>
        <CountUp value={value} />
      </p>
      {progress !== undefined ? <AnimatedBar value={progress} className="mt-3" label={`${label} used`} /> : null}
      {note ? <p className="mt-2 text-xs text-ink-muted">{note}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-mist bg-white px-4 py-12 text-center sm:px-6 sm:py-14">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}