import { createHmac, timingSafeEqual } from "crypto";
import { effectiveAudience, isAudienceStep, isLowerTarget, isSelfServePlan, priceCents, resolveEntitlements, type BillingInterval, type PlanId, type SelfServePlan } from "@/config/plan-limits";
import { serverEnv } from "@/lib/env.server";
import { discountedAmount, type PromoDuration } from "@/lib/promo";
import { addMonthsUtc, downgradeProblems, prorateUpgrade, type SubscriptionStatus } from "@/lib/subscription";
import type { Db } from "@/lib/supabase/admin";
import { recordRedemption } from "@/server/promo";
import { applyPendingPlan, getAccountUsage, loadAccount, syncEntitlements, type Account } from "@/server/usage";

/**
 * Billing for the ACCOUNT. There is one subscription per account (stored on its main business), however many
 * businesses it covers. Stripe and Paystack both feed the same stored state, and an entitlement is only ever granted
 * from a verified provider event or a direct provider API read, never from a browser redirect.
 */

export type PaidPlan = SelfServePlan;
export type Provider = "stripe" | "paystack";

export const billingEnabled = {
  stripe: () => Boolean(serverEnv.billing.stripeSecretKey),
  // Paystack charges are worked out from the USD price, so it needs the exchange rate as well as the key.
  paystack: () => Boolean(serverEnv.billing.paystackSecretKey) && serverEnv.billing.paystackUnitsPerUsd > 0,
};

/** Legacy env key for a plan sold before audience pricing: "growth" or "growth_year". Only subscriptions with no audience stored use it. */
export const priceKey = (plan: PaidPlan, interval: BillingInterval): string => (interval === "year" ? `${plan}_year` : plan);

const PERIOD_MONTHS: Record<BillingInterval, number> = { month: 1, year: 12 };

/** Whether a payment method can charge at this interval. Prices come from the plan config, so only the provider's own setup matters. */
export function intervalAvailable(provider: Provider, _plan: PaidPlan, _interval: BillingInterval): boolean {
  return billingEnabled[provider]();
}

/** What a provider charges for a plan at an audience size and interval, in its smallest currency unit (cents for Stripe). */
export function chargeAmount(provider: Provider, plan: PaidPlan, audience: number, interval: BillingInterval): number {
  const cents = priceCents(plan, audience, interval);
  return provider === "stripe" ? cents : Math.round((cents / 100) * serverEnv.billing.paystackUnitsPerUsd);
}

