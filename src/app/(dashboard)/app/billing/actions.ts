"use server";

import { redirect } from "next/navigation";
import { ANNUAL_BILLING_ENABLED, isSelfServePlan, planRank, type BillingInterval } from "@/config/plan-limits";
import { planName } from "@/config/plans";
import { go } from "@/lib/flash";
import { requireWorkspace } from "@/lib/workspace";
import { recordAudit } from "@/server/audit";
import { billingEnabled, CheckoutRefused, cancelScheduledDowngrade, intervalAvailable, scheduleDowngrade, startUpgrade, type Provider, type PromoDiscount } from "@/server/billing";
import { checkPromoForCheckout } from "@/server/promo";
import { loadAccount } from "@/server/usage";

const BACK = "/app/billing";

/**
 * Subscribe, or move to a bigger plan. One subscription per account: when the account already pays, this changes that
 * subscription (prorated) instead of starting another. Nothing is unlocked here. The plan changes when the provider's
 * verified event arrives.
 */
export async function startCheckoutAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "billing.manage");
  const plan = String(formData.get("plan") ?? "");
  const provider = String(formData.get("provider") ?? "");
  const interval: BillingInterval = ANNUAL_BILLING_ENABLED && String(formData.get("interval") ?? "") === "year" ? "year" : "month";

  if (ctx.workspace.account_workspace_id) go(BACK, "info", "This business is covered by the subscription on your main business. Switch to your main business to change the plan.");
  if (plan === "custom") go("/contact", "info", "Custom plans are set up with our team. Tell us what you need.");
  if (!isSelfServePlan(plan)) go(BACK, "err", "Choose a plan to continue.");
  if (provider !== "stripe" && provider !== "paystack") go(BACK, "err", "Choose a payment method.");
  if (!billingEnabled[provider]()) go(BACK, "err", "That payment method isn’t available yet. Contact support to change your plan.");
  if (ctx.workspace.status === "suspended") go(BACK, "err", "Your account is suspended. Contact support before changing your plan.");

  const account = await loadAccount(ctx.db, ctx.workspace.id);
  if (!account) go(BACK, "err", "Couldn’t read your subscription. Try again in a moment.");
  if (account.status === "active" && account.plan === plan) {
    if (!account.pendingPlan) go(BACK, "info", "You’re already on that plan.");
    // Choosing the current plan again while a smaller one is scheduled keeps the current plan.
    try {
      await cancelScheduledDowngrade(ctx.db, account);
    } catch (err) {
      console.error("[billing] cancel scheduled change failed:", (err as Error).message);
      go(BACK, "err", "Couldn’t cancel the scheduled change. Try again, or contact support if this continues.");
    }
    go(BACK, "ok", `Your scheduled change was cancelled. You’re staying on ${planName(account.plan)}.`);
  }
  if (account.status === "active" && planRank(plan) < planRank(account.plan)) go(BACK, "info", "To move to a smaller plan, use “Switch at renewal” so it starts when this period ends.");

  // An account that already pays keeps its billing interval. Everyone else picks monthly or annual here.
  const chosen: BillingInterval = account.status === "active" ? account.interval : interval;
  if (chosen === "year" && !intervalAvailable(provider as Provider, plan, "year")) go(BACK, "err", "Annual billing isn’t available for this payment method yet. Choose monthly, or another payment method.");

  let promo: PromoDiscount | undefined;
  const code = String(formData.get("promo") ?? "").trim();
  if (code) {
    if (account.status === "active") go(BACK, "info", "Promo codes apply when you first subscribe, not to a plan change on an active subscription.");
    const res = await checkPromoForCheckout(ctx.db, code, { accountId: account.mainId, plan, interval: chosen });
    if (!res.ok) go(BACK, "err", res.reason);
    promo = { id: res.promo.id, code: res.promo.code, percentOff: res.promo.percent_off, duration: res.promo.duration, durationMonths: res.promo.duration_months };
  }

  let result: Awaited<ReturnType<typeof startUpgrade>>;
  try {
    result = await startUpgrade({ db: ctx.db, account, toPlan: plan, provider: provider as Provider, email: ctx.user.email, interval: chosen, promo });
  } catch (err) {
    if (err instanceof CheckoutRefused) go(BACK, "err", err.message);
    console.error("[billing] checkout failed:", (err as Error).message);
    go(BACK, "err", "Couldn’t start checkout. Try again, or contact support if this continues.");
  }
  await recordAudit(ctx.db, { id: ctx.user.id, email: ctx.user.email }, "billing.plan_requested", { type: "workspace", id: account.mainId }, { from: account.plan, to: plan, provider, interval: chosen, promo: promo?.code ?? null });
  if (result.kind === "submitted") go(BACK, "info", `Your move to ${planName(plan)} was sent to your payment provider. It takes effect as soon as the payment is confirmed, usually within a minute.`);
  if (result.kind === "applied") go(BACK, "ok", `You’re now on ${planName(plan)}.`);
  redirect(result.url); // outside try/catch: redirect() works by throwing
}

