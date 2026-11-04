import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/marketing/legal-page";
import { antiSpam } from "@/content/legal";

export const metadata = pageMetadata({ title: antiSpam.title, description: antiSpam.intro, path: "/anti-spam-policy" });

export default function Page() {
  return <LegalPage doc={antiSpam} />;
}
