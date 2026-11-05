import { FAQ, Section, SectionHeading } from "@/components/marketing/section";
import { planLimits } from "@/config/plan-limits";
import { CtaBand, Deliverability, FeatureGrid, Hero, HowItWorks, MultiBusiness, Pillars, PricingTeaser, SocialProofStats, Testimonials } from "@/components/marketing/landing-sections";

const faqs = [
  { q: "Can I try Sendves before paying?", a: `Yes. Every plan starts with a ${planLimits.starter.trialDays}-day free trial of the plan you choose. If you don’t subscribe by the end, sending pauses and your data stays safe.` },
  { q: "Do I need technical knowledge to set up my domain?", a: "No. Sendves gives you the exact DNS records to add, checks them for you and explains in plain language what is still missing." },
  { q: "Can I upload a list I bought?", a: "No. Purchased or scraped lists are not allowed. Every import asks you to confirm that your contacts gave permission to hear from you." },
  { q: "What happens when someone unsubscribes or a message bounces?", a: "Sendves removes them from future sends automatically, and hard bounces and spam complaints are suppressed across the platform to protect everyone’s reputation." },
  { q: "Can I send for more than one business?", a: `Yes. Each business you add has its own logo, address, sending domains, contacts and unsubscribes, and you switch between them from the sidebar. One subscription covers ${planLimits.starter.businesses} business on Starter, ${planLimits.growth.businesses} on Growth and ${planLimits.pro.businesses} on Pro, and your contacts and monthly emails are shared across them.` },
  { q: "Does Sendves include automations or a CRM?", a: "Not yet. Sendves focuses on campaigns first. Automations are planned for a later release." },
];

export default function HomePage() {
  return (
    <>
      <Hero />
      <Pillars />
      <SocialProofStats />
      <FeatureGrid />
      <MultiBusiness />
      <HowItWorks />
      <Deliverability />
      <Testimonials />
      <PricingTeaser />
      <Section>
        <SectionHeading title="Questions, answered" />
        <div className="mt-12">
          <FAQ items={faqs} />
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
