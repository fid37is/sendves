// src/app/(dashboard)/app/billing/actions.ts
"use server";

import { redirect } from "next/navigation";
import { go } from "@/lib/flash";
import { requireWorkspace } from "@/lib/workspace";
import { billingEnabled, createCheckout, type PaidPlan, type Provider } from "@/server/billing";

const BACK = "/app/billing";

export async function startCheckoutAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const plan = String(formData.get("plan") ?? "");
  const provider = String(formData.get("provider") ?? "");

  if (plan !== "starter" && plan !== "growth") go(BACK, "err", "Choose a plan to continue.");
  if (provider !== "stripe" && provider !== "paystack") go(BACK, "err", "Choose a payment method.");
  if (!billingEnabled[provider]()) go(BACK, "err", "That payment method isn’t available yet. Contact support to change your plan.");
  if (ctx.workspace.plan === plan) go(BACK, "info", "You’re already on that plan.");
  if (ctx.workspace.status === "suspended") go(BACK, "err", "Your account is suspended. Contact support before changing your plan.");

  let url: string;
  try {
    url = await createCheckout({ provider: provider as Provider, plan: plan as PaidPlan, workspaceId: ctx.workspace.id, email: ctx.user.email });
  } catch (err) {
    console.error("[billing] checkout failed:", (err as Error).message);
    go(BACK, "err", "Couldn’t start checkout. Try again, or contact support if this continues.");
  }
  redirect(url); // outside try/catch: redirect() works by throwing
}