import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/marketing/legal-page";
import { acceptableUse } from "@/content/legal";

export const metadata = pageMetadata({ title: acceptableUse.title, description: acceptableUse.intro, path: "/acceptable-use-policy" });

export default function Page() {
  return <LegalPage doc={acceptableUse} />;
}
