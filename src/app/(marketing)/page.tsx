import { FAQ, Section, SectionHeading } from "@/components/marketing/section";
import { CtaBand, Deliverability, FeatureGrid, Hero, HowItWorks, Pillars, PricingTeaser, SocialProofStats, Testimonials } from "@/components/marketing/landing-sections";

const faqs = [
  { q: "Is Sendves really free to start?", a: "Yes. The free plan covers a small list and a monthly send allowance, with no credit card. You only upgrade when you need more contacts or more features." },
  { q: "Do I need technical knowledge to set up my domain?", a: "No. Sendves gives you the exact DNS records to add, checks them for you and explains in plain language what is still missing." },
  { q: "Can I upload a list I bought?", a: "No. Purchased or scraped lists are not allowed. Every import asks you to confirm that your contacts gave permission to hear from you." },
  { q: "What happens when someone unsubscribes or a message bounces?", a: "Sendves removes them from future sends automatically, and hard bounces and spam complaints are suppressed across the platform to protect everyone’s reputation." },
  { q: "Does Sendves include automations or a CRM?", a: "Not yet. Sendves focuses on campaigns first. Automations are planned for a later release." },
];

export default function HomePage() {
  return (
    <>
      <Hero />
      <Pillars />
      <SocialProofStats />
      <FeatureGrid />
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
