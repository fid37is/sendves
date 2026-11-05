"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/motion/use-in-view";

/**
 * Eases a number toward its target instead of jumping. A change that arrives mid-flight restarts from where the
 * number is on screen, so quick slider moves never stutter. Honors reduced-motion by jumping straight to the target.
 */
export function useTween(target: number, duration = 380): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    if (current.current === target) return;
    if (prefersReducedMotion()) {
      current.current = target;
      setShown(target);
      return;
    }
    const from = current.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      current.current = t === 1 ? target : from + (target - from) * eased;
      setShown(current.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return shown;
}

/** A number that glides to its new value. `format` receives the in-between values. Screen readers get the final value only. */
export function AnimatedNumber({ value, format, duration, className }: { value: number; format: (v: number) => string; duration?: number; className?: string }) {
  const shown = useTween(value, duration);
  return (
    <span className={className}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden="true" className="tabular-nums">{format(shown)}</span>
    </span>
  );
}