/** Today's charge for the account's current plan, or null when it can't be worked out. Accounts from before audience pricing use their old env amount. */
function currentPaystackAmount(account: Account): number | null {
  if (!isSelfServePlan(account.plan)) return null;
  if (account.audience !== null) return chargeAmount("paystack", account.plan, account.audience, account.interval);
  return serverEnv.billing.paystackAmounts[priceKey(account.plan, account.interval)] || null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The Stripe price for a plan at an audience size and interval. Prices are created on first use and found again by their
 * lookup key (which includes the amount, so changing a price in the config creates a new Stripe price instead of editing an old one).
 */
async function stripePriceFor(plan: PaidPlan, audience: number, interval: BillingInterval): Promise<string> {
  const cents = priceCents(plan, audience, interval);
  const lookupKey = `sendves_${plan}_${audience}_${interval}_${cents}`;
  const find = async (): Promise<string | undefined> => (await stripeApi(`/prices?lookup_keys%5B%5D=${encodeURIComponent(lookupKey)}&limit=1`))?.data?.[0]?.id;
  const existing = await find();
  if (existing) return existing;
  try {
    const created = await stripeApi("/prices", {
      method: "POST",
      form: {
        currency: "usd", unit_amount: String(cents), "recurring[interval]": interval, lookup_key: lookupKey,
        "product_data[name]": `Sendves ${cap(plan)}: ${audience.toLocaleString("en-US")} contacts`,
        "metadata[plan_id]": plan, "metadata[audience]": String(audience), "metadata[interval]": interval,
      },
    });
    return created.id as string;
  } catch (err) {
    const raced = await find(); // another request may have created it a moment ago
    if (raced) return raced;
    throw err;
  }
}

/** The Paystack plan code for a plan at an audience size and interval, created in Paystack the first time it is needed. */
async function ensurePaystackPlan(db: Db, plan: PaidPlan, audience: number, interval: BillingInterval): Promise<string> {
  const amount = chargeAmount("paystack", plan, audience, interval);
  const currency = serverEnv.billing.paystackCurrency;
  const key = `${plan}:${audience}:${interval}:${amount}:${currency || "default"}`;
  const { data: row } = await db.from("billing_plan_codes").select("code").eq("provider", "paystack").eq("key", key).maybeSingle();
  if (row?.code) return row.code as string;
  const created = await paystackApi("/plan", {
    method: "POST",
    body: { name: `Sendves ${cap(plan)} ${audience.toLocaleString("en-US")} contacts ${interval === "year" ? "annual" : "monthly"}`, amount, interval: interval === "year" ? "annually" : "monthly", ...(currency ? { currency } : {}) },
  });
  const code = created?.data?.plan_code as string | undefined;
  if (!code) throw new Error("Paystack did not return a plan code.");
  await db.from("billing_plan_codes").upsert({ provider: "paystack", key, code });
  return code;
}

/** A promo code that has been checked and may be applied to a checkout. */
export type PromoDiscount = { id: string; code: string; percentOff: number; duration: PromoDuration; durationMonths: number | null };

/** A problem the customer can act on, as opposed to a failure we only log. */
export class CheckoutRefused extends Error {}

// ── Checkout (first payment, or paying again after a trial or lapse) ──────────────────────────────

export async function createCheckout(args: { db: Db; provider: Provider; plan: PaidPlan; audience: number; interval?: BillingInterval; workspaceId: string; email: string; promo?: PromoDiscount }): Promise<string> {
  const { db, provider, plan, audience, workspaceId, email, promo } = args;
  const interval = args.interval ?? "month";
  const base = serverEnv.appUrl;
  if (!isAudienceStep(audience)) throw new CheckoutRefused("Choose an audience size to continue.");

  if (provider === "stripe") {
    if (!serverEnv.billing.stripeSecretKey) throw new Error("Stripe is not configured.");
    const price = await stripePriceFor(plan, audience, interval);
    const params: Record<string, string> = {
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: `${base}/app/billing?checkout=complete`,
      cancel_url: `${base}/app/billing`,
      customer_email: email,
      client_reference_id: workspaceId,
      "metadata[plan_id]": plan,
      "metadata[audience]": String(audience),
      "metadata[workspace_id]": workspaceId,
      // Carried onto the subscription itself, so every later subscription event can be matched to the account.
      "subscription_data[metadata][plan_id]": plan,
      "subscription_data[metadata][audience]": String(audience),
      "subscription_data[metadata][workspace_id]": workspaceId,
    };
    if (promo) {
      // The code becomes a Stripe coupon with the same percentage and duration, so Stripe applies it to every invoice it should.
      const coupon = await stripeApi("/coupons", {
        method: "POST",
        form: {
          percent_off: String(promo.percentOff), duration: promo.duration, name: promo.code.slice(0, 40), "metadata[promo_id]": promo.id,
          ...(promo.duration === "repeating" && promo.durationMonths ? { duration_in_months: String(promo.durationMonths) } : {}),
        },
      });
      params["discounts[0][coupon]"] = coupon.id as string;
      params["metadata[promo_id]"] = promo.id;
      params["subscription_data[metadata][promo_id]"] = promo.id;
    }
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.billing.stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    const json = await res.json();
    if (!res.ok || !json.url) throw new Error(json?.error?.message ?? "Stripe could not start checkout.");
    return json.url as string;
  }

  if (!billingEnabled.paystack()) throw new Error("Paystack is not configured.");
  const amount = chargeAmount("paystack", plan, audience, interval);
  const planCode = await ensurePaystackPlan(db, plan, audience, interval);
  if (promo) {
    // Paystack bills a plan code at its fixed amount, so a discounted first payment is a one-off charge. The recurring plan
    // then starts when that first period ends (see startPaystackRecurring), at the full price. The discount covers the first payment only.
    const discounted = discountedAmount(amount, promo.percentOff);
    if (discounted < 100) throw new CheckoutRefused("This code can’t be used with Paystack because nothing would be left to charge. Try another payment method.");
    return paystackInitialize({
      email, amount: discounted,
      metadata: { kind: "subscribe", workspace_id: workspaceId, plan_id: plan, audience, interval, promo_id: promo.id, recurring_after: Boolean(planCode) },
    });
  }
  return paystackInitialize({
    email, amount, metadata: { kind: "subscribe", workspace_id: workspaceId, plan_id: plan, audience, interval },
    plan: planCode,
  });
}

async function paystackInitialize(body: Record<string, unknown>): Promise<string> {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv.billing.paystackSecretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ callback_url: `${serverEnv.appUrl}/app/billing?checkout=complete`, ...(serverEnv.billing.paystackCurrency ? { currency: serverEnv.billing.paystackCurrency } : {}), ...body }),
  });
  const json = await res.json();
  if (!res.ok || !json?.data?.authorization_url) throw new Error(json?.message ?? "Paystack could not start checkout.");
  return json.data.authorization_url as string;
}

