import "server-only";
import { checkPromo, normalizePromoCode, type PromoRow } from "@/lib/promo";
import type { Db } from "@/lib/supabase/admin";

const COLUMNS = "id, code, percent_off, duration, duration_months, plans, interval, starts_at, expires_at, max_redemptions, redeemed_count, active";

export async function findPromo(db: Db, rawCode: unknown): Promise<PromoRow | null> {
  const code = normalizePromoCode(rawCode);
  if (!code) return null;
  const { data } = await db.from("promo_codes").select(COLUMNS).eq("code", code).maybeSingle();
  return (data as PromoRow | null) ?? null;
}

export type PromoResult = { ok: true; promo: PromoRow } | { ok: false; reason: string };

/** Whether this account can use the code on this plan and billing interval right now. */
export async function checkPromoForCheckout(db: Db, rawCode: unknown, a: { accountId: string; plan: string; interval: "month" | "year" }): Promise<PromoResult> {
  if (!normalizePromoCode(rawCode)) return { ok: false, reason: "That promo code isn’t valid." };
  const promo = await findPromo(db, rawCode);
  if (!promo) return { ok: false, reason: "That promo code isn’t valid." };
  const check = checkPromo(promo, { plan: a.plan, interval: a.interval });
  if (!check.ok) return check;
  const { data: used } = await db.from("promo_redemptions").select("id").eq("promo_id", promo.id).eq("workspace_id", a.accountId).maybeSingle();
  if (used) return { ok: false, reason: "You’ve already used that promo code." };
  return { ok: true, promo };
}

/** Called once a payment made with the code is confirmed. A repeat for the same account changes nothing. */
export async function recordRedemption(db: Db, promoId: string, accountId: string, provider: string, ref: string | null): Promise<void> {
  const { error } = await db.rpc("redeem_promo", { p_promo: promoId, p_workspace: accountId, p_provider: provider, p_ref: ref });
  if (error) console.error("[promo] couldn’t record redemption:", error.message);
}
