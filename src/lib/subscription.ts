/**
 * Subscription rules that need no database: trial and payment states, the usage window, room left in a pool,
 * upgrade proration and downgrade checks. Pure and dependency-free so server actions and tests share one copy.
 */
import type { Limits } from "@/config/plan-limits";

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled", "expired", "incomplete"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Days after a renewal date that a failed payment keeps sending alive. PLACEHOLDER policy: confirm (spec section 11). */
export const PAST_DUE_GRACE_DAYS = 3;
const DAY = 86_400_000;

/** An unknown or missing status gets no paid entitlements. */
export function normalizeStatus(raw: unknown): SubscriptionStatus {
  const v = String(raw ?? "");
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(v) ? (v as SubscriptionStatus) : "incomplete";
}

export type SubscriptionFacts = {
  status: SubscriptionStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
};

export type AccessState = { sending: boolean; reason: string | null; trialDaysLeft: number | null };

/** Whether the account may send campaigns and take new paid actions right now. Data is never touched by this. */
export function accessState(f: SubscriptionFacts, now: Date = new Date()): AccessState {
  const t = now.getTime();
  switch (f.status) {
    case "trialing": {
      const end = f.trialEndsAt?.getTime();
      if (end === undefined) return { sending: false, reason: "Your trial isn’t set up yet. Choose a plan to continue.", trialDaysLeft: null };
      if (t >= end) return { sending: false, reason: "Your 14-day trial has ended. Subscribe to keep sending. Your businesses, contacts and campaigns are safe.", trialDaysLeft: 0 };
      return { sending: true, reason: null, trialDaysLeft: Math.max(1, Math.ceil((end - t) / DAY)) };
    }
    case "active":
      return { sending: true, reason: null, trialDaysLeft: null };
    case "past_due": {
      const end = f.periodEnd?.getTime();
      if (end !== undefined && t > end + PAST_DUE_GRACE_DAYS * DAY) return { sending: false, reason: "Your last payment didn’t go through. Update your payment to start sending again.", trialDaysLeft: null };
      return { sending: true, reason: null, trialDaysLeft: null };
    }
    case "canceled": {
      const end = f.periodEnd?.getTime();
      if (end !== undefined && t < end) return { sending: true, reason: null, trialDaysLeft: null };
      return { sending: false, reason: "Your subscription has ended. Subscribe again to keep sending. Your data is safe.", trialDaysLeft: null };
    }
    case "expired":
      return { sending: false, reason: "Your subscription has expired. Subscribe to keep sending. Your data is safe.", trialDaysLeft: null };
    default:
      return { sending: false, reason: "Your payment isn’t confirmed yet. Paid features unlock once it is.", trialDaysLeft: null };
  }
}

export type Window = { start: Date; end: Date };

export function calendarMonthUtc(now: Date): Window {
  return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}

/** anchor + n months in UTC, keeping the day of month (clamped to the month's last day) and the time of day. */
export function addMonthsUtc(anchor: Date, months: number): Date {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth() + months;
  const first = Date.UTC(y, m, 1, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds());
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(first + (Math.min(anchor.getUTCDate(), lastDay) - 1) * DAY);
}

/** The month-long slice of a subscription that contains `now`, stepping from its start date (UTC). */
export function monthlyWindow(anchor: Date, now: Date): Window {
  let k = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
  if (k < 0) return calendarMonthUtc(now);
  let start = addMonthsUtc(anchor, k);
  if (start.getTime() > now.getTime()) { k -= 1; start = addMonthsUtc(anchor, k); }
  if (k < 0) return calendarMonthUtc(now);
  return { start, end: addMonthsUtc(anchor, k + 1) };
}

/**
 * The span monthly email usage is counted over. During a trial it is the trial itself. Otherwise it is the current
 * month-long slice of the subscription, from the billing period start and never the first of the calendar month.
 * (Annual plans keep monthly allowances, so their window is also monthly.)
 */
export function usageWindow(f: SubscriptionFacts, now: Date = new Date()): Window {
  if (f.status === "trialing" && f.trialStartedAt && f.trialEndsAt) return { start: f.trialStartedAt, end: f.trialEndsAt };
  if (f.periodStart) return monthlyWindow(f.periodStart, now);
  return calendarMonthUtc(now);
}

/** What one business may still add: the smaller of what is left in the shared pool and what is left under its own hard cap. */
export function roomFor(a: { poolUsed: number; poolLimit: number; businessUsed: number; businessCap: number | null }): number {
  const pool = a.poolLimit - a.poolUsed;
  const own = a.businessCap === null ? Number.POSITIVE_INFINITY : a.businessCap - a.businessUsed;
  return Math.max(0, Math.min(pool, own));
}

/**
 * Cost of moving to a dearer plan part-way through a period, for providers without native proration.
 * Amounts are in the same unit (use the smallest currency unit). The unused part of the old price is credited
 * against the unused part of the new price, so the customer pays only the difference for the days left.
 */
export function prorateUpgrade(a: { oldAmount: number; newAmount: number; periodStart: Date; periodEnd: Date; now?: Date }) {
  const now = (a.now ?? new Date()).getTime();
  const span = a.periodEnd.getTime() - a.periodStart.getTime();
  const left = Math.min(1, Math.max(0, span > 0 ? (a.periodEnd.getTime() - now) / span : 0));
  const credit = Math.round(a.oldAmount * left);
  const charge = Math.round(a.newAmount * left);
  return { fractionLeft: left, credit, charge, due: Math.max(0, charge - credit) };
}

/** Why a move to a smaller plan cannot be scheduled yet. Empty means it fits. Nothing is ever deleted to make it fit. */
export function downgradeProblems(target: Limits, now: { businesses: number; contacts: number }, targetName: string): string[] {
  const out: string[] = [];
  if (now.businesses > target.businesses) {
    const extra = now.businesses - target.businesses;
    out.push(`You have ${now.businesses} businesses and ${targetName} covers ${target.businesses}. Ask us to remove ${extra} first. You choose which to keep. Nothing is deleted for you.`);
  }
  if (now.contacts > target.contacts) {
    out.push(`You have ${now.contacts.toLocaleString("en-US")} contacts across your businesses and ${targetName} includes ${target.contacts.toLocaleString("en-US")}. Reduce your contacts by ${(now.contacts - target.contacts).toLocaleString("en-US")} or pick a larger plan.`);
  }
  return out;
}
