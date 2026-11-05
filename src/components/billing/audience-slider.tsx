"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { AUDIENCE_STEPS } from "@/config/plan-limits";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("en-US");
const last = AUDIENCE_STEPS.length - 1;
const clampIndex = (i: number) => Math.min(last, Math.max(0, i));
const indexOf = (audience: number) => clampIndex(Math.max(0, AUDIENCE_STEPS.indexOf(audience)));
const short = (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v));

/** Labels under the track. They sit where their audience size sits on the track, so a label always lines up with the grabber. */
const TICKS = [500, 25_000, 65_000, 110_000, 150_000, 200_000].filter((v) => AUDIENCE_STEPS.includes(v));

/**
 * The audience-size slider. It moves through the audience sizes we sell, smallest to largest, and every plan's price follows it.
 *
 * - The grabber follows the finger or pointer continuously, then glides to the nearest size on release, so nothing skips.
 * - The picker beside the title does the same job for anyone who would rather choose a size than drag: choosing one slides the grabber there.
 * - Keyboard: arrows move one size, Page Up / Page Down five, Home / End the ends.
 * - `onChange` fires whenever the size changes, `onCommit` once when the person has settled on a size.
 */
export function AudienceSlider({ value, onChange, onCommit, className }: { value: number; onChange: (audience: number) => void; onCommit?: (audience: number) => void; className?: string }) {
  const id = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  /** Where the grabber is, 0 to 1. Follows the pointer while dragging, otherwise rests on the chosen size. */
  const [pos, setPos] = useState(indexOf(value) / last);
  const index = indexOf(value);

  // Anything that changes the value from outside (the picker, a reload of the page) glides the grabber to the new size.
  useEffect(() => {
    if (!dragging) setPos(index / last);
  }, [index, dragging]);

  const fractionAt = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return pos;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, [pos]);

  const apply = (nextIndex: number, commit: boolean) => {
    const v = AUDIENCE_STEPS[clampIndex(nextIndex)];
    if (v !== value) onChange(v);
    if (commit) onCommit?.(v);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = fractionAt(e.clientX);
    setDragging(true);
    setPos(f);
    apply(Math.round(f * last), false);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const f = fractionAt(e.clientX);
    setPos(f);
    apply(Math.round(f * last), false);
  };
  const finish = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    const i = Math.round(fractionAt(e.clientX) * last);
    setPos(i / last);
    apply(i, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const jump: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 };
    let next: number | null = null;
    if (e.key in jump) next = index + jump[e.key];
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    apply(next, true);
  };

  const percent = pos * 100;
  // While dragging the grabber is glued to the pointer; otherwise it eases, so keyboard, picker and release moves are all smooth.
  const glide = dragging ? "" : "transition-[left,width] duration-300 ease-out motion-reduce:transition-none";

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={`${id}-picker`} className="text-base font-bold text-ink sm:text-lg">Set your audience size</label>
        <div className="relative">
          <select
            id={`${id}-picker`}
            value={value}
            onChange={(e) => apply(AUDIENCE_STEPS.indexOf(Number(e.target.value)), true)}
            aria-label="Pick a number of contacts"
            className="h-11 min-w-[9.5rem] cursor-pointer appearance-none rounded-xl border border-mist bg-white pl-4 pr-10 text-sm font-semibold text-ink transition-colors hover:border-ink/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {AUDIENCE_STEPS.map((s) => <option key={s} value={s}>{n(s)} contacts</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        </div>
      </div>

      {/* The whole row is the touch target: tall enough for a thumb, and it never scrolls the page sideways while dragging. */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Audience size"
        aria-orientation="horizontal"
        aria-valuemin={AUDIENCE_STEPS[0]}
        aria-valuemax={AUDIENCE_STEPS[last]}
        aria-valuenow={value}
        aria-valuetext={`${n(value)} contacts`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={onKeyDown}
        className="group relative mx-4 mt-6 flex h-12 cursor-pointer touch-none select-none items-center rounded-full focus-visible:outline-none sm:mx-5"
      >
        <div className="h-3 w-full rounded-full bg-mist" />
        <div className={cn("absolute left-0 h-3 rounded-full bg-brand-700", glide)} style={{ width: `${percent}%` }} />
        <div
          className={cn(
            "absolute top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-brand-700 bg-white shadow-lg shadow-brand-900/25 transition-[box-shadow,transform] duration-200 group-hover:shadow-xl group-focus-visible:ring-4 group-focus-visible:ring-brand-500/30",
            dragging && "scale-110 ring-4 ring-brand-500/25",
            glide,
          )}
          style={{ left: `${percent}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="relative mx-4 mt-1 h-9 text-xs font-medium text-ink-muted sm:mx-5" aria-hidden="true">
        {TICKS.map((t) => {
          const at = AUDIENCE_STEPS.indexOf(t) / last;
          return (
            <span key={t} className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: `${at * 100}%` }}>
              <span className="h-1.5 w-1.5 rounded-full bg-ink-muted/40" />
              {short(t)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The slider on the billing screen. Letting go reloads the page's prices for that audience size, keeping the interval and promo code. */
export function BillingAudienceSlider({ audience, interval, promo }: { audience: number; interval: string; promo?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(audience);
  useEffect(() => setValue(audience), [audience]);
  const commit = (v: number) => {
    if (v === audience) return;
    router.replace(`/app/billing?audience=${v}&interval=${interval}${promo ? `&promo=${encodeURIComponent(promo)}` : ""}#plans`, { scroll: false });
  };
  return <AudienceSlider value={value} onChange={setValue} onCommit={commit} />;
}
