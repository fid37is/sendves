/**
 * The ONE source for plan entitlements and prices. The pricing page, billing screen, server-side
 * checks and checkout all read from here (display copy lives in plans.ts and is built from this file).
 *
 * Scope of each limit (see the pricing specification, section 5):
 *   - businesses, contacts, monthlySends  -> ACCOUNT-POOLED. Counted once across every business on the subscription.
 *   - maxDaily, startDaily, domains       -> PER BUSINESS. Never pooled.
 * Never copy a pooled limit onto a business record.
 */
export type PlanId = "starter" | "growth" | "pro" | "custom";
export const PLAN_IDS = ["starter", "growth", "pro", "custom"] as const;
/** Plans a customer can pick and pay for without talking to us. */
export const SELF_SERVE_PLANS = ["starter", "growth", "pro"] as const;
export type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];
export type BillingInterval = "month" | "year";

export type Limits = {
  /** Pooled: business workspaces the subscription covers (the spec's business_slots). */
  businesses: number;
  /** Pooled: contacts across every business on the account. */
  contacts: number;
  /** Pooled: emails per billing period across every business on the account. */
  monthlySends: number;
  trialDays: number;
  /** Pooled: emails the whole account may send during its trial. The same for every plan (see TRIAL_SENDS). */
  trialSends: number;
  /** Per business: ceiling for the daily send limit that warm-up may reach. PLACEHOLDER: confirm (spec section 11). */
  maxDaily: number;
  /** Per business: where the daily send limit starts. PLACEHOLDER: confirm (spec section 11). */
  startDaily: number;
  /** Per business: sending domains. PLACEHOLDER: carried over from the previous catalogue, confirm (spec section 11). */
  domains: number;
};

/** Total emails an account may send during its 14-day trial, across all its businesses. Same on every plan. */
const TRIAL_SENDS = 2_000;

export const planLimits: Record<PlanId, Limits> = {
  starter: { businesses: 1, contacts: 5_000, monthlySends: 60_000, trialDays: 14, trialSends: TRIAL_SENDS, maxDaily: 5_000, startDaily: 2_000, domains: 3 },
  growth: { businesses: 2, contacts: 27_000, monthlySends: 324_000, trialDays: 14, trialSends: TRIAL_SENDS, maxDaily: 25_000, startDaily: 10_000, domains: 10 },
  pro: { businesses: 5, contacts: 27_000, monthlySends: 648_000, trialDays: 14, trialSends: TRIAL_SENDS, maxDaily: 25_000, startDaily: 10_000, domains: 10 },
  // Custom is a floor for the numbers below. A real agreement is stored as entitlement overrides on the account.
  custom: { businesses: 10, contacts: 100_000, monthlySends: 1_000_000, trialDays: 14, trialSends: TRIAL_SENDS, maxDaily: 100_000, startDaily: 50_000, domains: 50 },
};

/** Annual billing pays for this many months and covers twelve ("11 months for 12"). */
export const ANNUAL_MONTHS_PAID = 11;

/** List prices in USD. `year` is derived from the monthly price, so the two can't drift apart. */
export const planPrices: Record<SelfServePlan, { month: number; year: number | null }> = {
  starter: { month: 29, year: 29 * ANNUAL_MONTHS_PAID },
  growth: { month: 109, year: 109 * ANNUAL_MONTHS_PAID },
  pro: { month: 139, year: 139 * ANNUAL_MONTHS_PAID },
};

/**
 * Annual billing is on. A payment method only offers it once its annual price id (Stripe) or amount (Paystack) is set in
 * the environment, so turning this on never lets anyone pick something that can't be charged. Set to false to hide annual everywhere.
 */
export const ANNUAL_BILLING_ENABLED = true;

/** Old plan names still found in old rows, webhooks in flight or bookmarks. Free no longer exists. */
const LEGACY: Record<string, PlanId> = { free: "starter", scale: "custom" };

export function normalizePlanId(raw: unknown): PlanId {
  const v = String(raw ?? "").trim().toLowerCase();
  if ((PLAN_IDS as readonly string[]).includes(v)) return v as PlanId;
  return LEGACY[v] ?? "starter";
}

export function isSelfServePlan(v: unknown): v is SelfServePlan {
  return (SELF_SERVE_PLANS as readonly string[]).includes(String(v));
}

/** The plan's own numbers. Use resolveEntitlements() for an account, which also applies its overrides. */
export function limitsFor(plan: string): Limits {
  return planLimits[normalizePlanId(plan)];
}

export const ENTITLEMENT_KEYS = ["businesses", "contacts", "monthlySends", "trialDays", "trialSends", "maxDaily", "startDaily", "domains"] as const satisfies readonly (keyof Limits)[];

/**
 * What an account may use: its plan's numbers, replaced key by key by any stored overrides
 * (Custom agreements, grandfathered accounts). Anything that is not a whole number >= 0 is ignored.
 */
export function resolveEntitlements(plan: string, overrides: unknown): Limits {
  const out: Limits = { ...limitsFor(plan) };
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    const o = overrides as Record<string, unknown>;
    for (const k of ENTITLEMENT_KEYS) {
      const v = o[k];
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

const RANK: Record<PlanId, number> = { starter: 0, growth: 1, pro: 2, custom: 3 };
export const planRank = (plan: string): number => RANK[normalizePlanId(plan)];

/**
 * The smallest plan that covers `businessesNeeded`: Starter -> Growth for a 2nd business,
 * Growth -> Pro for a 3rd to 5th, Pro -> Custom beyond that. Null when the current plan already covers it.
 */
export function nextPlanForBusinesses(current: string, businessesNeeded: number): PlanId | null {
  const from = planRank(current);
  for (const id of PLAN_IDS) {
    if (RANK[id] > from && (id === "custom" || planLimits[id].businesses >= businessesNeeded)) return id;
  }
  return null;
}
