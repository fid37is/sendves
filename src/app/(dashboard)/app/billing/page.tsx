import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form-actions";
import { ActionButton } from "@/components/ui/submit-button";
import { Card, CardHeader } from "@/components/ui/card";
import type { SearchParams } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { PageToasts } from "@/components/ui/toast";
import { plans } from "@/config/plans";
import { getOverview } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { can } from "@/lib/access";
import { NoAccess } from "@/components/dashboard/no-access";
import { formatNumber } from "@/lib/utils";
import { billingEnabled } from "@/server/billing";
import { getBusinessQuota } from "@/server/businesses";
import { startCheckoutAction } from "./actions";

export const metadata: Metadata = { title: "Billing" };

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-semibold text-ink">{label}</span><span className="text-ink-muted">{formatNumber(used)} of {formatNumber(limit)}</span></div>
      <div className="mt-2 h-2 rounded-full bg-mist-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const ORDER = ["free", "starter", "growth", "scale"];

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  if (!can(ctx?.access, "billing.manage")) return <NoAccess title="Billing" what="billing" />;
  const { workspace } = await getOverview(ctx!);
  const providers = ([billingEnabled.stripe() && "stripe", billingEnabled.paystack() && "paystack"].filter(Boolean)) as ("stripe" | "paystack")[];
  const current = (ctx?.workspace?.plan ?? "free").toLowerCase();
  const currentRank = ORDER.indexOf(current);
  const covered = Boolean(ctx?.workspace?.account_workspace_id);
  const canUpgrade = currentRank < ORDER.length - 1 && !covered;
  const quota = !covered && ctx?.db ? await getBusinessQuota(ctx.db, ctx.user.id) : null;


  return (
    <>
      {searchParams.checkout === "complete" ? (
        <PageToasts toasts={[{ id: "checkout-complete", kind: "info", message: "Thanks. If your payment went through, your plan updates within a minute." }]} />
      ) : null}
      <PageHeader title="Billing" description="Your plan, usage and payment details." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Current plan" description={`You’re on the ${workspace.plan} plan.`} />
          <div className="space-y-5 p-4 sm:p-6">
            <Meter label="Contacts" used={workspace.contactsUsed} limit={workspace.contactsLimit} />
            <Meter label="Emails this month" used={workspace.sendsUsed} limit={workspace.sendsLimit} />
            {quota ? <Meter label="Businesses" used={quota.used} limit={quota.cap} /> : null}
            {covered ? <p className="text-sm text-ink-muted">This business is covered by the plan on your main business. Contacts and emails above are for this business alone. To change the plan, switch to your main business.</p> : null}
          </div>
          {canUpgrade ? (
            <div className="border-t border-mist p-4 sm:p-6">
              {providers.length === 0 ? (
                <p className="mb-4 text-sm text-ink-muted">Online payment isn’t switched on yet. Send us a request and we’ll move your plan for you.</p>
              ) : null}
              <FormActions>
                <ButtonLink href="#plans">Upgrade Plan</ButtonLink>
              </FormActions>
            </div>
          ) : null}
        </Card>
        <Card id="plans" className="scroll-mt-24">
          <CardHeader title="Available plans" />
          <ul className="divide-y divide-mist">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm sm:px-6">
                <div><p className="font-semibold text-ink">{p.name}</p><p className="text-ink-muted">{p.contacts}</p></div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                  <p className="font-bold text-ink">{p.price} <span className="font-normal text-ink-muted">{p.price === "Custom" ? "" : "/ mo"}</span></p>
                  {p.id === current ? <span className="text-xs font-semibold text-success">Current</span> : null}
                  {ORDER.indexOf(p.id) > currentRank && p.id !== "scale" ? (
                    providers.length > 0 ? (
                      providers.map((pr) => (
                        <form key={pr} action={startCheckoutAction}>
                          <input type="hidden" name="plan" value={p.id} />
                          <input type="hidden" name="provider" value={pr} />
                          <ActionButton size="sm" variant={providers.length === 1 ? "primary" : "outline"}>
                            {providers.length === 1 ? `Upgrade to ${p.name}` : pr === "stripe" ? "Pay by card" : "Pay with Paystack"}
                          </ActionButton>
                        </form>
                      ))
                    ) : (
                      <ButtonLink href="/contact" size="sm">Upgrade</ButtonLink>
                    )
                  ) : null}
                  {p.id === "scale" && current !== "scale" ? <ButtonLink href="/contact" size="sm" variant="outline">Contact sales</ButtonLink> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}