"use client";

import { useCallback, useState } from "react";
import { AudienceSlider } from "@/components/billing/audience-slider";
import { PlanCards } from "@/components/marketing/plan-cards";
import { ANNUAL_BILLING_ENABLED, ANNUAL_MONTHS_PAID, DEFAULT_AUDIENCE, type BillingInterval } from "@/config/plan-limits";
import { cn } from "@/lib/utils";

const OPTIONS: { value: BillingInterval; label: string }[] = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Annual" },
];

/** Monthly / Annual switch. The highlight slides between the two instead of jumping, and nothing reloads. */
function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
  const at = value === "year" ? 1 : 0;
  return (
    <div className="flex flex-col items-center gap-3">
      <div role="radiogroup" aria-label="Billing interval" className="relative grid w-full max-w-xs grid-cols-2 rounded-full border border-mist bg-mist-100 p-1">
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-brand-700 shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(${at * 100}%)` }}
        />
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 h-10 rounded-full text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2",
              value === o.value ? "text-white" : "text-ink-soft hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-center text-sm text-ink-soft">Annual pays for {ANNUAL_MONTHS_PAID} months and covers 12.</p>
    </div>
  );
}

/**
 * The pricing page's controls and plan cards: the slider (or the contact picker beside it) sets the audience size, the toggle
 * sets the interval, and every plan reprices smoothly. The choice travels to /register when a plan's trial button is pressed.
 */
export function PricingExplorer({ interval: initialInterval, audience: initialAudience = DEFAULT_AUDIENCE }: { interval: BillingInterval; audience?: number }) {
  const [audience, setAudience] = useState(initialAudience);
  const [interval, setIntervalState] = useState<BillingInterval>(initialInterval);

  // Keep the address in step with the choice so a copied link or a reload opens on the same plan, without navigating.
  const remember = useCallback((a: number, i: BillingInterval) => {
    const url = new URL(window.location.href);
    url.searchParams.set("audience", String(a));
    if (i === "year") url.searchParams.set("billing", "year");
    else url.searchParams.delete("billing");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return (
    <>
      <div className="mx-auto mb-10 w-full max-w-5xl rounded-3xl border border-mist bg-white p-6 sm:p-8">
        <AudienceSlider value={audience} onChange={setAudience} onCommit={(a) => remember(a, interval)} />
        {ANNUAL_BILLING_ENABLED ? (
          <div className="mt-6 border-t border-mist pt-6">
            <IntervalToggle value={interval} onChange={(v) => { setIntervalState(v); remember(audience, v); }} />
          </div>
        ) : null}
      </div>
      <PlanCards interval={interval} audience={audience} />
    </>
  );
}
