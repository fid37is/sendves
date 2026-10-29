import type { Metadata } from "next";
import { BarChart3, FileText, Globe, ShieldCheck, Upload, Users } from "lucide-react";
import { PageIntro, Section } from "@/components/marketing/section";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Help center", description: "Guides for setting up and sending with Sendves." };

const topics = [
  { icon: Globe, title: "Set up your sending domain", text: "Add SPF, DKIM and DMARC records and verify them." },
  { icon: Upload, title: "Import contacts", text: "Prepare a CSV, map fields and fix import errors." },
  { icon: FileText, title: "Build a campaign", text: "Use the editor, personalise and send a test." },
  { icon: Users, title: "Manage lists and segments", text: "Organise your audience with lists, tags and rules." },
  { icon: BarChart3, title: "Read your reports", text: "Understand clicks, bounces and unsubscribes." },
  { icon: ShieldCheck, title: "Keep your account healthy", text: "Limits, complaints and how to protect your reputation." },
];

export default function HelpPage() {
  return (
    <>
      <PageIntro title="Help center" description="Guides are being written. Until they’re published, our team is one message away." />
      <Section className="pt-6 sm:pt-10">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-3xl border border-mist bg-white p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-800"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <h2 className="mt-5 text-lg font-bold text-ink">{title}</h2>
              <p className="mt-2 text-sm text-ink-soft">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <ButtonLink href="/contact" variant="secondary">Ask a question</ButtonLink>
        </div>
      </Section>
    </>
  );
}
