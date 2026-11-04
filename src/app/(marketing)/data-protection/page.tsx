import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/marketing/legal-page";
import { dataProtection } from "@/content/legal";

export const metadata = pageMetadata({ title: dataProtection.title, description: dataProtection.intro, path: "/data-protection" });

export default function Page() {
  return <LegalPage doc={dataProtection} />;
}
