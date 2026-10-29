import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { antiSpam } from "@/content/legal";

export const metadata: Metadata = { title: antiSpam.title, description: antiSpam.intro };

export default function Page() {
  return <LegalPage doc={antiSpam} />;
}
