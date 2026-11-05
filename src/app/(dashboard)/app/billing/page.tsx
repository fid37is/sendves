import type { Metadata } from "next";
import { ANNUAL_BILLING_ENABLED, ANNUAL_MONTHS_PAID, planRank, SELF_SERVE_PLANS, type BillingInterval } from "@/config/plan-limits";
import { displayPrice, plans, planName } from "@/config/plans";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormActions } from "@/components/ui/form-actions";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/submit-button";
import { PageToasts } from "@/components/ui/toast";
import { NoAccess } from "@/components/dashboard/no-access";
import { can } from "@/lib/access";
import { getContext } from "@/lib/workspace";
import { formatNumber } from "@/lib/utils";
import type { SearchParams } from "@/types";
import { describePromo, type PromoRow } from "@/lib/promo";
import { billingEnabled, intervalAvailable } from "@/server/billing";
import { checkPromoForCheckout } from "@/server/promo";
import { getAccountUsage, type BusinessUsage } from "@/server/usage";
import { saveAllocationsAction, scheduleDowngradeAction, startCheckoutAction } from "./actions";

export const metadata: Metadata = { title: "Billing" };

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "-");

function Meter({ label, used, limit, note }: { label: string; used: number; limit: number; note?: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-semibold text-ink">{label}</span><span className="text-ink-muted">{formatNumber(used)} of {formatNumber(limit)}</span></div>
      <div className="mt-2 h-2 rounded-full bg-mist-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      {note ? <p className="mt-1.5 text-xs text-ink-muted">{note}</p> : null}
    </div>
  );
}

/** Who is using the shared pool, underneath its meter. */
function Breakdown({ rows, pick, unit }: { rows: BusinessUsage[]; pick: (b: BusinessUsage) => number; unit: string }) {
  if (rows.length < 2) return null;
  return (
    <ul className="mt-3 space-y-1 border-l-2 border-mist pl-4 text-sm" aria-label={`${unit} by business`}>
      {rows.map((b) => (
        <li key={b.id} className="flex justify-between gap-4">
          <span className="text-ink-soft">{b.name}</span>
          <span className="font-medium text-ink">{formatNumber(pick(b))}</span>
        </li>
      ))}
    </ul>
  );
}

