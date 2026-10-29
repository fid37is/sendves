/**
 * PLACEHOLDER pricing. The PRD leaves final pricing open until customer
 * interviews are done (Phase 0). Edit here and every pricing surface updates.
 */
export type Plan = {
  id: "free" | "starter" | "growth" | "scale";
  name: string;
  price: string;
  period: string;
  blurb: string;
  contacts: string;
  sends: string;
  features: string[];
  highlight?: boolean;
  cta: string;
};

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "Everything you need to send your first campaigns.",
    contacts: "500 contacts",
    sends: "2,000 emails / month",
    features: ["Email editor and templates", "Unsubscribe and bounce handling", "Basic reports", "Sendves badge in footer"],
    cta: "Start free",
  },
  {
    id: "starter",
    name: "Starter",
    price: "$12",
    period: "per month",
    blurb: "For growing lists that need scheduling and testing.",
    contacts: "5,000 contacts",
    sends: "50,000 emails / month",
    features: ["Everything in Free", "No Sendves badge", "Scheduling", "A/B subject tests", "Signup forms"],
    highlight: true,
    cta: "Start free",
  },
  {
    id: "growth",
    name: "Growth",
    price: "$29",
    period: "per month",
    blurb: "For teams that segment and collaborate.",
    contacts: "25,000 contacts",
    sends: "250,000 emails / month",
    features: ["Everything in Starter", "Segmentation", "Team seats", "Priority support"],
    cta: "Start free",
  },
  {
    id: "scale",
    name: "Scale",
    price: "Custom",
    period: "talk to us",
    blurb: "High volume with dedicated infrastructure.",
    contacts: "100,000+ contacts",
    sends: "Custom volume",
    features: ["Everything in Growth", "Dedicated IP option", "API access", "Service-level agreement"],
    cta: "Contact us",
  },
];
