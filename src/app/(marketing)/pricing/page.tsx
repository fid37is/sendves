import type { Metadata } from "next";
import { FAQ, PageIntro, Section } from "@/components/marketing/section";
import { PlanCards } from "@/components/marketing/plan-cards";
import { CtaBand } from "@/components/marketing/landing-sections";

export const metadata: Metadata = { title: "Pricing", description: "Simple Sendves plans based on the size of your audience." };

const faqs = [
  { q: "How is pricing calculated?", a: "Plans are based on the number of contacts you store, with a fair monthly send allowance for each plan." },
  { q: "Can I change plans later?", a: "Yes. Upgrade, downgrade or cancel from your dashboard at any time." },
  { q: "Which payment methods are supported?", a: "Card payments and local payment options are being connected. The checkout will show every option available to your region." },
  { q: "Why does the free plan have a Sendves badge?", a: "The badge helps more people find Sendves and keeps the free plan sustainable. Paid plans remove it." },
];

export default function PricingPage() {
  return (
    <>
      <PageIntro title="Pricing that follows your audience" description="Start free. Pay only when your list outgrows the free plan." />
      <Section className="pt-6 sm:pt-10">
        <PlanCards />
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
