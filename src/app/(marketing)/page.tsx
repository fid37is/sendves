import { FAQ, Section, SectionHeading } from "@/components/marketing/section";
import { JsonLd } from "@/components/seo/json-ld";
import { SendingVessel } from "@/components/marketing/sending-vessel";
import { siteConfig } from "@/config/site";
import { homeJsonLd, pageMetadata } from "@/lib/seo";
import { planLimits } from "@/config/plan-limits";
import { CtaBand, Deliverability, FeatureGrid, Hero, HowItWorks, MultiBusiness, Pillars, PricingTeaser, SocialProofStats, Testimonials } from "@/components/marketing/landing-sections";

const faqs = [
  { q: "Is Sendves really free to start?", a: "Yes. The free plan covers a small list and a monthly send allowance, with no credit card. You only upgrade when you need more contacts or more features." },
  { q: "Do I need technical knowledge to set up my domain?", a: "No. Sendves gives you the exact DNS records to add, checks them for you and explains in plain language what is still missing." },
  { q: "Can I upload a list I bought?", a: "No. Purchased or scraped lists are not allowed. Every import asks you to confirm that your contacts gave permission to hear from you." },
  { q: "What happens when someone unsubscribes or a message bounces?", a: "Sendves removes them from future sends automatically, and hard bounces and spam complaints are suppressed across the platform to protect everyone’s reputation." },
  { q: "Can I send for more than one business?", a: `Yes. Each business you add has its own logo, address, sending domains, contacts and unsubscribes, and you switch between them from the sidebar. Free includes ${planLimits.free.businesses} business, Starter ${planLimits.starter.businesses}, Growth ${planLimits.growth.businesses} and Scale ${planLimits.scale.businesses}.` },
  { q: "Does Sendves include automations or a CRM?", a: "Not yet. Sendves focuses on campaigns first. Automations are planned for a later release." },
];

export const metadata = pageMetadata({ description: siteConfig.description, path: "/" });

export default function HomePage() {
  return (
    <>
      <JsonLd data={homeJsonLd()} />
      <Hero />
      <Pillars />
      <SocialProofStats />
      <FeatureGrid />
      <MultiBusiness />
      <HowItWorks />
      <SendingVessel />
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
