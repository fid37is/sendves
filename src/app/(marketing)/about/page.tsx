import type { Metadata } from "next";
import { PageIntro, Section } from "@/components/marketing/section";
import { CtaBand } from "@/components/marketing/landing-sections";

export const metadata: Metadata = { title: "About", description: "Why Sendves exists and what we believe about email." };

const principles = [
  { title: "Focus beats features", text: "Sendves sends campaigns. We say no to CRM, ad tools and everything else until campaigns are excellent." },
  { title: "Deliverability comes first", text: "Every product decision is checked against its effect on whether emails reach the inbox." },
  { title: "Compliance by default", text: "Unsubscribe links, consent records and suppression lists are built in, not optional extras." },
  { title: "Plain language", text: "Email authentication is confusing. We explain what to do and why in words anyone can follow." },
];

export default function AboutPage() {
  return (
    <>
      <PageIntro title="About Sendves" description="Sendves comes from “send” and “vessel”: a vessel that carries your message to the people waiting for it." />
      <Section className="pt-6 sm:pt-10">
        <div className="grid gap-5 sm:grid-cols-2">
          {principles.map((p) => (
            <div key={p.title} className="rounded-3xl border border-mist bg-white p-8">
              <h2 className="text-xl font-bold text-ink">{p.title}</h2>
              <p className="mt-3 text-ink-soft">{p.text}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section tone="tint">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-extrabold text-ink">Our story</h2>
          <p className="mt-5 text-lg text-ink-soft">
            Most email tools grow into everything platforms, and small senders pay for features they never use while struggling with the one thing that matters: getting delivered. Sendves starts from the opposite end. One job, done carefully, with the protection that good senders deserve.
          </p>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
