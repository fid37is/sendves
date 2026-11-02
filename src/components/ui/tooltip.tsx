import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A small label that appears above its child on hover or keyboard focus. CSS only, so it needs no state.
 * `align="end"` lines the tooltip up with the child's right edge, for controls at the edge of a panel.
 */
export function Tooltip({ label, children, align = "center", multiline = false, className }: { label: string; children: ReactNode; align?: "center" | "end"; /** Lets the label wrap, and honours line breaks (\n) in it. */ multiline?: boolean; className?: string }) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      {label ? <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full z-30 mb-2 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          multiline ? "w-max max-w-[16rem] whitespace-pre-line" : "whitespace-nowrap",
          align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
        )}
      >
        {label}
      </span> : null}
    </span>
  );
}