import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { acceptableUse } from "@/content/legal";

export const metadata: Metadata = { title: acceptableUse.title, description: acceptableUse.intro };

export default function Page() {
  return <LegalPage doc={acceptableUse} />;
}
