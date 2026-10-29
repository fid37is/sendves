import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { dataProtection } from "@/content/legal";

export const metadata: Metadata = { title: dataProtection.title, description: dataProtection.intro };

export default function Page() {
  return <LegalPage doc={dataProtection} />;
}
