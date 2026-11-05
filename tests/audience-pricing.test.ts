import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANNUAL_MONTHS_PAID, AUDIENCE_STEPS, DEFAULT_AUDIENCE, EMAILS_PER_CONTACT, SELF_SERVE_PLANS, effectiveAudience, isAudienceStep, isLowerTarget,
  nearestAudience, planLimits, priceCents, priceFor, resolveEntitlements,
} from "../src/config/plan-limits";
import { displayPrice, plansAt } from "../src/config/plans";

test("prices at the audience sizes in the pricing document", () => {
  const monthly: Record<number, [number, number, number]> = {
    500: [7.2, 16.2, 40.5],
    1_000: [12, 27, 67.5],
    5_000: [31.2, 70.2, 175.5],
    10_000: [55.2, 124.2, 310.5],
    20_000: [101.6, 228.6, 571.5],
    50_000: [207.2, 466.2, 1_165.5],
    100_000: [311.2, 700.2, 1_750.5],
    200_000: [557.6, 1_254.6, 3_136.5],
  };
  for (const [audience, expected] of Object.entries(monthly)) {
    assert.deepEqual(SELF_SERVE_PLANS.map((p) => priceFor(p, Number(audience))), expected, `monthly at ${audience}`);
    // Annual is the monthly price x 10, in exact cents.
    assert.deepEqual(SELF_SERVE_PLANS.map((p) => priceCents(p, Number(audience), "year")), expected.map((v) => Math.round(v * 100) * ANNUAL_MONTHS_PAID), `annual at ${audience}`);
  }
  assert.equal(priceFor("growth", 50_000, "year"), 4_662);
});

test("every price is a whole number of cents and the ladder is sane", () => {
  assert.equal(AUDIENCE_STEPS[0], 500);
  assert.equal(AUDIENCE_STEPS[AUDIENCE_STEPS.length - 1], 200_000);
  assert.ok(!AUDIENCE_STEPS.includes(60_000), "60,000 stays out until Sender's price at that size is read");
  assert.deepEqual([...AUDIENCE_STEPS], [...AUDIENCE_STEPS].sort((a, b) => a - b));
  for (const plan of SELF_SERVE_PLANS) {
    let before = 0;
    for (const audience of AUDIENCE_STEPS) {
      const cents = priceCents(plan, audience);
      assert.ok(Number.isInteger(cents) && cents > 0, `${plan} at ${audience}`);
      assert.ok(cents >= before, `${plan} never gets cheaper as the audience grows (${audience})`);
      before = cents;
    }
  }
  for (const audience of AUDIENCE_STEPS) {
    assert.ok(priceCents("starter", audience) < priceCents("growth", audience) && priceCents("growth", audience) < priceCents("pro", audience), `Starter < Growth < Pro at ${audience}`);
  }
});

test("only the audience sizes on the slider can be priced", () => {
  assert.equal(isAudienceStep(50_000), true);
  assert.equal(isAudienceStep(60_000), false);
  assert.equal(isAudienceStep(12_345), false);
  assert.equal(isAudienceStep("50000"), false);
  assert.throws(() => priceCents("starter", 60_000));
  assert.equal(nearestAudience(27_000), 30_000);
  assert.equal(nearestAudience(500), 500);
  assert.equal(nearestAudience(999_999), 200_000);
  assert.ok(isAudienceStep(DEFAULT_AUDIENCE));
});

test("an audience size sets pooled contacts and emails (12 per contact); overrides still win; older accounts keep their plan's numbers", () => {
  const grown = resolveEntitlements("growth", {}, 50_000);
  assert.deepEqual([grown.contacts, grown.monthlySends, grown.businesses], [50_000, 50_000 * EMAILS_PER_CONTACT, 2]);
  assert.equal(EMAILS_PER_CONTACT, 12);
  assert.equal(resolveEntitlements("pro", {}, 50_000).monthlySends, 600_000);
  assert.equal(resolveEntitlements("starter", { contacts: 80_000 }, 5_000).contacts, 80_000);
  // No audience stored: exactly what the plan gave before audience pricing, so nobody loses anything.
  assert.deepEqual(resolveEntitlements("pro", {}, null), resolveEntitlements("pro", {}));
  assert.equal(resolveEntitlements("pro", {}, null).monthlySends, planLimits.pro.monthlySends);
  assert.equal(resolveEntitlements("growth", {}, 12_345).contacts, planLimits.growth.contacts, "a size we don't sell is ignored");
});

test("what counts as a smaller choice", () => {
  assert.equal(effectiveAudience("growth", null), 27_000);
  assert.equal(effectiveAudience("growth", 50_000), 50_000);
  assert.equal(isLowerTarget({ plan: "starter", audience: 100_000 }, { plan: "growth", audience: 500 }), true, "a smaller plan is smaller whatever the audience");
  assert.equal(isLowerTarget({ plan: "growth", audience: 10_000 }, { plan: "growth", audience: 50_000 }), true);
  assert.equal(isLowerTarget({ plan: "growth", audience: 50_000 }, { plan: "growth", audience: 10_000 }), false);
  assert.equal(isLowerTarget({ plan: "growth", audience: 50_000 }, { plan: "growth", audience: 50_000 }), false);
  assert.equal(isLowerTarget({ plan: "growth", audience: 25_000 }, { plan: "growth", audience: null }), true, "older accounts count as their plan's own contacts (27,000)");
});

test("the plan cards follow the audience", () => {
  const at = Object.fromEntries(plansAt(50_000).map((p) => [p.id, p]));
  assert.equal(at.growth.price, "$466.20");
  assert.equal(at.growth.contacts, "50,000 pooled contacts");
  assert.equal(at.growth.sends, "600,000 pooled emails / month");
  assert.equal(at.growth.annual?.price, "$4,662");
  assert.equal(at.growth.annual?.note, "10 months for 12");
  assert.equal(displayPrice(at.pro, "year", 0, 50_000).price, "$11,655");
  assert.equal(displayPrice(at.pro, "month", 10, 50_000).price, "$1,048.95");
  assert.ok(!at.pro.features.some((f) => /twice/i.test(f)), "Pro no longer promises twice Growth's emails");
});