async function paystackApi(path: string, init?: { method?: string; body?: unknown }): Promise<any> {
  const res = await fetch(`https://api.paystack.co${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${serverEnv.billing.paystackSecretKey}`, "Content-Type": "application/json" },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.status === false) throw new Error(json?.message ?? `Paystack request failed (${res.status}).`);
  return json;
}

async function stripeApi(path: string, init?: { method?: string; form?: Record<string, string> }): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${serverEnv.billing.stripeSecretKey}`, ...(init?.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    ...(init?.form ? { body: new URLSearchParams(init.form) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe request failed (${res.status}).`);
  return json;
}

// ── Signatures ────────────────────────────────────────────────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyStripeSignature(raw: string, header: string | null): boolean {
  const secret = serverEnv.billing.stripeWebhookSecret;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  return safeEqual(createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex"), v1);
}

export function verifyPaystackSignature(raw: string, header: string | null): boolean {
  const secret = serverEnv.billing.paystackSecretKey;
  if (!secret || !header) return false;
  return safeEqual(createHmac("sha512", secret).update(raw).digest("hex"), header);
}

// ── Stored subscription state ─────────────────────────────────────────────────────────────────────

/** Records a provider event once. False means it was seen before, so the caller must change nothing. */
export async function claimBillingEvent(db: Db, provider: Provider, id: string, type: string): Promise<boolean> {
  const { error } = await db.from("billing_events").insert({ id: `${provider}:${id}`, provider, type });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  throw new Error(`Couldn’t record billing event: ${error.message}`); // unknown failure: let the provider retry
}

type Activation = {
  plan: PlanId;
  provider: Provider;
  ref: string | null;
  interval: BillingInterval;
  periodStart: Date;
  periodEnd: Date;
  customerId?: string | null;
  subscriptionId?: string | null;
  priceId?: string | null;
  currency?: string | null;
  cancelAtPeriodEnd?: boolean;
  /** The audience size bought. Leave undefined to keep the one already stored (renewals); null clears it (legacy prices). */
  audience?: number | null;
};

/** Makes the account active on a plan for a billing period. Pooled limits come from the plan; nothing is copied to businesses. */
export async function activateSubscription(db: Db, mainId: string, a: Activation): Promise<void> {
  await db.from("workspaces").update({
    plan: a.plan,
    subscription_status: "active",
    billing_provider: a.provider,
    billing_ref: a.ref,
    billing_interval: a.interval,
    billing_period_start: a.periodStart.toISOString(),
    billing_period_end: a.periodEnd.toISOString(),
    cancel_at_period_end: a.cancelAtPeriodEnd ?? false,
    canceled_at: null,
    pending_plan: null,
    pending_audience_contacts: null,
    ...(a.audience !== undefined ? { audience_contacts: a.audience } : {}),
    ...(a.customerId ? { provider_customer_id: a.customerId } : {}),
    ...(a.subscriptionId ? { provider_subscription_id: a.subscriptionId } : {}),
    ...(a.priceId ? { billing_price_id: a.priceId } : {}),
    ...(a.currency ? { billing_currency: a.currency } : {}),
  }).eq("id", mainId);
  await syncEntitlements(db, mainId);
}

async function setStatus(db: Db, mainId: string, status: SubscriptionStatus, extra: Record<string, unknown> = {}) {
  await db.from("workspaces").update({ subscription_status: status, ...extra }).eq("id", mainId);
}

