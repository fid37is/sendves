import { Star, BarChart3, FileText, Globe, Lock, Mail, Smartphone, Users, Zap, Check, ClipboardList } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { env } from "@/lib/env";
import { sampleStats, sampleTestimonials } from "@/lib/sample-content";
import { Section, SectionHeading } from "@/components/marketing/section";
import { LaunchPad } from "@/components/marketing/launch-pad";
import { StepsFlow } from "@/components/marketing/steps-flow";
import { DeliverabilityChecks } from "@/components/marketing/deliverability-checks";
import { SpotlightCard } from "@/components/marketing/spotlight-card";
import { PlanCards } from "@/components/marketing/plan-cards";
import { CountUp } from "@/components/motion/count-up";
import { SpeedLines } from "@/components/motion/speed-lines";
import { FlyingEnvelopes } from "@/components/motion/envelope";

const delay = (s: number): React.CSSProperties => ({ animationDelay: `${s}s` });

export function Hero() {
  return (
    <div className="bg-mist-50">
      <section className="slant-bottom relative overflow-hidden bg-brand-700 pb-28 pt-12 text-white sm:pb-36 sm:pt-20">
        <SpeedLines />
        <div className="relative mx-auto grid max-w-page items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <h1 className="animate-rise text-4xl font-extrabold leading-[1.08] sm:text-6xl" style={delay(0.05)}>Email campaigns that reach the inbox</h1>
            <p className="animate-rise mt-6 max-w-xl text-lg text-white" style={delay(0.4)}>
              Sendves is built for sending campaigns and nothing else. Verify your domain, import your contacts and send, with unsubscribe, bounce and complaint handling already in place.
            </p>
            <p className="animate-rise mt-8 text-sm font-bold text-white" style={delay(0.5)}>Including:</p>
            <ul className="mt-3 space-y-3">
              {[
                "Free plan with no credit card required",
                "Guided SPF, DKIM and DMARC setup",
                "One-click unsubscribe on every campaign",
              ].map((t, i) => (
                <li key={t} className="animate-rise flex items-start gap-3 text-white" style={delay(0.55 + i * 0.1)}>
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="animate-rise mt-9 flex flex-wrap items-center gap-4" style={delay(0.9)}>
              <ButtonLink href="/register" variant="light" size="lg" className="w-full sm:w-auto">Start with free plan</ButtonLink>
              <ButtonLink href="/pricing" variant="outlineLight" size="lg" className="w-full sm:w-auto">See pricing</ButtonLink>
            </div>
            <p className="animate-rise mt-4 text-sm text-white" style={delay(1)}>No credit card required. Upgrade whenever your list grows.</p>
            {env.sampleData ? (
              <p className="animate-rise mt-6 flex items-center gap-2 text-sm text-white" style={delay(1.1)}>
                <span className="flex text-spark" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-current" />)}
                </span>
                <span><strong className="text-white">4.8 out of 5</strong> from 1,200+ senders</span>
              </p>
            ) : null}
          </div>
          <div className="animate-rise" style={delay(0.3)}>
            <LaunchPad />
          </div>
        </div>
      </section>
    </div>
  );
}

const pillars = [
  { icon: Mail, title: "Email", text: "Campaigns, lists and templates in one focused workspace." },
  { icon: Zap, title: "Fast", text: "Queued, throttled sending that starts quickly and finishes cleanly." },
  { icon: Lock, title: "Secure", text: "Authenticated domains, suppression lists and abuse controls." },
  { icon: Smartphone, title: "Everywhere", text: "Responsive emails and a dashboard that works on your phone." },
];

export function Pillars() {
  return (
    <Section tone="tint" className="py-14 sm:py-16">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {pillars.map(({ icon: Icon, title, text }) => (
          <div key={title} className="group flex gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-800 shadow-sm transition-all duration-300 group-hover:-rotate-6 group-hover:scale-110 group-hover:bg-brand-700 group-hover:text-white">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-base font-bold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

const features = [
  { icon: Users, title: "Contacts and lists", text: "Import a CSV, map your fields, remove duplicates and keep every contact’s status in one place." },
  { icon: FileText, title: "Email editor", text: "Build responsive campaigns from ready blocks, preview on desktop and mobile, and send yourself a test." },
  { icon: Globe, title: "Domain authentication", text: "Add your domain, copy the DNS records and see in plain language what still needs fixing." },
  { icon: ClipboardList, title: "Scheduling and checks", text: "A pre-send checklist catches a missing unsubscribe link, an unverified domain or an empty subject." },
  { icon: BarChart3, title: "Reports that matter", text: "See delivery, clicks, bounces and unsubscribes per campaign, and which links people actually opened." },
  { icon: Lock, title: "Protected sender reputation", text: "New accounts start with sensible limits, and risky campaigns pause before they hurt your deliverability." },
];

export function FeatureGrid() {
  return (
    <Section>
      <SectionHeading
        title="Everything a campaign needs, nothing it doesn’t"
        description="No CRM, no landing page builder, no ad manager. Just the tools that get a good email to the right people."
      />
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, text }) => (
          <SpotlightCard key={title} className="rounded-3xl border border-mist bg-white p-7">
            <span className="spot-icon flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-800">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-lg font-bold text-ink">{title}</h3>
            <p className="mt-2 text-sm text-ink-soft">{text}</p>
          </SpotlightCard>
        ))}
      </div>
    </Section>
  );
}

const steps = [
  { title: "Verify your domain", text: "Add the DNS records Sendves gives you. We check them and tell you what to fix." },
  { title: "Import your contacts", text: "Upload a CSV, confirm you have permission to email them, and we clean the list." },
  { title: "Send your campaign", text: "Pick a template, pass the pre-send checks and send now or schedule for later." },
];

export function HowItWorks() {
  return (
    <Section tone="tint">
      <SectionHeading title="From sign-up to first send in under 30 minutes" description="Three steps, in this order." />
      <StepsFlow steps={steps} />
    </Section>
  );
}

const compliance = [
  "Unsubscribe link and one-click unsubscribe headers on every campaign",
  "Bounces and spam complaints suppressed automatically, platform-wide",
  "Your business address added to every footer",
  "Consent confirmed on every import",
  "Built around CAN-SPAM, GDPR, NDPA and the Gmail and Yahoo bulk sender rules",
];

export function Deliverability() {
  return (
    <Section tone="night">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-extrabold text-white sm:text-5xl">Deliverability is the product</h2>
          <p className="mt-5 text-lg text-white">
            A great editor means little if your emails land in spam. Sendves protects your sender reputation by default, so good senders stay trusted and bad ones are stopped early.
          </p>
          <ButtonLink href="/features#deliverability" variant="light" className="mt-8">How we protect delivery</ButtonLink>
        </div>
        <DeliverabilityChecks items={compliance} />
      </div>
    </Section>
  );
}

export function PricingTeaser() {
  return (
    <Section tone="tint">
      <SectionHeading title="Start free, grow when you’re ready" description="Pay for the audience you have. Move up a plan only when your list does." />
      <div className="mt-14">
        <PlanCards />
      </div>
    </Section>
  );
}

export function CtaBand() {
  return (
    <Section tone="brand">
      <SpeedLines />
      <FlyingEnvelopes />
      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold text-white sm:text-5xl">Send your first campaign today</h2>
        <p className="mt-4 text-lg text-white">Create a free account, verify your domain and reach your audience. Email that moves with you.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <ButtonLink href="/register" variant="light" size="lg">Start with free plan</ButtonLink>
          <ButtonLink href="/contact" variant="outlineLight" size="lg">Talk to us</ButtonLink>
        </div>
      </div>
    </Section>
  );
}

/** Fake social proof. Rendered only while NEXT_PUBLIC_SAMPLE_DATA=true. */
export function SocialProofStats() {
  if (!env.sampleData) return null;
  return (
    <Section className="py-12 sm:py-14">
      <dl className="grid gap-8 text-center sm:grid-cols-2 lg:grid-cols-4">
        {sampleStats.map((s) => (
          <div key={s.label}>
            <dd className="font-display text-4xl font-extrabold text-ink sm:text-5xl">
              <CountUp value={s.value} />
            </dd>
            <dt className="mt-2 text-sm text-ink-soft">{s.label}</dt>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function Testimonials() {
  if (!env.sampleData) return null;
  return (
    <Section tone="tint">
      <SectionHeading title="Senders who moved to Sendves" />
      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {sampleTestimonials.map((t) => (
          <figure key={t.name} className="flex flex-col rounded-3xl bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-900/10">
            <blockquote className="flex-1 text-ink-soft">{t.quote}</blockquote>
            <figcaption className="mt-6 border-t border-mist pt-4">
              <p className="text-sm font-bold text-ink">{t.name}</p>
              <p className="text-sm text-ink-muted">{t.role}</p>
            </figcaption>
          </figure>
        ))}
      </div>
      {process.env.NODE_ENV !== "production" ? (
        <p className="mt-6 text-center text-xs text-ink-muted">Sample testimonials. Turn off NEXT_PUBLIC_SAMPLE_DATA before launch.</p>
      ) : null}
    </Section>
  );
}