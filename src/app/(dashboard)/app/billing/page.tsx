import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { SearchParams } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { PageToasts } from "@/components/ui/toast";
import { plans } from "@/config/plans";
import { getOverview } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { formatNumber } from "@/lib/utils";
import { billingEnabled } from "@/server/billing";
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

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  const { workspace } = await getOverview(ctx!);
  const providers = ([billingEnabled.stripe() && "stripe", billingEnabled.paystack() && "paystack"].filter(Boolean)) as ("stripe" | "paystack")[];
  const current = (ctx?.workspace?.plan ?? "free").toLowerCase();

  return (
    <>
      {searchParams.checkout === "complete" ? (
        <PageToasts toasts={[{ id: "checkout-complete", kind: "info", message: "Thanks. If your payment went through, your plan updates within a minute." }]} />
      ) : null}
      <PageHeader title="Billing" description="Your plan, usage and payment details." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Current plan" description={`You’re on the ${workspace.plan} plan.`} />
          <div className="space-y-5 p-6">
            <Meter label="Contacts" used={workspace.contactsUsed} limit={workspace.contactsLimit} />
            <Meter label="Emails this month" used={workspace.sendsUsed} limit={workspace.sendsLimit} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Available plans" />
          <ul className="divide-y divide-mist">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm">
                <div><p className="font-semibold text-ink">{p.name}</p><p className="text-ink-muted">{p.contacts}</p></div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-ink">{p.price} <span className="font-normal text-ink-muted">{p.price === "Custom" ? "" : "/ mo"}</span></p>
                  {p.id === current ? <span className="text-xs font-semibold text-success">Current</span> : null}
                  {(p.id === "starter" || p.id === "growth") && p.id !== current
                    ? providers.map((pr) => (
                        <form key={pr} action={startCheckoutAction}>
                          <input type="hidden" name="plan" value={p.id} />
                          <input type="hidden" name="provider" value={pr} />
                          <Button type="submit" size="sm" variant="outline">{pr === "stripe" ? "Pay by card" : "Pay with Paystack"}</Button>
                        </form>
                      ))
                    : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {providers.length === 0 ? <PageToasts toasts={[{ id: "no-billing", kind: "info", message: "Online payments aren’t available yet. Contact support to change your plan." }]} /> : null}
    </>
  );
}