/** Finds the account (its main business) a provider event is about. */
async function findAccount(db: Db, k: { workspaceId?: string | null; customerId?: string | null; subscriptionId?: string | null; email?: string | null }): Promise<Account | null> {
  const main = async (col: string, val: string) =>
    (await db.from("workspaces").select("id").is("account_workspace_id", null).eq(col, val).limit(1).maybeSingle()).data?.id as string | undefined;
  let id: string | undefined;
  if (k.subscriptionId) id = await main("provider_subscription_id", k.subscriptionId);
  if (!id && k.customerId) id = await main("provider_customer_id", k.customerId);
  if (!id && k.workspaceId) id = k.workspaceId;
  if (!id && k.email) {
    const { data: profile } = await db.from("profiles").select("id").eq("email", k.email.toLowerCase()).maybeSingle();
    if (profile) id = await main("owner_id", profile.id);
  }
  return id ? loadAccount(db, id) : null;
}

// ── Paystack ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Points the recurring Paystack subscription at another plan from the next renewal: the old subscription is disabled
 * and a new one starts when the current period ends. Best effort: it needs the plan code (created in Paystack when missing) and the stored customer
 * and subscription codes, and returns false (and logs) rather than throwing so a payment that already succeeded is kept.
 */
async function repointPaystackSubscription(db: Db, account: Account, toPlan: PaidPlan, toAudience: number | null): Promise<boolean> {
  try {
    const planCode = toAudience !== null ? await ensurePaystackPlan(db, toPlan, toAudience, account.interval) : serverEnv.billing.paystackPlans[priceKey(toPlan, account.interval)];
    if (!planCode || !account.providerSubscriptionId || !account.providerCustomerId) return false;
    const current = await paystackApi(`/subscription/${encodeURIComponent(account.providerSubscriptionId)}`);
    const token = current?.data?.email_token as string | undefined;
    if (!token) return false;
    // Forget the old code first, so the "subscription disabled" event Paystack sends next can't be mistaken for a cancellation.
    await db.from("workspaces").update({ provider_subscription_id: null }).eq("id", account.mainId);
    await paystackApi("/subscription/disable", { method: "POST", body: { code: account.providerSubscriptionId, token } });
    const start = account.periodEnd ?? (current?.data?.next_payment_date ? new Date(current.data.next_payment_date) : null);
    await paystackApi("/subscription", { method: "POST", body: { customer: account.providerCustomerId, plan: planCode, ...(start ? { start_date: start.toISOString() } : {}) } });
    return true;
  } catch (err) {
    console.error("[billing] paystack plan sync failed:", (err as Error).message);
    return false;
  }
}

/** Runs `work` once per event id. If it fails the claim is released, so the provider's retry is processed instead of skipped. */
async function once(db: Db, provider: Provider, id: string, type: string, work: () => Promise<void>): Promise<void> {
  if (!(await claimBillingEvent(db, provider, id, type))) return;
  try {
    await work();
  } catch (err) {
    await db.from("billing_events").delete().eq("id", `${provider}:${id}`);
    throw err;
  }
}

/** Starts the recurring Paystack plan when the period paid by a one-off (discounted) first payment ends. Best effort, like repointing. */
async function startPaystackRecurring(db: Db, account: Account, plan: PaidPlan, audience: number | null, start: Date): Promise<boolean> {
  try {
    const planCode = audience !== null ? await ensurePaystackPlan(db, plan, audience, account.interval) : serverEnv.billing.paystackPlans[priceKey(plan, account.interval)];
    if (!planCode || !account.providerCustomerId) return false;
    await paystackApi("/subscription", { method: "POST", body: { customer: account.providerCustomerId, plan: planCode, start_date: start.toISOString() } });
    return true;
  } catch (err) {
    console.error("[billing] paystack recurring start failed:", (err as Error).message);
    return false;
  }
}

/** Handles one verified Paystack event. Safe to call twice with the same event. */
export async function handlePaystackEvent(db: Db, event: any): Promise<void> {
  const d = event?.data ?? {};
  const type = String(event?.event ?? "");
  const uid = String(d.id ?? d.reference ?? d.subscription_code ?? d.invoice_code ?? "");
  if (!uid) return;
  await once(db, "paystack", `${type}:${uid}`, type, () => processPaystackEvent(db, type, d));
}

