import { SiteFooter } from "@/components/marketing/footer";
import { SiteHeader } from "@/components/marketing/header";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
