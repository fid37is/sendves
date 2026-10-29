import { AnimatedBar } from "@/components/motion/animated-bar";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action}
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
    <div className="rounded-2xl border border-mist bg-white p-5 transition-shadow duration-300 hover:shadow-lg hover:shadow-night/5">
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
      <p className={cn("mt-2 font-display text-3xl font-extrabold", status === "bad" ? "text-danger" : status === "warn" ? "text-warning" : status === "good" ? "text-success" : "text-ink")}>
        <CountUp value={value} />
      </p>
      {progress !== undefined ? <AnimatedBar value={progress} className="mt-3" label={`${label} used`} /> : null}
      {note ? <p className="mt-2 text-xs text-ink-muted">{note}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-mist bg-white px-6 py-14 text-center">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
