import { createHmac, timingSafeEqual } from "crypto";
import { limitsFor, type PlanId } from "@/config/plan-limits";
import { serverEnv } from "@/lib/env.server";
import type { Db } from "@/lib/supabase/admin";

export type PaidPlan = "starter" | "growth";
export type Provider = "stripe" | "paystack";

export const billingEnabled = {
  stripe: () => Boolean(serverEnv.billing.stripeSecretKey),
  paystack: () => Boolean(serverEnv.billing.paystackSecretKey),
};

export async function createCheckout(args: { provider: Provider; plan: PaidPlan; workspaceId: string; email: string }): Promise<string> {
  const { provider, plan, workspaceId, email } = args;
  const base = serverEnv.appUrl;

  if (provider === "stripe") {
    const price = serverEnv.billing.stripePrices[plan];
    if (!serverEnv.billing.stripeSecretKey || !price) throw new Error("Stripe is not configured for this plan.");
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.billing.stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": price,
        "line_items[0][quantity]": "1",
        success_url: `${base}/app/billing?checkout=complete`,
        cancel_url: `${base}/app/billing`,
        customer_email: email,
        client_reference_id: workspaceId,
        "metadata[plan_id]": plan,
        "metadata[workspace_id]": workspaceId,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.url) throw new Error(json?.error?.message ?? "Stripe could not start checkout.");
    return json.url as string;
  }

  const amount = serverEnv.billing.paystackAmounts[plan];
  if (!serverEnv.billing.paystackSecretKey || !amount) throw new Error("Paystack is not configured for this plan.");
  const planCode = serverEnv.billing.paystackPlans[plan];
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv.billing.paystackSecretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      amount,
      callback_url: `${base}/app/billing?checkout=complete`,
      metadata: { workspace_id: workspaceId, plan_id: plan },
      ...(planCode ? { plan: planCode } : {}),
    }),
  });
  const json = await res.json();
  if (!res.ok || !json?.data?.authorization_url) throw new Error(json?.message ?? "Paystack could not start checkout.");
  return json.data.authorization_url as string;
}

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

export async function applyPlan(db: Db, workspaceId: string, plan: PlanId, provider: Provider, ref: string | null) {
  const limits = limitsFor(plan);
  const { data: ws } = await db.from("workspaces").select("daily_send_limit").eq("id", workspaceId).maybeSingle();
  if (!ws) return;
  await db.from("workspaces").update({
    plan,
    max_contacts: limits.contacts,
    daily_send_limit: Math.max(ws.daily_send_limit, limits.startDaily),
    billing_provider: provider,
    billing_ref: ref,
  }).eq("id", workspaceId);
}

export async function downgradeToFree(db: Db, workspaceId: string) {
  const limits = limitsFor("free");
  await db.from("workspaces").update({ plan: "free", max_contacts: limits.contacts, daily_send_limit: limits.startDaily, billing_ref: null }).eq("id", workspaceId);
}
