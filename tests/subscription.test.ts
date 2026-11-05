import assert from "node:assert/strict";
import { test } from "node:test";
import { planLimits, planPrices, resolveEntitlements, normalizePlanId, nextPlanForBusinesses, limitsFor, SELF_SERVE_PLANS } from "../src/config/plan-limits";
import { accessState, addMonthsUtc, downgradeProblems, monthlyWindow, prorateUpgrade, roomFor, usageWindow, normalizeStatus, PAST_DUE_GRACE_DAYS, type SubscriptionFacts } from "../src/lib/subscription";

const d = (s: string) => new Date(s);
const facts = (p: Partial<SubscriptionFacts>): SubscriptionFacts => ({ status: "active", trialStartedAt: null, trialEndsAt: null, periodStart: null, periodEnd: null, ...p });

test("the catalogue is Starter, Growth, Pro and Custom with the specified pools", () => {
  assert.deepEqual(Object.keys(planLimits), ["starter", "growth", "pro", "custom"]);
  assert.deepEqual([planLimits.starter.businesses, planLimits.starter.contacts, planLimits.starter.monthlySends], [1, 5_000, 60_000]);
  assert.deepEqual([planLimits.growth.businesses, planLimits.growth.contacts, planLimits.growth.monthlySends], [2, 27_000, 324_000]);
  assert.deepEqual([planLimits.pro.businesses, planLimits.pro.contacts, planLimits.pro.monthlySends], [5, 27_000, 648_000]);
  assert.deepEqual(SELF_SERVE_PLANS.map((p) => planPrices[p].month), [31.2, 70.2, 175.5]); // at the default audience of 5,000 contacts
  for (const p of Object.values(planLimits)) assert.equal(p.trialDays, 14);
});

test("there is no free plan: old names resolve to a paid plan", () => {
  assert.equal(normalizePlanId("free"), "starter");
  assert.equal(normalizePlanId("scale"), "custom");
  assert.equal(normalizePlanId("nonsense"), "starter");
  assert.equal(limitsFor("Growth").businesses, 2);
});

test("overrides replace single numbers and ignore bad values", () => {
  const r = resolveEntitlements("starter", { businesses: 3, contacts: -5, monthlySends: 1.5, domains: "9" });
  assert.equal(r.businesses, 3);
  assert.equal(r.contacts, 5_000);
  assert.equal(r.monthlySends, 60_000);
  assert.equal(r.domains, 3);
  assert.equal(resolveEntitlements("pro", null).businesses, 5);
});

test("the next plan is the smallest that covers the businesses needed", () => {
  assert.equal(nextPlanForBusinesses("starter", 2), "growth");
  assert.equal(nextPlanForBusinesses("growth", 3), "pro");
  assert.equal(nextPlanForBusinesses("growth", 5), "pro");
  assert.equal(nextPlanForBusinesses("pro", 6), "custom");
  assert.equal(nextPlanForBusinesses("pro", 5), "custom");
});

test("a trial sends for 14 days, then stops without deleting anything", () => {
  const start = d("2026-11-04T10:00:00Z");
  const end = d("2026-11-18T10:00:00Z");
  const f = facts({ status: "trialing", trialStartedAt: start, trialEndsAt: end });
  assert.deepEqual(accessState(f, d("2026-11-05T10:00:00Z")), { sending: true, reason: null, trialDaysLeft: 13 });
  const over = accessState(f, d("2026-11-18T10:00:01Z"));
  assert.equal(over.sending, false);
  assert.equal(over.trialDaysLeft, 0);
  assert.match(over.reason ?? "", /safe/);
});

test("payment states", () => {
  const end = d("2026-12-01T00:00:00Z");
  assert.equal(accessState(facts({ status: "active" })).sending, true);
  assert.equal(accessState(facts({ status: "incomplete" })).sending, false);
  assert.equal(accessState(facts({ status: "expired" })).sending, false);
  assert.equal(accessState(facts({ status: "past_due", periodEnd: end }), d("2026-12-02T00:00:00Z")).sending, true);
  assert.equal(accessState(facts({ status: "past_due", periodEnd: end }), new Date(end.getTime() + (PAST_DUE_GRACE_DAYS + 1) * 86_400_000)).sending, false);
  assert.equal(accessState(facts({ status: "canceled", periodEnd: end }), d("2026-11-20T00:00:00Z")).sending, true);
  assert.equal(accessState(facts({ status: "canceled", periodEnd: end }), d("2026-12-02T00:00:00Z")).sending, false);
  assert.equal(normalizeStatus("weird"), "incomplete");
});