/** The audience size a Paystack charge was made for. Null on payments started before audience pricing. */
const audienceOf = (meta: any): number | null => (isAudienceStep(Number(meta?.audience)) ? Number(meta.audience) : null);

async function processPaystackEvent(db: Db, type: string, d: any): Promise<void> {

  const customerId = (d.customer?.customer_code as string | undefined) ?? null;
  const email = String(d.customer?.email ?? "").toLowerCase() || null;

  if (type === "charge.success") {
    if (d.status !== "success") return;
    const meta = d.metadata ?? {};
    const paidAt = d.paid_at ? new Date(d.paid_at) : new Date();

    if (meta.workspace_id && meta.kind === "upgrade" && isSelfServePlan(meta.plan_id)) {
      if (Number(d.amount) < Number(meta.expected_amount ?? 0)) { console.error("[billing] upgrade payment smaller than expected, ignored:", d.reference); return; }
      const account = await loadAccount(db, String(meta.workspace_id));
      if (!account) return;
      await activateSubscription(db, account.mainId, {
        plan: meta.plan_id, provider: "paystack", ref: d.reference ?? null, interval: account.interval,
        periodStart: account.periodStart ?? paidAt, periodEnd: account.periodEnd ?? addMonthsUtc(paidAt, PERIOD_MONTHS[account.interval]),
        customerId, audience: audienceOf(meta),
      });
      await repointPaystackSubscription(db, account, meta.plan_id, audienceOf(meta));
      return;
    }
    if (meta.workspace_id && isSelfServePlan(meta.plan_id)) {
      const interval: BillingInterval = meta.interval === "year" ? "year" : "month";
      const account = await loadAccount(db, String(meta.workspace_id));
      if (!account) return;
      await activateSubscription(db, account.mainId, {
        plan: meta.plan_id, provider: "paystack", ref: d.reference ?? null, interval,
        periodStart: paidAt, periodEnd: addMonthsUtc(paidAt, PERIOD_MONTHS[interval]), customerId, currency: d.currency ?? null, audience: audienceOf(meta),
      });
      if (meta.promo_id) {
        await recordRedemption(db, String(meta.promo_id), account.mainId, "paystack", d.reference ?? null);
        // The discounted payment was a one-off, so the recurring plan is started for the day this paid period ends.
        if (meta.recurring_after) {
          const fresh = await loadAccount(db, account.mainId);
          if (fresh?.periodEnd) await startPaystackRecurring(db, fresh, meta.plan_id, audienceOf(meta), fresh.periodEnd);
        }
      }
      return;
    }
    // No plan in the metadata: a renewal charge on an existing recurring subscription.
    const account = await findAccount(db, { customerId, email });
    if (!account || account.provider !== "paystack") return;
    if (account.pendingPlan) await applyPendingPlan(db, account.mainId);
    const renewed = (await loadAccount(db, account.mainId)) ?? account;
    await activateSubscription(db, renewed.mainId, {
      plan: renewed.plan, provider: "paystack", ref: d.reference ?? null, interval: renewed.interval,
      periodStart: paidAt, periodEnd: addMonthsUtc(paidAt, PERIOD_MONTHS[renewed.interval]), customerId,
    });
    return;
  }

  const account = await findAccount(db, { subscriptionId: d.subscription_code ?? d.subscription?.subscription_code ?? null, customerId, email });
  if (!account) return;

  if (type === "subscription.create") {
    await db.from("workspaces").update({ provider_subscription_id: d.subscription_code ?? null, ...(customerId ? { provider_customer_id: customerId } : {}) }).eq("id", account.mainId);
  } else if (type === "invoice.payment_failed") {
    if (account.status === "active") await setStatus(db, account.mainId, "past_due");
  } else if (type === "subscription.not_renew") {
    await db.from("workspaces").update({ cancel_at_period_end: true }).eq("id", account.mainId);
  } else if (type === "subscription.disable") {
    // Only the subscription we are tracking cancels the account. A disabled old one (after a plan change) is ignored.
    if (account.providerSubscriptionId && account.providerSubscriptionId === d.subscription_code) {
      await setStatus(db, account.mainId, "canceled", { canceled_at: new Date().toISOString(), cancel_at_period_end: false });
    }
  }
}

// ── Stripe ────────────────────────────────────────────────────────────────────────────────────────