/** Schedules a smaller plan for the end of the current period. Refused while the account is too big for it. */
export async function scheduleDowngradeAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "billing.manage");
  const plan = String(formData.get("plan") ?? "");
  if (ctx.workspace.account_workspace_id) go(BACK, "info", "Switch to your main business to change the plan.");
  if (!isSelfServePlan(plan)) go(BACK, "err", "Choose a plan to continue.");
  const account = await loadAccount(ctx.db, ctx.workspace.id);
  if (!account) go(BACK, "err", "Couldn’t read your subscription. Try again in a moment.");

  let result: Awaited<ReturnType<typeof scheduleDowngrade>>;
  try {
    result = await scheduleDowngrade({ db: ctx.db, account, toPlan: plan });
  } catch (err) {
    console.error("[billing] downgrade failed:", (err as Error).message);
    go(BACK, "err", "Couldn’t schedule that change. Try again, or contact support if this continues.");
  }
  if (!result.ok) go(BACK, "err", result.problems.join(" "));
  await recordAudit(ctx.db, { id: ctx.user.id, email: ctx.user.email }, "billing.downgrade_scheduled", { type: "workspace", id: account.mainId }, { from: account.plan, to: plan });
  go(BACK, "ok", `You’ll move to ${planName(plan)} when this billing period ends. Until then you keep everything in ${planName(account.plan)}.`);
}

const wholeOrNull = (v: FormDataEntryValue | null): number | null | "bad" => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isInteger(n) && n >= 0 && n <= 100_000_000 ? n : "bad";
};

/**
 * Optional allocation per business. These are sub-limits INSIDE the shared pool: they can hold one business back so it
 * doesn't use everything, and they never add to the account's total. Blank means "use any remaining shared capacity".
 */
export async function saveAllocationsAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "billing.manage");
  if (ctx.workspace.account_workspace_id) go(BACK, "info", "Switch to your main business to set allocations.");
  const account = await loadAccount(ctx.db, ctx.workspace.id);
  if (!account) go(BACK, "err", "Couldn’t read your subscription. Try again in a moment.");

  const { data: rows } = await ctx.db.from("workspaces").select("id").or(`id.eq.${account.mainId},account_workspace_id.eq.${account.mainId}`);
  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  const updates: { id: string; contact_cap: number | null; send_cap: number | null; cap_mode: "soft" | "hard" }[] = [];
  for (const id of ids) {
    const contacts = wholeOrNull(formData.get(`contacts_${id}`));
    const emails = wholeOrNull(formData.get(`emails_${id}`));
    if (contacts === "bad" || emails === "bad") go(BACK, "err", "Use whole numbers for allocations, or leave a box empty for no limit.");
    if ((contacts ?? 0) > account.limits.contacts) go(BACK, "err", `An allocation can’t be larger than your plan’s ${account.limits.contacts.toLocaleString("en-US")} contacts.`);
    if ((emails ?? 0) > account.limits.monthlySends) go(BACK, "err", `An allocation can’t be larger than your plan’s ${account.limits.monthlySends.toLocaleString("en-US")} emails.`);
    updates.push({ id, contact_cap: contacts, send_cap: emails, cap_mode: String(formData.get(`mode_${id}`)) === "soft" ? "soft" : "hard" });
  }
  for (const u of updates) await ctx.db.from("workspaces").update({ contact_cap: u.contact_cap, send_cap: u.send_cap, cap_mode: u.cap_mode }).eq("id", u.id);
  await recordAudit(ctx.db, { id: ctx.user.id, email: ctx.user.email }, "billing.allocations", { type: "workspace", id: account.mainId }, { businesses: updates.length });
  go(BACK, "ok", "Allocations saved. Your plan’s total didn’t change.");
}
