"use client";

import { cn } from "@/lib/utils";

/** A card with a soft glow that follows the pointer. Pure CSS once the pointer position is set. */
export function SpotlightCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div onPointerMove={onMove} className={cn("spot", className)}>
      {children}
    </div>
  );
}