function planForStripePrice(priceId: string | null | undefined): { plan: PaidPlan; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const [key, id] of Object.entries(serverEnv.billing.stripePrices)) {
    if (id && id === priceId) {
      const interval: BillingInterval = key.endsWith("_year") ? "year" : "month";
      const plan = key.replace(/_year$/, "");
      if (isSelfServePlan(plan)) return { plan, interval };
    }
  }
  return null;
}

/** What a Stripe subscription item is: the plan, audience and interval recorded on its price, or the legacy env price ids for older subscriptions. */
function targetFromStripeItem(item: any): { plan: PaidPlan; interval: BillingInterval; audience: number | null } | null {
  const m = item?.price?.metadata ?? {};
  if (isSelfServePlan(m.plan_id) && isAudienceStep(Number(m.audience))) {
    return { plan: m.plan_id, interval: m.interval === "year" || item?.price?.recurring?.interval === "year" ? "year" : "month", audience: Number(m.audience) };
  }
  const legacy = planForStripePrice(item?.price?.id);
  return legacy ? { ...legacy, audience: null } : null;
}

function mapStripeStatus(s: string): SubscriptionStatus {
  switch (s) {
    case "active": case "trialing": return "active";
    case "past_due": case "unpaid": case "paused": return "past_due";
    case "canceled": return "canceled";
    case "incomplete_expired": return "expired";
    default: return "incomplete";
  }
}

const fromUnix = (v: unknown): Date | null => (typeof v === "number" ? new Date(v * 1000) : null);

/** Brings the account in line with a Stripe subscription. Entitlements are granted only while Stripe says it is paid up. */
async function applyStripeSubscription(db: Db, sub: any, hint?: { workspaceId?: string | null; customerId?: string | null }): Promise<void> {
  const item = sub?.items?.data?.[0];
  const account = await findAccount(db, { subscriptionId: sub.id, customerId: hint?.customerId ?? (typeof sub.customer === "string" ? sub.customer : null), workspaceId: hint?.workspaceId ?? sub.metadata?.workspace_id ?? null });
  if (!account) return;
  const status = mapStripeStatus(String(sub.status));
  const priceId = item?.price?.id as string | undefined;
  const target = targetFromStripeItem(item);
  const start = fromUnix(sub.current_period_start ?? item?.current_period_start);
  const end = fromUnix(sub.current_period_end ?? item?.current_period_end);
  const common = {
    provider_customer_id: typeof sub.customer === "string" ? sub.customer : account.providerCustomerId,
    provider_subscription_id: sub.id as string,
    billing_provider: "stripe",
    ...(priceId ? { billing_price_id: priceId } : {}),
    ...(sub.currency ? { billing_currency: String(sub.currency).toUpperCase() } : {}),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
  };

  if (status === "active" && target && start && end) {
    // A scheduled downgrade is already priced in Stripe, but the customer keeps what they paid for until the period turns over.
    const scheduled = account.pendingPlan === target.plan && (account.pendingAudience ?? null) === target.audience;
    if (scheduled && isLowerTarget(target, account) && account.periodEnd && start.getTime() < account.periodEnd.getTime()) {
      await db.from("workspaces").update(common).eq("id", account.mainId);
      return;
    }
    if (scheduled) await applyPendingPlan(db, account.mainId);
    await activateSubscription(db, account.mainId, {
      plan: target.plan, provider: "stripe", ref: sub.id as string,
      interval: target.interval, periodStart: start, periodEnd: end,
      customerId: common.provider_customer_id, subscriptionId: sub.id, priceId, currency: common.billing_currency as string | undefined, cancelAtPeriodEnd: common.cancel_at_period_end,
      audience: target.audience,
    });
    return;
  }

  await db.from("workspaces").update({
    ...common,
    subscription_status: status,
    ...(start ? { billing_period_start: start.toISOString() } : {}),
    ...(end ? { billing_period_end: end.toISOString() } : {}),
    ...(status === "canceled" ? { canceled_at: new Date().toISOString() } : {}),
  }).eq("id", account.mainId);
}

/** Handles one verified Stripe event. Safe to call twice with the same event. */
export async function handleStripeEvent(db: Db, event: any): Promise<void> {
  const type = String(event?.type ?? "");
  if (!event?.id) return;
  await once(db, "stripe", String(event.id), type, () => processStripeEvent(db, type, event.data?.object ?? {}));
}

