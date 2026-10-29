import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";

function Column({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-ink-soft hover:text-brand-800">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-mist bg-canvas">
      <div className="mx-auto max-w-page px-5 py-14 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-ink-soft">{siteConfig.tagline} Focused email campaigns with deliverability and compliance built in.</p>
            <ButtonLink href="/register" className="mt-6">Start with free plan</ButtonLink>
          </div>
          <Column title="Product" links={siteConfig.footer.product} />
          <Column title="Company" links={siteConfig.footer.company} />
          <Column title="Legal" links={siteConfig.footer.legal} />
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-mist pt-6 text-sm text-ink-muted">
          <p>© {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
          <p>Questions? <a className="font-semibold text-brand-800 hover:underline" href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a></p>
        </div>
      </div>
    </footer>
  );
}
