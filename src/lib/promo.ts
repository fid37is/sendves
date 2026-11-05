/**
 * Promo code rules that need no database: how a code is written, whether it applies to a plan and billing interval right
 * now, and what it takes off. Pure and dependency-free so checkout, the billing screen, the admin form and tests share one copy.
 */
export type PromoDuration = "once" | "repeating" | "forever";

export type PromoRow = {
  id: string;
  code: string;
  percent_off: number;
  duration: PromoDuration;
  duration_months: number | null;
  /** Plans it applies to. Null means every self-serve plan. */
  plans: string[] | null;
  /** Billing interval it applies to. Null means both. */
  interval: "month" | "year" | null;
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number | null;
  redeemed_count: number;
  active: boolean;
};

/** Codes are upper case letters, digits, "-" and "_", 3 to 32 long. Returns "" when what was typed can't be one. */
export function normalizePromoCode(raw: unknown): string {
  const v = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9_-]{3,32}$/.test(v) ? v : "";
}

export type PromoCheck = { ok: true } | { ok: false; reason: string };

export function checkPromo(p: PromoRow, ctx: { plan: string; interval: "month" | "year"; now?: Date }): PromoCheck {
  const now = (ctx.now ?? new Date()).getTime();
  if (!p.active) return { ok: false, reason: "That promo code isn’t active." };
  if (p.starts_at && now < new Date(p.starts_at).getTime()) return { ok: false, reason: "That promo code isn’t valid yet." };
  if (p.expires_at && now >= new Date(p.expires_at).getTime()) return { ok: false, reason: "That promo code has expired." };
  if (p.max_redemptions !== null && p.redeemed_count >= p.max_redemptions) return { ok: false, reason: "That promo code has been fully redeemed." };
  if (p.plans && p.plans.length > 0 && !p.plans.includes(ctx.plan)) return { ok: false, reason: "That promo code doesn’t apply to this plan." };
  if (p.interval && p.interval !== ctx.interval) return { ok: false, reason: p.interval === "year" ? "That promo code only applies to annual billing." : "That promo code only applies to monthly billing." };
  return { ok: true };
}

/** Price after a percentage off, in the same unit (use the smallest currency unit for real payments). */
export function discountedAmount(amount: number, percentOff: number): number {
  const pct = Math.min(100, Math.max(0, percentOff));
  return Math.round((amount * (100 - pct)) / 100);
}

export function describePromo(p: Pick<PromoRow, "percent_off" | "duration" | "duration_months">): string {
  const off = p.percent_off === 100 ? "Free" : `${p.percent_off}% off`;
  if (p.duration === "forever") return `${off} every payment`;
  if (p.duration === "repeating" && p.duration_months) return `${off} for ${p.duration_months} ${p.duration_months === 1 ? "month" : "months"}`;
  return `${off} the first payment`;
}
