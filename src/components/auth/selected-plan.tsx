import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { audienceLimits, planLimits, priceFor, ANNUAL_MONTHS_PAID, type BillingInterval, type SelfServePlan } from "@/config/plan-limits";
import { planName } from "@/config/plans";

export type PlanSelection = { plan: SelfServePlan; audience: number; interval: BillingInterval };

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** The plan picked on the pricing page, shown above the sign-up form. The same values are posted with the form (see RegisterForm). */
export function SelectedPlan({ selection }: { selection: PlanSelection }) {
  const { plan, audience, interval } = selection;
  const limits = audienceLimits(audience);
  const businesses = planLimits[plan].businesses;
  const price = priceFor(plan, audience, interval);
  const change = `/pricing?audience=${audience}${interval === "year" ? "&billing=year" : ""}`;
  return (
    <section aria-label="Your selected plan" className="mb-8 rounded-3xl border-2 border-brand-700 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-800">Your plan</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-ink">{planName(plan)}</h2>
        </div>
        <span className="rounded-full bg-brand-700 px-3 py-1 text-xs font-semibold text-white">{planLimits[plan].trialDays}-day free trial</span>
      </div>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="font-display text-3xl font-extrabold text-ink">{usd(price)}</span>
        <span className="text-sm text-ink-muted">{interval === "year" ? "per year" : "per month"}, after your trial</span>
      </p>
      {interval === "year" ? <p className="mt-1 text-sm font-semibold text-success">{ANNUAL_MONTHS_PAID} months for 12. About {usd(Math.round((price / 12) * 100) / 100)} a month.</p> : null}
      <ul className="mt-5 space-y-2 border-t border-mist pt-5 text-sm text-ink-soft">
        {[
          `${n(audience)} pooled contacts`,
          `${n(limits.monthlySends)} pooled emails / month`,
          `${businesses} business ${businesses === 1 ? "workspace" : "workspaces"}`,
          "Nothing to pay today. No credit card needed to start.",
        ].map((t) => (
          <li key={t} className="flex items-start gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />{t}</li>
        ))}
      </ul>
      <ButtonLink href={change} variant="outline" size="sm" className="mt-6 w-full">Change plan or audience size</ButtonLink>
    </section>
  );
}
