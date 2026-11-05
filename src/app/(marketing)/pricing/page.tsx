import type { Metadata } from "next";
import { FAQ, PageIntro, Section } from "@/components/marketing/section";
import { PlanCards } from "@/components/marketing/plan-cards";
import { CtaBand } from "@/components/marketing/landing-sections";
import { ANNUAL_BILLING_ENABLED, ANNUAL_MONTHS_PAID, planLimits } from "@/config/plan-limits";
import { ButtonLink } from "@/components/ui/button";
import type { SearchParams } from "@/types";
import { TRIAL_PROMISE } from "@/config/plans";

export const metadata: Metadata = { title: "Pricing", description: "One account, one subscription, several businesses. Every plan starts with a 14-day free trial." };

const faqs = [
  { q: "How does the free trial work?", a: `Every plan starts with a ${planLimits.starter.trialDays}-day free trial of the plan you pick. During the trial, sending volume is capped to protect everyone’s deliverability. Before it ends we ask you to subscribe. If you don’t, sending pauses, but your businesses, contacts and campaigns are kept.` },
  { q: "Can one plan cover more than one business?", a: `Yes, that’s the point. One account and one subscription covers ${planLimits.starter.businesses} business on Starter, ${planLimits.growth.businesses} on Growth and ${planLimits.pro.businesses} on Pro. Each business has its own logo, address, sending domains and unsubscribes.` },
  { q: "Are contacts and emails per business?", a: "No. Contacts and monthly emails are shared across all the businesses on your account, so you can use them unevenly. For example, 20,000 contacts in one business and 7,000 in another on Growth’s 27,000. Daily send limits and sending domains are set for each business." },
  { q: "What happens when I need another business?", a: "Adding a business beyond your plan takes you to the next plan. It changes your one subscription and credits the days you’ve already paid for, so you don’t pay twice." },
  { q: "Do you offer annual billing and promo codes?", a: `Yes. Annual billing pays for ${ANNUAL_MONTHS_PAID} months and covers 12. If you have a promo code, enter it on the Billing page when you subscribe. The code takes a percentage off, and its terms (first payment, a number of months, or every payment) are shown when you apply it.` },
  { q: "Can I change plans later?", a: "Yes. Upgrades take effect once your payment is confirmed. Moving to a smaller plan starts at your next renewal, and only if your businesses and contacts fit in it. We never delete anything to make it fit." },
  { q: "Which payment methods are supported?", a: "Card payments and local payment options are being connected. The checkout will show every option available to your region." },
];

export default function PricingPage({ searchParams }: { searchParams: SearchParams }) {
  const interval = ANNUAL_BILLING_ENABLED && searchParams.billing === "year" ? "year" : "month";
  return (
    <>
      <PageIntro title="One account. Multiple businesses. One subscription." description={`Manage several businesses from one login and one plan. Contacts and monthly emails are shared across your account, not repeated for every business. ${TRIAL_PROMISE}`} />
      <Section className="pt-6 sm:pt-10">
        {ANNUAL_BILLING_ENABLED ? (
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3" role="group" aria-label="Billing interval">
            <ButtonLink href="/pricing" size="sm" variant={interval === "month" ? "primary" : "outline"}>Monthly</ButtonLink>
            <ButtonLink href="/pricing?billing=year" size="sm" variant={interval === "year" ? "primary" : "outline"}>Annual</ButtonLink>
            <span className="text-sm text-ink-soft">Annual pays for {ANNUAL_MONTHS_PAID} months and covers 12.</span>
          </div>
        ) : null}
        <PlanCards interval={interval} />
      </Section>
      <Section tone="tint">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-extrabold text-ink">Pricing questions</h2>
        </div>
        <FAQ items={faqs} />
      </Section>
      <CtaBand />
    </>
  );
}
