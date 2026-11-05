"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AUDIENCE_STEPS } from "@/config/plan-limits";

const n = (v: number) => v.toLocaleString("en-US");
const last = AUDIENCE_STEPS.length - 1;
const stepAt = (i: number) => AUDIENCE_STEPS[Math.min(last, Math.max(0, i))];

/** The audience-size slider. It moves through the audience sizes we sell, smallest to largest, and every plan's price follows it. */
export function AudienceSlider({ value, onChange, onCommit }: { value: number; onChange: (audience: number) => void; onCommit?: (audience: number) => void }) {
  const id = useId();
  const index = Math.max(0, AUDIENCE_STEPS.indexOf(value));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">Audience size</label>
        <output htmlFor={id} className="text-sm font-semibold text-ink">{n(value)} contacts</output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={last}
        step={1}
        value={index}
        onChange={(e) => onChange(stepAt(Number(e.target.value)))}
        onPointerUp={(e) => onCommit?.(stepAt(Number(e.currentTarget.value)))}
        onKeyUp={(e) => onCommit?.(stepAt(Number(e.currentTarget.value)))}
        aria-valuetext={`${n(value)} contacts`}
        className="mt-3 w-full accent-brand-700"
      />
      <div className="mt-1 flex justify-between text-xs text-ink-muted"><span>{n(AUDIENCE_STEPS[0])}</span><span>{n(AUDIENCE_STEPS[last])}</span></div>
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
