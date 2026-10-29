import type { Block } from "@/lib/email/blocks";

export type StarterTemplate = { id: string; name: string; description: string; subject?: string; previewText?: string; blocks: Block[] };

let n = 0;
const id = () => `b${++n}`;

export const starterTemplates: StarterTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Start from an empty email.",
    blocks: [],
  },
  {
    id: "newsletter",
    name: "Simple newsletter",
    description: "One column with a headline, story and button.",
    subject: "What’s new this month",
    previewText: "A quick update on what we’ve been working on.",
    blocks: [
      { id: id(), type: "heading", text: "What’s new this month" },
      { id: id(), type: "text", text: "Hi {{first_name|there}},\n\nHere’s a quick update on what we’ve been working on and what’s coming next." },
      { id: id(), type: "button", label: "Read the full story", url: "https://example.com" },
      { id: id(), type: "divider" },
      { id: id(), type: "text", text: "Thanks for being part of this." },
    ],
  },
  {
    id: "announcement",
    name: "Product announcement",
    description: "Headline, three highlights and a call to action.",
    subject: "Introducing something new",
    previewText: "We’ve just launched something we think you’ll like.",
    blocks: [
      { id: id(), type: "heading", text: "Introducing something new" },
      { id: id(), type: "text", text: "Hi {{first_name|there}}, we’ve just launched something we think you’ll like." },
      { id: id(), type: "text", text: "• Faster: do more in less time\n• Simpler: fewer steps to get started\n• Better: built from your feedback" },
      { id: id(), type: "button", label: "See what’s new", url: "https://example.com" },
    ],
  },
  {
    id: "event",
    name: "Event invitation",
    description: "Date, place and a clear RSVP button.",
    subject: "You’re invited",
    previewText: "Save the date and RSVP.",
    blocks: [
      { id: id(), type: "heading", text: "You’re invited" },
      { id: id(), type: "text", text: "Hi {{first_name|there}},\n\nJoin us for an evening of conversation and connection." },
      { id: id(), type: "text", text: "When: Saturday, 7:00 PM\nWhere: Add your venue here" },
      { id: id(), type: "button", label: "RSVP now", url: "https://example.com" },
    ],
  },
];
