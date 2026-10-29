/** Numeric limits per plan. Display copy lives in plans.ts. */
export type PlanId = "free" | "starter" | "growth" | "scale";

export const planLimits: Record<PlanId, { contacts: number; monthlySends: number; maxDaily: number; startDaily: number; domains: number }> = {
  free: { contacts: 500, monthlySends: 2000, maxDaily: 500, startDaily: 200, domains: 1 },
  starter: { contacts: 5000, monthlySends: 50000, maxDaily: 5000, startDaily: 2000, domains: 3 },
  growth: { contacts: 25000, monthlySends: 250000, maxDaily: 25000, startDaily: 10000, domains: 10 },
  scale: { contacts: 100000, monthlySends: 1000000, maxDaily: 100000, startDaily: 50000, domains: 50 },
};

export function limitsFor(plan: string) {
  return planLimits[(plan as PlanId) in planLimits ? (plan as PlanId) : "free"];
}
