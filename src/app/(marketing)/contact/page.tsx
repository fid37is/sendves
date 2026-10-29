import type { Metadata } from "next";
import { PageIntro, Section } from "@/components/marketing/section";
import { siteConfig } from "@/config/site";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact us", description: "Get in touch with the Sendves team." };

export default function ContactPage() {
  return (
    <>
      <PageIntro title="Contact us" description="Questions about plans, setup or an abuse report? Send a message and we’ll get back to you." />
      <Section className="pt-6 sm:pt-10">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
          <ContactForm />
          <div className="space-y-6">
            <div className="rounded-3xl bg-mist-50 p-7">
              <h2 className="text-lg font-bold text-ink">Email</h2>
              <a className="mt-2 block font-semibold text-brand-800 hover:underline" href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
            </div>
            <div className="rounded-3xl bg-mist-50 p-7">
              <h2 className="text-lg font-bold text-ink">Report email abuse</h2>
              <p className="mt-2 text-sm text-ink-soft">Received an email you believe may have been sent using Sendves? Report it here, even if you don’t recognize the sending platform. Include the sender’s address and a copy of the message, if possible. Our team will review the report and investigate where appropriate.</p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