async function processStripeEvent(db: Db, type: string, obj: any): Promise<void> {

  if (type === "checkout.session.completed") {
    if (obj.mode !== "subscription" || !obj.subscription) return;
    const sub = await stripeApi(`/subscriptions/${encodeURIComponent(String(obj.subscription))}`);
    await applyStripeSubscription(db, sub, { workspaceId: obj.client_reference_id ?? obj.metadata?.workspace_id ?? null, customerId: typeof obj.customer === "string" ? obj.customer : null });
    const accountId = obj.client_reference_id ?? obj.metadata?.workspace_id;
    if (obj.metadata?.promo_id && accountId) await recordRedemption(db, String(obj.metadata.promo_id), String(accountId), "stripe", String(obj.id));
  } else if (type === "customer.subscription.created" || type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    await applyStripeSubscription(db, type === "customer.subscription.deleted" ? { ...obj, status: "canceled" } : obj);
  } else if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
    const subId = obj.subscription ?? obj.parent?.subscription_details?.subscription;
    if (subId) await applyStripeSubscription(db, await stripeApi(`/subscriptions/${encodeURIComponent(String(subId))}`));
  } else if (type === "invoice.payment_failed") {
    const subId = obj.subscription ?? obj.parent?.subscription_details?.subscription;
    const account = subId ? await findAccount(db, { subscriptionId: String(subId) }) : null;
    if (account && account.status === "active") await setStatus(db, account.mainId, "past_due");
  }
}

// ── Plan changes started by the customer ──────────────────────────────────────────────────────────

export type UpgradeResult =
  | { kind: "checkout"; url: string }
  | { kind: "submitted" }   // sent to the provider; the plan changes when its verified event arrives
  | { kind: "applied" };    // nothing to charge, applied now

/**
 * Moves the account to a dearer choice: a bigger plan (Starter -> Growth to add a second business), a bigger audience on
 * the same plan, or both. It is the SAME subscription: no second one is created. Stripe prorates natively. Paystack has no
 * proration, so the unused value of the old price is credited against the new price for the days left, the difference is
 * charged once, and the new plan only applies after that payment is confirmed by a verified event. A browser redirect
 * never unlocks anything.
 */
export async function startUpgrade(a: { db: Db; account: Account; toPlan: PaidPlan; toAudience: number; provider: Provider; email: string; interval?: BillingInterval; promo?: PromoDiscount }): Promise<UpgradeResult> {
  const { db, account, toPlan, toAudience, email } = a;
  const paidUp = account.status === "active" && Boolean(account.provider);
  // Still on a trial, or lapsed: the first (or a fresh) payment is an ordinary checkout.
  // The customer chooses monthly or annual here, and may apply a promo code. An account that already pays keeps its interval.
  if (!paidUp) return { kind: "checkout", url: await createCheckout({ db, provider: a.provider, plan: toPlan, audience: toAudience, interval: a.interval ?? account.interval, workspaceId: account.mainId, email, promo: a.promo }) };

  if (account.provider === "stripe") {
    if (!account.providerSubscriptionId) throw new Error("Stripe is not configured for this plan.");
    const newPrice = await stripePriceFor(toPlan, toAudience, account.interval);
    const sub = await stripeApi(`/subscriptions/${encodeURIComponent(account.providerSubscriptionId)}`);
    const itemId = sub?.items?.data?.[0]?.id as string | undefined;
    if (!itemId) throw new Error("Couldn’t read your subscription from Stripe.");
    await stripeApi(`/subscriptions/${encodeURIComponent(account.providerSubscriptionId)}`, {
      method: "POST",
      form: {
        "items[0][id]": itemId, "items[0][price]": newPrice,
        proration_behavior: "always_invoice", payment_behavior: "pending_if_incomplete",
        "metadata[plan_id]": toPlan, "metadata[audience]": String(toAudience), cancel_at_period_end: "false",
      },
    });
    return { kind: "submitted" }; // customer.subscription.updated applies it once Stripe confirms payment
  }

  const oldAmount = currentPaystackAmount(account);
  const newAmount = chargeAmount("paystack", toPlan, toAudience, account.interval);
  if (!oldAmount || !newAmount || !account.periodStart || !account.periodEnd) throw new Error("Paystack is not configured for this change.");
  const { due } = prorateUpgrade({ oldAmount, newAmount, periodStart: account.periodStart, periodEnd: account.periodEnd });
  if (due <= 0) {
    await activateSubscription(db, account.mainId, { plan: toPlan, provider: "paystack", ref: null, interval: account.interval, periodStart: account.periodStart, periodEnd: account.periodEnd, audience: toAudience });
    await repointPaystackSubscription(db, account, toPlan, toAudience);
    return { kind: "applied" };
  }
  const url = await paystackInitialize({
    email, amount: due,
    metadata: { kind: "upgrade", workspace_id: account.mainId, plan_id: toPlan, audience: toAudience, interval: account.interval, expected_amount: due },
  });
  return { kind: "checkout", url };
}

