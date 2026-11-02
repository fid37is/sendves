import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-mist bg-white", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-3 border-b border-mist px-4 py-4 sm:px-6 sm:py-5">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{action}</div> : null}
    </div>
  );
}