test("usage is counted from the billing period start, not the first of the month (AC-08)", () => {
  const f = facts({ periodStart: d("2026-10-17T08:30:00Z") });
  const w = usageWindow(f, d("2026-11-04T12:00:00Z"));
  assert.equal(w.start.toISOString(), "2026-10-17T08:30:00.000Z");
  assert.equal(w.end.toISOString(), "2026-11-17T08:30:00.000Z");
  // After the renewal date it rolls to the next slice by itself, even if the webhook is late.
  const next = usageWindow(f, d("2026-11-20T00:00:00Z"));
  assert.equal(next.start.toISOString(), "2026-11-17T08:30:00.000Z");
});

test("a window anchored on the 31st clamps to short months and never drifts", () => {
  const a = d("2026-01-31T00:00:00Z");
  assert.equal(addMonthsUtc(a, 1).toISOString(), "2026-02-28T00:00:00.000Z");
  assert.equal(addMonthsUtc(a, 2).toISOString(), "2026-03-31T00:00:00.000Z");
  assert.equal(monthlyWindow(a, d("2026-03-05T00:00:00Z")).start.toISOString(), "2026-02-28T00:00:00.000Z");
});

test("a trial counts emails over the trial and an annual plan still counts monthly", () => {
  const f = facts({ status: "trialing", trialStartedAt: d("2026-11-04T00:00:00Z"), trialEndsAt: d("2026-11-18T00:00:00Z") });
  assert.equal(usageWindow(f, d("2026-11-10T00:00:00Z")).end.toISOString(), "2026-11-18T00:00:00.000Z");
  const annual = facts({ periodStart: d("2026-02-10T00:00:00Z"), periodEnd: d("2027-02-10T00:00:00Z") });
  assert.equal(usageWindow(annual, d("2026-06-12T00:00:00Z")).start.toISOString(), "2026-06-10T00:00:00.000Z");
});

test("pooled room: 10,000 + 8,000 used of 27,000 leaves 9,000 (AC-05, example A)", () => {
  assert.equal(roomFor({ poolUsed: 18_000, poolLimit: 27_000, businessUsed: 10_000, businessCap: null }), 9_000);
});

test("a hard allocation cap limits one business without changing the pool (AC-10)", () => {
  assert.equal(roomFor({ poolUsed: 18_000, poolLimit: 27_000, businessUsed: 10_000, businessCap: 12_000 }), 2_000);
  assert.equal(roomFor({ poolUsed: 26_000, poolLimit: 27_000, businessUsed: 1_000, businessCap: 20_000 }), 1_000);
  assert.equal(roomFor({ poolUsed: 30_000, poolLimit: 27_000, businessUsed: 0, businessCap: null }), 0);
});

test("upgrade proration charges the price gap for the days left", () => {
  const p = prorateUpgrade({ oldAmount: 2_900, newAmount: 10_900, periodStart: d("2026-11-01T00:00:00Z"), periodEnd: d("2026-12-01T00:00:00Z"), now: d("2026-11-11T00:00:00Z") });
  assert.equal(Math.round(p.fractionLeft * 30), 20);
  assert.equal(p.credit, 1_933);
  assert.equal(p.charge, 7_267);
  assert.equal(p.due, 5_334);
  assert.equal(prorateUpgrade({ oldAmount: 100, newAmount: 300, periodStart: d("2026-11-01T00:00:00Z"), periodEnd: d("2026-12-01T00:00:00Z"), now: d("2026-12-05T00:00:00Z") }).due, 0);
});

test("a downgrade is blocked while the account is too big for it, and nothing is deleted (AC-13)", () => {
  assert.deepEqual(downgradeProblems(planLimits.growth, { businesses: 2, contacts: 20_000 }, "Growth"), []);
  const p = downgradeProblems(planLimits.starter, { businesses: 3, contacts: 9_000 }, "Starter");
  assert.equal(p.length, 2);
  assert.match(p[0], /Nothing is deleted/);
});