export type DowngradeResult = { ok: true } | { ok: false; problems: string[] };

/**
 * Schedules a smaller choice (a smaller plan, a smaller audience, or both) for the end of the current period. It is
 * refused while the account is too big for it, and nothing is ever deleted to make it fit. Until the period ends the
 * customer keeps what they paid for.
 */
export async function scheduleDowngrade(a: { db: Db; account: Account; toPlan: PaidPlan; toAudience: number }): Promise<DowngradeResult> {
  const { db, account, toPlan, toAudience } = a;
  if (account.status !== "active") return { ok: false, problems: ["Plans can be scheduled once your subscription is active."] };
  if (!isLowerTarget({ plan: toPlan, audience: toAudience }, account)) return { ok: false, problems: ["Choose a smaller plan or audience size to switch down to."] };
  const usage = await getAccountUsage(db, account.mainId);
  if (!usage) return { ok: false, problems: ["Couldn’t check your usage. Try again in a moment."] };
  const problems = downgradeProblems(resolveEntitlements(toPlan, {}, toAudience), { businesses: usage.businessCount, contacts: usage.contactsUsed }, toPlan.charAt(0).toUpperCase() + toPlan.slice(1));
  if (problems.length) return { ok: false, problems };

  if (account.provider === "stripe" && account.providerSubscriptionId) {
    const newPrice = await stripePriceFor(toPlan, toAudience, account.interval);
    const sub = await stripeApi(`/subscriptions/${encodeURIComponent(account.providerSubscriptionId)}`);
    const itemId = sub?.items?.data?.[0]?.id as string | undefined;
    if (!itemId) throw new Error("Couldn’t read your subscription from Stripe.");
    // No proration: the lower price starts with the next invoice.
    await stripeApi(`/subscriptions/${encodeURIComponent(account.providerSubscriptionId)}`, { method: "POST", form: { "items[0][id]": itemId, "items[0][price]": newPrice, proration_behavior: "none" } });
  } else if (account.provider === "paystack") {
    await repointPaystackSubscription(db, account, toPlan, toAudience);
  }
  await db.from("workspaces").update({ pending_plan: toPlan, pending_audience_contacts: toAudience }).eq("id", account.mainId);
  return { ok: true };
}

/** Cancels a scheduled downgrade: the provider is put back on the current price and the schedule is cleared. */
export async function cancelScheduledDowngrade(db: Db, account: Account): Promise<void> {
  if (!account.pendingPlan) return;
  if (isSelfServePlan(account.plan)) {
    if (account.provider === "stripe" && account.providerSubscriptionId) {
      // Accounts from before audience pricing go back to the price id they were sold under.
      const price = account.audience !== null ? await stripePriceFor(account.plan, account.audience, account.interval) : serverEnv.billing.stripePrices[priceKey(account.plan, account.interval)];
      const sub = await stripeApi(`/subscriptions/${encodeURIComponent(account.providerSubscriptionId)}`);
      const itemId = sub?.items?.data?.[0]?.id as string | undefined;
      if (price && itemId) await stripeApi(`/subscriptions/${encodeURIComponent(account.providerSubscriptionId)}`, { method: "POST", form: { "items[0][id]": itemId, "items[0][price]": price, proration_behavior: "none" } });
    } else if (account.provider === "paystack") {
      await repointPaystackSubscription(db, { ...account, providerSubscriptionId: account.providerSubscriptionId }, account.plan, account.audience);
    }
  }
  await db.from("workspaces").update({ pending_plan: null, pending_audience_contacts: null }).eq("id", account.mainId);
}
