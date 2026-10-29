import type { Metadata } from "next";
import { Check } from "lucide-react";
import { PageIntro, Section } from "@/components/marketing/section";
import { CtaBand } from "@/components/marketing/landing-sections";

export const metadata: Metadata = { title: "Features", description: "Everything Sendves includes for sending email campaigns." };

const groups = [
  {
    id: "editor",
    title: "Email editor",
    text: "Design campaigns from ready blocks without writing code, or paste your own HTML.",
    points: ["Text, image, button, divider, columns, social and footer blocks", "Responsive output with desktop and mobile preview", "Personalisation tokens with fallback values", "Plain-text version generated automatically", "Send a test email before you launch"],
  },
  {
    id: "contacts",
    title: "Contacts and segments",
    text: "Keep your audience tidy and send to the right people.",
    points: ["CSV import with field mapping and duplicate removal", "Lists, tags and custom fields", "Clear statuses: subscribed, unsubscribed, bounced, complained", "Export your contacts any time", "Rule-based segments on paid plans"],
  },
  {
    id: "deliverability",
    title: "Deliverability",
    text: "Authentication and sender reputation are handled for you.",
    points: ["Guided SPF, DKIM and DMARC records with live verification", "One-click unsubscribe headers added to every campaign", "Throttled, queued sending with automatic retries", "Platform-wide suppression of hard bounces and complaints", "New-account limits that rise as your results stay healthy"],
  },
  {
    id: "reports",
    title: "Reports",
    text: "Know what happened after you pressed send.",
    points: ["Sent, delivered, bounced, clicked and unsubscribed per campaign", "Click report per link", "List growth over time", "Engagement by mailbox provider", "Export reports to CSV"],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageIntro title="Built to send campaigns well" description="Sendves covers the full path from contact list to inbox, with compliance and deliverability checks along the way." />
      <Section className="pt-6 sm:pt-10">
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.id} id={g.id} className="scroll-mt-28 grid gap-8 rounded-3xl border border-mist bg-white p-7 sm:p-10 lg:grid-cols-[1fr_1.2fr]">
              <div>
                <h2 className="text-2xl font-extrabold text-ink">{g.title}</h2>
                <p className="mt-3 text-ink-soft">{g.text}</p>
              </div>
              <ul className="space-y-3">
                {g.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-ink-soft">
                    <Check className="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