const STATUS: Record<string, { label: string; tone: "brand" | "success" | "warning" | "danger" }> = {
  trialing: { label: "Free trial", tone: "brand" },
  active: { label: "Active", tone: "success" },
  past_due: { label: "Payment overdue", tone: "warning" },
  canceled: { label: "Canceled", tone: "danger" },
  expired: { label: "Expired", tone: "danger" },
  incomplete: { label: "Payment pending", tone: "warning" },
};

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  if (!can(ctx?.access, "billing.manage")) return <NoAccess title="Billing" what="billing" />;
  const usage = ctx?.db && ctx.workspace ? await getAccountUsage(ctx.db, ctx.workspace.id) : null;
  if (!usage) {
    return (
      <>
        <PageHeader title="Billing" description="Your plan, usage and payment details." />
        <Card><p className="p-6 text-sm text-ink-soft">We couldn’t load your billing details right now. Try again in a moment.</p></Card>
      </>
    );
  }

  const { account, access, window, limits, remaining, perBusiness } = usage;
  const providers = ([billingEnabled.stripe() && "stripe", billingEnabled.paystack() && "paystack"].filter(Boolean)) as ("stripe" | "paystack")[];
  const covered = Boolean(ctx?.workspace?.account_workspace_id);
  const paidUp = account.status === "active";
  const status = STATUS[account.status] ?? STATUS.incomplete;
  const atLimit = remaining.contacts === 0 || remaining.emails === 0;

  // Annual is offered once a payment method can actually charge it. An account that already pays keeps its interval.
  const annualReady = ANNUAL_BILLING_ENABLED && providers.some((pr) => SELF_SERVE_PLANS.every((id) => intervalAvailable(pr, id, "year")));
  const interval: BillingInterval = paidUp ? account.interval : annualReady && searchParams.interval === "year" ? "year" : "month";

  // A promo code typed on this page is checked against each plan, so every price can show what it would cost.
  const promoCode = !paidUp && !covered ? String(searchParams.promo ?? "").trim().slice(0, 40) : "";
  let promoOk: { promo: PromoRow; applies: Set<string> } | null = null;
  let promoError = "";
  if (promoCode && ctx?.db) {
    const applies = new Set<string>();
    let found: PromoRow | null = null;
    for (const id of SELF_SERVE_PLANS) {
      const res = await checkPromoForCheckout(ctx.db, promoCode, { accountId: account.mainId, plan: id, interval });
      if (res.ok) { applies.add(id); found = res.promo; } else if (!promoError) promoError = res.reason;
    }
    if (found) promoOk = { promo: found, applies };
  }
  const promoParam = promoCode ? `&promo=${encodeURIComponent(promoCode)}` : "";

  return (
    <>
      {searchParams.checkout === "complete" ? (
        <PageToasts toasts={[{ id: "checkout-complete", kind: "info", message: "Thanks. Your plan updates as soon as your payment is confirmed, usually within a minute." }]} />
      ) : null}
      <PageHeader title="Billing" description="One account, one subscription, for every business you run." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={`${planName(account.plan)} plan`} description={`${account.limits.businesses} business ${account.limits.businesses === 1 ? "workspace" : "workspaces"} on one subscription.`} action={<Badge tone={status.tone}>{status.label}</Badge>} />
          <dl className="space-y-2 px-4 pt-4 text-sm sm:px-6">
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Billing</dt><dd className="font-medium text-ink">{account.interval === "year" ? "Annual" : "Monthly"}</dd></div>
            {account.status === "trialing" ? (
              <>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Trial started</dt><dd className="font-medium text-ink">{day(account.trialStartedAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Trial ends</dt><dd className="font-medium text-ink">{day(account.trialEndsAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Days left</dt><dd className="font-medium text-ink">{access.trialDaysLeft ?? 0}</dd></div>
              </>
            ) : account.periodEnd ? (
              <div className="flex justify-between gap-4"><dt className="text-ink-muted">{account.cancelAtPeriodEnd || account.status === "canceled" ? "Ends on" : "Renews on"}</dt><dd className="font-medium text-ink">{day(account.periodEnd)}</dd></div>
            ) : null}
            {account.pendingPlan ? (
              <div className="flex justify-between gap-4"><dt className="text-ink-muted">Scheduled change</dt><dd className="font-medium text-ink">{planName(account.pendingPlan)} from {day(account.periodEnd)}</dd></div>
            ) : null}
          </dl>
          {!access.sending && access.reason ? <p className="mx-4 mt-4 rounded-xl bg-danger-soft p-4 text-sm text-danger sm:mx-6">{access.reason}</p> : null}
          {account.status === "trialing" && access.sending ? (
            <p className="mx-4 mt-4 rounded-xl bg-brand-50 p-4 text-sm text-brand-800 sm:mx-6">
              Your trial sends up to {formatNumber(limits.emails)} emails in total. Subscribe before {day(account.trialEndsAt)} to keep sending without a break and to unlock your full plan.
            </p>
          ) : null}
          {atLimit && paidUp ? <p className="mx-4 mt-4 rounded-xl bg-warning-soft p-4 text-sm text-warning sm:mx-6">You’ve used all of a shared allowance. Move to a bigger plan to add more.</p> : null}

          <div className="space-y-6 p-4 sm:p-6">
            <div>
              <Meter label="Contacts" used={usage.contactsUsed} limit={limits.contacts} note="Shared by every business on your account." />
              <Breakdown rows={perBusiness} pick={(b) => b.contacts} unit="Contacts" />
            </div>
            <div>
              <Meter label={account.status === "trialing" ? "Emails during your trial" : "Emails this billing period"} used={usage.emailsSent} limit={limits.emails} note={`Shared by every business. Counted ${day(window.start)} to ${day(new Date(window.end.getTime() - 1))}.`} />
              <Breakdown rows={perBusiness} pick={(b) => b.emails} unit="Emails" />
            </div>
            <Meter label="Business workspaces" used={usage.businessCount} limit={limits.businesses} />
            <p className="text-xs text-ink-muted">The daily send limit and sending domains are set for each business separately. They aren’t shared.</p>
            {covered ? <p className="text-sm text-ink-muted">This business is covered by the subscription on your main business. To change the plan, switch to your main business.</p> : null}
          </div>
        </Card>

        <div className="space-y-6">
          <Card id="plans" className="scroll-mt-24">
            <CardHeader title="Plans" description="14-day free trial on every plan. Contacts and emails are shared across your businesses." />
            {!paidUp && !covered ? (
              <div className="space-y-4 border-b border-mist px-4 py-4 sm:px-6">
                {annualReady ? (
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Billing interval">
                    <ButtonLink href={`/app/billing?interval=month${promoParam}#plans`} size="sm" variant={interval === "month" ? "primary" : "outline"}>Monthly</ButtonLink>
                    <ButtonLink href={`/app/billing?interval=year${promoParam}#plans`} size="sm" variant={interval === "year" ? "primary" : "outline"}>Annual</ButtonLink>
                    <span className="text-xs text-ink-muted">Annual pays for {ANNUAL_MONTHS_PAID} months and covers 12.</span>
                  </div>
                ) : null}
                <form method="get" action="/app/billing" className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="interval" value={interval} />
                  <div className="min-w-[12rem] flex-1">
                    <Field label="Promo code" htmlFor="promo"><Input id="promo" name="promo" defaultValue={promoCode} placeholder="Enter a code" autoComplete="off" /></Field>
                  </div>
                  <Button type="submit" size="sm" variant="outline">Apply</Button>
                </form>
                {promoOk ? <p className="text-sm text-success">{promoOk.promo.code}: {describePromo(promoOk.promo)}.</p> : promoError ? <p className="text-sm text-danger">{promoError}</p> : null}
              </div>
            ) : null}
            <ul className="divide-y divide-mist">
              {plans.map((p) => {
                const percentOff = promoOk?.applies.has(p.id) ? promoOk.promo.percent_off : 0;
                const shown = displayPrice(p, interval, percentOff);
                const isCurrent = p.id === account.plan && paidUp;
                const higher = planRank(p.id) > planRank(account.plan);
                const lower = planRank(p.id) < planRank(account.plan);
                const canSubscribe = !covered && p.id !== "custom" && (!paidUp || higher || (p.id === account.plan && Boolean(account.pendingPlan)));
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm sm:px-6">
                    <div>
                      <p className="font-semibold text-ink">{p.name}</p>
                      <p className="text-ink-muted">{p.businesses}</p>
                      <p className="text-ink-muted">{p.contacts}, {p.sends}</p>
                      {interval === "year" && p.annual ? <p className="text-ink-muted">{p.annual.note}, about {p.annual.perMonth} a month</p> : null}
                    </div>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                      <p className="font-bold text-ink">
                        {shown.was ? <s className="mr-1 font-normal text-ink-muted">{shown.was}</s> : null}{shown.price}{" "}
                        <span className="font-normal text-ink-muted">{p.id === "custom" ? "" : shown.period === "per year" ? "/ yr" : "/ mo"}</span>
                      </p>
                      {isCurrent ? <span className="text-xs font-semibold text-success">Current</span> : null}
                      {account.pendingPlan === p.id ? <span className="text-xs font-semibold text-ink-muted">Starts {day(account.periodEnd)}</span> : null}
                      {p.id === "custom" ? <ButtonLink href="/contact" size="sm" variant="outline">Contact sales</ButtonLink> : null}
                      {canSubscribe ? (
                        providers.length > 0 ? (
                          providers.map((pr) => (
                            <form key={pr} action={startCheckoutAction}>
                              <input type="hidden" name="plan" value={p.id} />
                              <input type="hidden" name="provider" value={pr} />
                              <input type="hidden" name="interval" value={interval} />
                              {promoOk?.applies.has(p.id) ? <input type="hidden" name="promo" value={promoCode} /> : null}
                              <ActionButton size="sm" variant={providers.length === 1 ? "primary" : "outline"}>
                                {providers.length === 1 ? (paidUp ? `Upgrade to ${p.name}` : `Subscribe to ${p.name}`) : pr === "stripe" ? "Pay by card" : "Pay with Paystack"}
                              </ActionButton>
                            </form>
                          ))
                        ) : (
                          <ButtonLink href="/contact" size="sm">{paidUp ? "Upgrade" : "Subscribe"}</ButtonLink>
                        )
                      ) : null}
                      {!covered && paidUp && lower && p.id !== "custom" && account.pendingPlan !== p.id ? (
                        <form action={scheduleDowngradeAction}>
                          <input type="hidden" name="plan" value={p.id} />
                          <ActionButton size="sm" variant="outline">Switch at renewal</ActionButton>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {providers.length === 0 ? <p className="border-t border-mist px-4 py-4 text-sm text-ink-muted sm:px-6">Online payment isn’t switched on yet. Send us a request and we’ll move your plan for you.</p> : null}
          </Card>

          {!covered && perBusiness.length > 1 ? (
            <Card>
              <CardHeader title="Allocate your shared allowance" description="Optionally keep a business to part of the pool. Allocations sit inside your plan’s totals and never add to them. Leave a box empty for no limit." />
              <form action={saveAllocationsAction}>
                <div className="divide-y divide-mist">
                  {perBusiness.map((b) => (
                    <div key={b.id} className="grid gap-4 px-4 py-4 sm:grid-cols-3 sm:px-6">
                      <p className="text-sm font-semibold text-ink sm:col-span-3">{b.name}</p>
                      <Field label="Contacts" htmlFor={`contacts_${b.id}`}>
                        <Input id={`contacts_${b.id}`} name={`contacts_${b.id}`} inputMode="numeric" defaultValue={b.contactCap ?? ""} placeholder="No limit" />
                      </Field>
                      <Field label="Emails per period" htmlFor={`emails_${b.id}`}>
                        <Input id={`emails_${b.id}`} name={`emails_${b.id}`} inputMode="numeric" defaultValue={b.emailCap ?? ""} placeholder="No limit" />
                      </Field>
                      <Field label="At the limit" htmlFor={`mode_${b.id}`}>
                        <Select id={`mode_${b.id}`} name={`mode_${b.id}`} defaultValue={b.capMode}>
                          <option value="hard">Stop and block</option>
                          <option value="soft">Warn only</option>
                        </Select>
                      </Field>
                    </div>
                  ))}
                </div>
                <div className="border-t border-mist p-4 sm:p-6"><FormActions><ActionButton requireChange>Save allocations</ActionButton></FormActions></div>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
