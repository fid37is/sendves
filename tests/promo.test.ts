import assert from "node:assert/strict";
import { test } from "node:test";
import { ANNUAL_BILLING_ENABLED, ANNUAL_MONTHS_PAID, planPrices } from "../src/config/plan-limits";
import { checkPromo, describePromo, discountedAmount, normalizePromoCode, type PromoRow } from "../src/lib/promo";

const promo = (p: Partial<PromoRow> = {}): PromoRow => ({
  id: "p1", code: "SAVE20", percent_off: 20, duration: "once", duration_months: null, plans: null, interval: null,
  starts_at: null, expires_at: null, max_redemptions: null, redeemed_count: 0, active: true, ...p,
});

test("annual pays for 10 months and covers 12", () => {
  assert.equal(ANNUAL_MONTHS_PAID, 10);
  assert.equal(ANNUAL_BILLING_ENABLED, true);
  assert.deepEqual([planPrices.starter.year, planPrices.growth.year, planPrices.pro.year], [312, 702, 1755]); // at the default audience of 5,000 contacts
});

test("codes are tidied up and bad ones rejected", () => {
  assert.equal(normalizePromoCode("  save 20 "), "SAVE20");
  assert.equal(normalizePromoCode("ab"), "");
  assert.equal(normalizePromoCode("no way!"), "");
});

test("a code applies only where it should", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  assert.equal(checkPromo(promo(), { plan: "growth", interval: "month", now }).ok, true);
  assert.equal(checkPromo(promo({ active: false }), { plan: "growth", interval: "month", now }).ok, false);
  assert.equal(checkPromo(promo({ starts_at: "2026-12-01T00:00:00Z" }), { plan: "growth", interval: "month", now }).ok, false);
  assert.equal(checkPromo(promo({ expires_at: "2026-11-10T00:00:00Z" }), { plan: "growth", interval: "month", now }).ok, false);
  assert.equal(checkPromo(promo({ max_redemptions: 5, redeemed_count: 5 }), { plan: "growth", interval: "month", now }).ok, false);
  assert.equal(checkPromo(promo({ plans: ["pro"] }), { plan: "growth", interval: "month", now }).ok, false);
  assert.equal(checkPromo(promo({ plans: ["pro", "growth"] }), { plan: "growth", interval: "month", now }).ok, true);
  const annualOnly = checkPromo(promo({ interval: "year" }), { plan: "growth", interval: "month", now });
  assert.equal(annualOnly.ok, false);
  assert.match(annualOnly.ok ? "" : annualOnly.reason, /annual/);
});

test("discounts round to whole units and describe themselves", () => {
  assert.equal(discountedAmount(10_900, 20), 8_720);
  assert.equal(discountedAmount(10_901, 33), 7_304);
  assert.equal(discountedAmount(5_000, 100), 0);
  assert.equal(describePromo(promo()), "20% off the first payment");
  assert.equal(describePromo(promo({ duration: "repeating", duration_months: 3 })), "20% off for 3 months");
  assert.equal(describePromo(promo({ duration: "forever", percent_off: 100 })), "Free every payment");
});
