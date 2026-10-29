"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion, useInView } from "@/components/motion/use-in-view";

const PATTERN = /^(\D*)(\d[\d,]*(?:\.\d+)?)(.*)$/;

function format(n: number, decimals: number, commas: boolean) {
  const fixed = n.toFixed(decimals);
  if (!commas) return fixed;
  const [int, dec] = fixed.split(".");
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dec ? `.${dec}` : "");
}

/**
 * Counts a formatted value such as "12,480", "98.4%" or "2.4M" up from zero
 * the first time it is on screen. Values with no number ("-") render unchanged.
 */
export function CountUp({ value, duration = 1400, className }: { value: string; duration?: number; className?: string }) {
  const match = PATTERN.exec(value);
  const [ref, , seen] = useInView<HTMLSpanElement>({ threshold: 0.4 });

  const prefix = match?.[1] ?? "";
  const numeric = match?.[2] ?? "";
  const suffix = match?.[3] ?? "";
  const target = match ? parseFloat(numeric.replace(/,/g, "")) : 0;
  const decimals = numeric.includes(".") ? numeric.split(".")[1].length : 0;
  const commas = numeric.includes(",");

  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!match || !seen) return;
    if (prefersReducedMotion()) {
      setCurrent(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      setCurrent(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, target, duration]);

  if (!match) return <span className={className}>{value}</span>;

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="tabular-nums">
        {prefix}
        {format(current, decimals, commas)}
        {suffix}
      </span>
    </span>
  );
}
