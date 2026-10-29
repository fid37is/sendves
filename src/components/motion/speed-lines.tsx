import { cn } from "@/lib/utils";

const lines = [
  { top: 6, w: 240, h: 4, d: 17, delay: -4 },
  { top: 14, w: 120, h: 3, d: 12, delay: -9 },
  { top: 27, w: 300, h: 5, d: 21, delay: -13 },
  { top: 38, w: 160, h: 3, d: 14, delay: -2 },
  { top: 52, w: 260, h: 4, d: 19, delay: -7 },
  { top: 63, w: 110, h: 3, d: 11, delay: -10 },
  { top: 74, w: 320, h: 5, d: 23, delay: -16 },
  { top: 85, w: 180, h: 4, d: 15, delay: -5 },
  { top: 93, w: 130, h: 3, d: 13, delay: -12 },
];

/** Drifting streaks that echo the lines on the Sendves logo. Decorative and hidden when motion is reduced. */
export function SpeedLines({ tone = "brand", className }: { tone?: "brand" | "light"; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {lines.map((l, i) => (
        <span
          key={i}
          className={cn("animate-drift absolute left-0 rounded-full", tone === "brand" ? "bg-accent-400/[0.20]" : "bg-brand-500/[0.12]")}
          style={{ top: `${l.top}%`, width: l.w, height: l.h, animationDuration: `${l.d}s`, animationDelay: `${l.delay}s` }}
        />
      ))}
    </div>
  );
}
