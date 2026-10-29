import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { terms } from "@/content/legal";

export const metadata: Metadata = { title: terms.title, description: terms.intro };

export default function Page() {
  return <LegalPage doc={terms} />;
}
