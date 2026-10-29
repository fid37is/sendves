import { env } from "@/lib/env";

export type NavChild = { label: string; href: string; description: string };
export type NavItem = { label: string; href?: string; children?: NavChild[] };

export const siteConfig = {
  name: "Sendves",
  tagline: "Email that moves with you.",
  description:
    "Sendves is a focused email campaign platform. Verify your domain, import your contacts and send campaigns with unsubscribe, bounce and compliance handling built in.",
  url: env.siteUrl,
  supportEmail: env.supportEmail,
  /** Shows a “draft” notice on legal pages until a lawyer has reviewed them. */
  legalIsDraft: true,
  company: {
    legalName: "Sendves",
    address: "[Registered business address]",
  },
  nav: [
    {
      label: "Features",
      children: [
        { label: "Email editor", href: "/features#editor", description: "Design responsive campaigns with ready blocks." },
        { label: "Contacts and segments", href: "/features#contacts", description: "Import, organise and target your audience." },
        { label: "Deliverability", href: "/features#deliverability", description: "Guided SPF, DKIM and DMARC setup." },
        { label: "Reports", href: "/features#reports", description: "Clicks, bounces, unsubscribes and more." },
      ],
    },
    {
      label: "Resources",
      children: [
        { label: "Help center", href: "/help", description: "Guides for domains, imports and sending." },
        { label: "Contact us", href: "/contact", description: "Talk to the Sendves team." },
        { label: "Anti-spam policy", href: "/anti-spam-policy", description: "What we allow and how we enforce it." },
      ],
    },
    { label: "Pricing", href: "/pricing" },
    { label: "About", href: "/about" },
  ] satisfies NavItem[],
  footer: {
    product: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Help center", href: "/help" },
    ],
    company: [
      { label: "About Sendves", href: "/about" },
      { label: "Contact us", href: "/contact" },
    ],
    legal: [
      { label: "Terms of service", href: "/terms-of-service" },
      { label: "Privacy policy", href: "/privacy-policy" },
      { label: "Anti-spam policy", href: "/anti-spam-policy" },
      { label: "Acceptable use policy", href: "/acceptable-use-policy" },
      { label: "Data protection", href: "/data-protection" },
    ],
  },
};
