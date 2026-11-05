/**
 * Display copy for the plans. Every NUMBER here is built from plan-limits.ts, so the pricing page, the billing screen
 * and the server-side checks can never disagree. Edit prices and allowances there, not here.
 */
import { ANNUAL_MONTHS_PAID, planLimits, planPrices, PLAN_IDS, type BillingInterval, type PlanId, type SelfServePlan } from "./plan-limits";

export type Plan = {
  id: PlanId;
  name: string;
  /** "$109", or "Custom" for the plan that is agreed with us. */
  price: string;
  period: string;
  /** Annual price ("$1,199") and what it works out to per month. Absent for Custom. */
  annual?: { price: string; perMonth: string; note: string };
  blurb: string;
  businesses: string;
  contacts: string;
  sends: string;
  features: string[];
  highlight?: boolean;
  cta: string;
};

const n = (v: number) => v.toLocaleString("en-US");
const workspaces = (v: number) => `${v} business ${v === 1 ? "workspace" : "workspaces"}`;

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const annualOf = (id: SelfServePlan) => {
  const yearly = planPrices[id].year;
  return yearly === null ? undefined : { price: usd(yearly), perMonth: usd(Math.round((yearly / 12) * 100) / 100), note: `${ANNUAL_MONTHS_PAID} months for 12` };
};

const base = (id: Exclude<PlanId, "custom">) => ({
  price: `$${planPrices[id as SelfServePlan].month}`,
  period: "per month",
  annual: annualOf(id as SelfServePlan),
  businesses: workspaces(planLimits[id].businesses),
  contacts: `${n(planLimits[id].contacts)} pooled contacts`,
  sends: `${n(planLimits[id].monthlySends)} pooled emails / month`,
  cta: `Start ${planLimits[id].trialDays}-day free trial`,
});

export const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    ...base("starter"),
    blurb: "For solo founders and one-business operators.",
    features: ["Email editor and templates", "Scheduling", "A/B subject tests", "Signup forms", "Unsubscribe and bounce handling", "Reports"],
  },
  {
    id: "growth",
    name: "Growth",
    ...base("growth"),
    blurb: "For founders running up to two businesses.",
    features: ["Everything in Starter", "Segmentation", "Team seats", "Priority support"],
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    ...base("pro"),
    blurb: "For operators, agencies and multi-brand owners.",
    features: ["Everything in Growth", `Twice the monthly emails of Growth`, "Room for up to five brands"],
  },
  {
    id: "custom",
    name: "Custom",
    price: "Custom",
    period: "talk to us",
    blurb: "For larger organisations and agencies.",
    businesses: "Business workspaces by agreement",
    contacts: "Contacts by agreement",
    sends: "Emails by agreement",
    features: ["Everything in Pro", "Limits set in your agreement", "Dedicated IP option", "API access", "Service-level agreement"],
    cta: "Contact sales",
  },
];

export const planByIdMap = new Map(plans.map((p) => [p.id, p]));
export const planName = (id: string): string => planByIdMap.get(id as PlanId)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
export const PLAN_ORDER: readonly PlanId[] = PLAN_IDS;
export const TRIAL_PROMISE = `${planLimits.starter.trialDays}-day free trial on every plan.`;

/** What to show for a plan at a billing interval, optionally with a percentage off the first payment. */
export function displayPrice(plan: Plan, interval: BillingInterval, percentOff = 0): { price: string; was: string | null; period: string } {
  if (plan.id === "custom") return { price: plan.price, was: null, period: plan.period };
  const id = plan.id as SelfServePlan;
  const list = interval === "year" ? planPrices[id].year ?? planPrices[id].month : planPrices[id].month;
  const period = interval === "year" && planPrices[id].year !== null ? "per year" : "per month";
  const now = percentOff > 0 ? Math.round(list * (100 - percentOff)) / 100 : list;
  return { price: usd(now), was: percentOff > 0 ? usd(list) : null, period };
}
