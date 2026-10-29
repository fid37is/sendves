"use server";

import { redirect } from "next/navigation";
import { go } from "@/lib/flash";
import { requireWorkspace } from "@/lib/workspace";
import { createCheckout, type PaidPlan, type Provider } from "@/server/billing";

export async function startCheckoutAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/billing");
  const plan = String(formData.get("plan") ?? "");
  const provider = String(formData.get("provider") ?? "");
  if (plan !== "starter" && plan !== "growth") go("/app/billing", "err", "Choose a plan.");
  if (provider !== "stripe" && provider !== "paystack") go("/app/billing", "err", "Choose a payment method.");

  let url = "";
  try {
    url = await createCheckout({ provider: provider as Provider, plan: plan as PaidPlan, workspaceId: ctx.workspace.id, email: ctx.user.email });
  } catch (err) {
    go("/app/billing", "err", (err as Error).message);
  }
  redirect(url);
}
