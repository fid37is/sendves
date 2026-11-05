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

/** Annual billing pays for this many months and covers twelve ("10 months for 12"). */
export const ANNUAL_MONTHS_PAID = 10;

/** Emails per month for every contact in the account's audience. The same on every plan. */
export const EMAILS_PER_CONTACT = 12;

/**
 * Audience pricing. Each audience size (contacts) has a reference price: the monthly list price of Sender.net's Standard
 * plan at that size, read from Sender's own pricing slider. Competitors make a business buy one account per business, so
 * a Sendves plan is priced as that reference price x the number of businesses it covers, minus a discount that is already
 * taken off: 20% off for 1 business (Starter), 10% off for 2 (Growth), 10% off for 5 (Pro).
 * 60,000 is not listed because Sender's price at that size has not been read yet. Add it here once it has.
 */
const REFERENCE_PRICES: readonly (readonly [audience: number, usd: number])[] = [
  [500, 9], [1_000, 15], [2_500, 27], [5_000, 39], [7_500, 55], [10_000, 69], [15_000, 109], [20_000, 127], [25_000, 149],
  [30_000, 189], [35_000, 209], [40_000, 219], [45_000, 239], [50_000, 259], [55_000, 299], [65_000, 319], [70_000, 319],
  [75_000, 349], [80_000, 349], [85_000, 369], [90_000, 369], [95_000, 389], [100_000, 389], [105_000, 457], [110_000, 457],
  [115_000, 457], [120_000, 457], [125_000, 457], [130_000, 497], [135_000, 497], [140_000, 497], [145_000, 497], [150_000, 497],
  [155_000, 597], [160_000, 597], [165_000, 597], [170_000, 597], [175_000, 597], [180_000, 697], [185_000, 697], [200_000, 697],
];

/** The audience sizes the slider offers, smallest first. */
export const AUDIENCE_STEPS: readonly number[] = REFERENCE_PRICES.map(([audience]) => audience);
/** Where every price slider starts. */
export const DEFAULT_AUDIENCE = 5_000;

/** Percentage of the reference price each plan costs: businesses x (100 - discount). Whole numbers, so prices stay in exact cents. */
const PRICE_PERCENT: Record<SelfServePlan, number> = { starter: 80, growth: 180, pro: 450 };

const REFERENCE_BY_AUDIENCE = new Map<number, number>(REFERENCE_PRICES);

export function isAudienceStep(v: unknown): v is number {
  return typeof v === "number" && REFERENCE_BY_AUDIENCE.has(v);
}

/** The smallest audience step that holds `contacts`, or the largest step when nothing does. */
export function nearestAudience(contacts: number): number {
  return AUDIENCE_STEPS.find((s) => s >= contacts) ?? AUDIENCE_STEPS[AUDIENCE_STEPS.length - 1];
}

/** USD cents for a plan at an audience size. Annual is the monthly price x ANNUAL_MONTHS_PAID. */
export function priceCents(plan: SelfServePlan, audience: number, interval: BillingInterval = "month"): number {
  const reference = REFERENCE_BY_AUDIENCE.get(audience);
  if (reference === undefined) throw new Error(`${audience} is not an audience size we sell.`);
  const month = reference * PRICE_PERCENT[plan];
  return interval === "year" ? month * ANNUAL_MONTHS_PAID : month;
}

/** USD for a plan at an audience size. */
export const priceFor = (plan: SelfServePlan, audience: number, interval: BillingInterval = "month"): number => priceCents(plan, audience, interval) / 100;

/** List prices in USD at the default audience, for places that show a single "from" price. Everything else uses priceFor(). */
export const planPrices: Record<SelfServePlan, { month: number; year: number | null }> = {
  starter: { month: priceFor("starter", DEFAULT_AUDIENCE), year: priceFor("starter", DEFAULT_AUDIENCE, "year") },
  growth: { month: priceFor("growth", DEFAULT_AUDIENCE), year: priceFor("growth", DEFAULT_AUDIENCE, "year") },
  pro: { month: priceFor("pro", DEFAULT_AUDIENCE), year: priceFor("pro", DEFAULT_AUDIENCE, "year") },
};

/** The pooled contacts and emails that come with an audience size. */
export const audienceLimits = (audience: number): Pick<Limits, "contacts" | "monthlySends"> => ({ contacts: audience, monthlySends: audience * EMAILS_PER_CONTACT });

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
 * What an account may use: its plan's numbers (contacts and emails from its audience size when it has bought one),
 * replaced key by key by any stored overrides
 * (Custom agreements, grandfathered accounts). Anything that is not a whole number >= 0 is ignored.
 */
export function resolveEntitlements(plan: string, overrides: unknown, audience?: number | null): Limits {
  const out: Limits = { ...limitsFor(plan) };
  // A purchased audience size sets the pooled contacts and emails. Accounts without one keep the plan's own numbers.
  if (isAudienceStep(audience)) Object.assign(out, audienceLimits(audience));
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

/** The audience an account really has: the size it bought, or its plan's own contacts for accounts from before audience pricing. */
export const effectiveAudience = (plan: string, audience: number | null | undefined): number => (isAudienceStep(audience) ? audience : limitsFor(plan).contacts);

type Target = { plan: string; audience: number | null | undefined };
/** True when `a` is a smaller choice than `b`: a smaller plan, or the same plan with a smaller audience. */
export function isLowerTarget(a: Target, b: Target): boolean {
  if (planRank(a.plan) !== planRank(b.plan)) return planRank(a.plan) < planRank(b.plan);
  return effectiveAudience(a.plan, a.audience) < effectiveAudience(b.plan, b.audience);
}

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
