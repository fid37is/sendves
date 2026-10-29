"use client";

import { Mail } from "lucide-react";
import { useInView } from "@/components/motion/use-in-view";
import { cn } from "@/lib/utils";

type Step = { title: string; text: string };

/**
 * The three setup steps as a real sequence: a line travels from step to step,
 * carrying an envelope, and each step lights up as it arrives.
 */
export function StepsFlow({ steps }: { steps: Step[] }) {
  const [ref, ready, seen] = useInView<HTMLDivElement>({ threshold: 0.3 });
  const on = !ready || seen; // stay in the finished state until the hook has mounted
  const play = ready && seen;

  return (
    <div ref={ref} className="relative mt-14">
      <div className="absolute left-5 right-[calc(33.333%_-_9px)] top-[18px] hidden h-1 rounded-full bg-brand-100 lg:block" aria-hidden="true" />
      <div
        className="absolute left-5 top-[18px] hidden h-1 rounded-full bg-brand-600 lg:block"
        style={{
          width: on ? "calc(66.666% - 11px)" : "0%",
          transition: play ? "width 1.9s cubic-bezier(.55,0,.2,1) .25s" : "none",
        }}
        aria-hidden="true"
      >
        <span className="absolute -right-3 -top-[11px] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-white shadow-md ring-1 ring-brand-200">
          <Mail className="h-3.5 w-3.5 text-brand-800" />
        </span>
      </div>

      <ol className="relative grid gap-8 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span
              className={cn(
                "relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-base font-extrabold",
                on ? "bg-brand-700 text-white" : "bg-white text-brand-800 ring-2 ring-brand-200",
              )}
              style={{
                transform: on ? "scale(1)" : "scale(0.8)",
                transition: play ? `transform .5s cubic-bezier(.2,.9,.3,1.4) ${0.25 + i * 0.95}s, background-color .3s ${0.25 + i * 0.95}s, color .3s ${0.25 + i * 0.95}s` : "none",
              }}
            >
              {i + 1}
            </span>
            <div
              className={cn("mt-5 rounded-3xl border bg-white p-7", on ? "border-brand-200" : "border-transparent")}
              style={{ transition: play ? `border-color .6s ${0.25 + i * 0.95}s` : "none" }}
            >
              <h3 className="text-lg font-bold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
