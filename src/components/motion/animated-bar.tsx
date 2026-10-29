"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** A progress bar that fills from empty after it mounts. `value` is 0 to 1. */
export function AnimatedBar({ value, className, barClassName, label }: { value: number; className?: string; barClassName?: string; label?: string }) {
  const [width, setWidth] = useState(0);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped]);

  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-mist-100", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full bg-brand-600 transition-[width] duration-[1200ms] ease-out", barClassName)}
        style={{ width: `${width * 100}%` }}
      />
    </div>
  );
}
