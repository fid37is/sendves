import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormActions } from "@/components/ui/form-actions";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/submit-button";
import { plans, planName } from "@/config/plans";
import { getContext } from "@/lib/workspace";
import { getBusinessQuota } from "@/server/businesses";
import { createBusinessAction } from "../actions";

export const metadata: Metadata = { title: "Add business" };

export default async function NewBusinessPage() {
  const ctx = await getContext();
  const quota = ctx?.db && ctx.user ? await getBusinessQuota(ctx.db, ctx.user.id) : null;

  if (!quota) {
    return (
      <>
        <PageHeader title="Add business" />
        <Card><p className="p-6 text-sm text-ink-soft">Only the owner of a business can add another one.</p></Card>
      </>
    );
  }

  const full = quota.used >= quota.cap;
  const next = quota.nextPlan && quota.nextPlan !== "custom" ? plans.find((p) => p.id === quota.nextPlan) ?? null : null;
  return (
    <>
      <PageHeader
        title="Add business"
        description="Each business has its own logo, address, sending domains, contacts and unsubscribes. You switch between them from the sidebar."
      />
      <Card className="max-w-xl">
        <CardHeader title="New business" description={`Your ${planName(quota.main.plan)} plan covers ${quota.cap} ${quota.cap === 1 ? "business" : "businesses"} on one subscription. You’re using ${quota.used}.`} />
        {!quota.access.sending ? (
          <div className="space-y-4 p-6">
            <p className="text-sm text-ink-soft">{quota.access.reason}</p>
            <ButtonLink href="/app/billing">Go to billing</ButtonLink>
          </div>
        ) : full ? (
          <div className="space-y-4 p-6">
            {next ? (
              <>
                <p className="text-sm text-ink-soft">
                  You’ve used every business your plan includes. <strong className="text-ink">{next.name}</strong> covers {next.businesses} for {next.price} a month. It changes the plan on your one subscription. You never get a second subscription, and any days you’ve already paid for are credited.
                </p>
                <ButtonLink href="/app/billing#plans">Upgrade to {next.name}</ButtonLink>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-soft">You’ve used every business your plan includes. For more, we set up a Custom plan with limits that suit you.</p>
                <ButtonLink href="/contact">Contact sales</ButtonLink>
              </>
            )}
          </div>
        ) : (
          <form action={createBusinessAction}>
            <div className="space-y-5 p-6">
              <Field label="Business name" htmlFor="name" hint="You can change it later in Settings.">
                <Input id="name" name="name" maxLength={80} required autoComplete="off" placeholder="Chocowares" />
              </Field>
            </div>
            <div className="border-t border-mist p-6">
              <FormActions><ActionButton>Create business</ActionButton></FormActions>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
