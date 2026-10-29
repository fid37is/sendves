"use client";

import { useInView } from "@/components/motion/use-in-view";

/** Compliance checklist whose ticks draw themselves, one after another. */
export function DeliverabilityChecks({ items }: { items: string[] }) {
  const [ref, ready, seen] = useInView<HTMLUListElement>({ threshold: 0.3 });
  const on = !ready || seen;
  const play = ready && seen;

  return (
    <ul ref={ref} className="space-y-3">
      {items.map((text, i) => {
        const delay = 0.15 + i * 0.28;
        return (
          <li
            key={text}
            className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-white"
            style={{
              opacity: on ? 1 : 0,
              transform: on ? "none" : "translateX(18px)",
              transition: play ? `opacity .5s ${delay}s, transform .6s cubic-bezier(.2,.8,.2,1) ${delay}s` : "none",
            }}
          >
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: on ? "#22C55E" : "rgba(255,255,255,.12)",
                transition: play ? `background-color .3s ${delay + 0.2}s` : "none",
              }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset={on ? 0 : 1}
                  style={{ transition: play ? `stroke-dashoffset .45s ease-out ${delay + 0.25}s` : "none" }}
                />
              </svg>
            </span>
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
