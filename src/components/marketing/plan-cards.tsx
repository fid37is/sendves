import { Check } from "lucide-react";
import { plans } from "@/config/plans";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PlanCards() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => (
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
            <span className="font-display text-4xl font-extrabold text-ink">{plan.price}</span>
            <span className="text-sm text-ink-muted">{plan.period}</span>
          </p>
          <dl className="mt-5 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-ink-muted">Contacts</dt><dd className="font-semibold text-ink">{plan.contacts}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Sending</dt><dd className="font-semibold text-ink">{plan.sends}</dd></div>
          </dl>
          <ul className="mt-6 flex-1 space-y-3 border-t border-mist pt-6">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-ink-soft">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
          <ButtonLink href={plan.id === "scale" ? "/contact" : "/register"} variant={plan.highlight ? "primary" : "outline"} className="mt-8 w-full">
            {plan.cta}
          </ButtonLink>
        </div>
      ))}
    </div>
  );
}
