import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/marketing/legal-page";
import { terms } from "@/content/legal";

export const metadata = pageMetadata({ title: terms.title, description: terms.intro, path: "/terms-of-service" });

export default function Page() {
  return <LegalPage doc={terms} />;
}
