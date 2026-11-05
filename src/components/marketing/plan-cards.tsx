"use client";

import { Check } from "lucide-react";
import { plansAt } from "@/config/plans";
import { audienceLimits, DEFAULT_AUDIENCE, priceFor, type BillingInterval, type SelfServePlan } from "@/config/plan-limits";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const whole = (v: number) => Math.round(v).toLocaleString("en-US");
const usd = (v: number) => {
  const cents = Math.round(v * 100) / 100;
  return `$${cents.toLocaleString("en-US", { minimumFractionDigits: cents % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

/** The registration link for a plan: the plan, audience size and billing interval travel with the person to the sign-up form. */
export const registerHref = (plan: string, audience: number, interval: BillingInterval) => `/register?plan=${plan}&audience=${audience}&billing=${interval}`;

/** The plan cards. Prices, contacts and emails glide to their new values when the audience size or billing interval changes. */
export function PlanCards({ interval = "month", audience = DEFAULT_AUDIENCE }: { interval?: BillingInterval; audience?: number }) {
  const limits = audienceLimits(audience);
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {plansAt(audience).map((plan) => {
        const selfServe = plan.id !== "custom";
        const id = plan.id as SelfServePlan;
        return (
          <div
            key={plan.id}
            className={cn(
              "flex flex-col rounded-3xl border bg-white p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-brand-900/10",
              plan.highlight ? "border-brand-700 ring-2 ring-brand-700" : "border-mist",
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink">{plan.name}</h3>
              {plan.highlight ? <span className="rounded-full bg-brand-700 px-3 py-1 text-xs font-semibold text-white">Most popular</span> : null}
            </div>
            <p className="mt-2 min-h-[40px] text-sm text-ink-soft">{plan.blurb}</p>
            <p className="mt-5 flex items-baseline gap-2">
              {selfServe ? (
                <AnimatedNumber value={priceFor(id, audience, interval)} format={usd} className="font-display text-4xl font-extrabold text-ink" />
              ) : (
                <span className="font-display text-4xl font-extrabold text-ink">{plan.price}</span>
              )}
              <span className="text-sm text-ink-muted">{selfServe ? (interval === "year" ? "per year" : "per month") : plan.period}</span>
            </p>
            {/* Always rendered so the cards keep their height when the interval is switched. */}
            <p className={cn("mt-1 min-h-[20px] text-sm font-semibold text-success transition-opacity duration-300", selfServe && interval === "year" && plan.annual ? "opacity-100" : "opacity-0")} aria-hidden={!(selfServe && interval === "year")}>
              {selfServe ? <>{plan.annual?.note}. About <AnimatedNumber value={priceFor(id, audience, "year") / 12} format={usd} /> a month.</> : null}
            </p>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-ink-muted">Businesses</dt><dd className="text-right font-semibold text-ink">{plan.businesses}</dd></div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Contacts</dt>
                <dd className="text-right font-semibold text-ink">{selfServe ? <><AnimatedNumber value={limits.contacts} format={whole} /> pooled contacts</> : plan.contacts}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Sending</dt>
                <dd className="text-right font-semibold text-ink">{selfServe ? <><AnimatedNumber value={limits.monthlySends} format={whole} /> pooled emails / month</> : plan.sends}</dd>
              </div>
            </dl>
            <ul className="mt-6 flex-1 space-y-3 border-t border-mist pt-6">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-ink-soft">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <ButtonLink href={selfServe ? registerHref(plan.id, audience, interval) : "/contact"} variant={plan.highlight ? "primary" : "outline"} className="mt-8 w-full">
              {plan.cta}
            </ButtonLink>
          </div>
        );
      })}
    </div>
  );
}
