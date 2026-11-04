import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/marketing/legal-page";
import { privacy } from "@/content/legal";

export const metadata = pageMetadata({ title: privacy.title, description: privacy.intro, path: "/privacy-policy" });

export default function Page() {
  return <LegalPage doc={privacy} />;
}
