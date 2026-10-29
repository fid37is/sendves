"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { siteConfig } from "@/config/site";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const navLink =
  "relative rounded-full px-4 py-2 text-sm font-semibold text-ink transition-colors hover:text-brand-800 after:absolute after:inset-x-4 after:bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-brand-600 after:transition-transform after:duration-300 hover:after:scale-x-100";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-all duration-300",
        scrolled ? "border-mist bg-canvas/85 shadow-sm backdrop-blur-md" : "border-transparent bg-canvas",
      )}
    >
      <div className={cn("mx-auto flex max-w-page items-center justify-between px-5 transition-all duration-300 sm:px-8", scrolled ? "h-[72px]" : "h-20")}>
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {siteConfig.nav.map((item) =>
            "children" in item && item.children ? (
              <div key={item.label} className="group relative">
                <button type="button" className={cn(navLink, "inline-flex items-center gap-1")}>
                  {item.label}
                  <ChevronDown className="h-4 w-4 text-ink-muted transition-transform duration-300 group-focus-within:rotate-180 group-hover:rotate-180" aria-hidden="true" />
                </button>
                <div className="invisible absolute left-0 top-full w-80 translate-y-1 pt-2 opacity-0 transition duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  <div className="rounded-2xl border border-mist bg-white p-2 shadow-xl shadow-brand-900/10">
                    {item.children.map((child) => (
                      <Link key={child.href} href={child.href} className="group/item block rounded-xl px-4 py-3 transition-colors hover:bg-brand-50">
                        <span className="block text-sm font-semibold text-ink transition-transform duration-200 group-hover/item:translate-x-1">{child.label}</span>
                        <span className="mt-0.5 block text-xs text-ink-muted transition-transform duration-200 group-hover/item:translate-x-1">{child.description}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href ?? "/"}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn(navLink, pathname === item.href && "text-brand-800 after:scale-x-100")}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ButtonLink href="/login" variant="ghost">Log in</ButtonLink>
          <ButtonLink href="/register">Start free</ButtonLink>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <ButtonLink href="/register" size="sm">Start free</ButtonLink>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-mist-100"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="animate-fade-in absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="animate-slide-in-right absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col bg-canvas shadow-2xl">
            <div className="flex h-[72px] items-center justify-between border-b border-mist px-5">
              <Logo />
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-mist-100" aria-label="Close menu">
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-5 py-2" aria-label="Mobile">
              {siteConfig.nav.map((item) =>
                "children" in item && item.children ? (
                  <details key={item.label} className="group border-b border-mist">
                    <summary className="flex cursor-pointer items-center justify-between py-4 text-base font-bold text-ink">
                      {item.label}
                      <ChevronDown className="h-5 w-5 transition-transform duration-300 group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="pb-3">
                      {item.children.map((child) => (
                        <Link key={child.href} href={child.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-mist-50">
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </details>
                ) : (
                  <Link key={item.label} href={item.href ?? "/"} onClick={() => setOpen(false)} className="block border-b border-mist py-4 text-base font-bold text-ink">
                    {item.label}
                  </Link>
                ),
              )}
            </nav>
            <div className="space-y-3 border-t border-mist p-5">
              <ButtonLink href="/login" variant="outline" size="lg" className="w-full">Log in</ButtonLink>
              <ButtonLink href="/register" size="lg" className="w-full">Start with free plan</ButtonLink>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}