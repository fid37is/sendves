"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, BarChart3, Ban, Building2, ClipboardCheck, CreditCard, Flag, Globe, History, Home, LayoutTemplate, LogOut, Menu,
  AtSign, PanelLeftClose, PanelLeftOpen, Send, Settings, ShieldCheck, Users, UsersRound, X, type LucideIcon,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/ui/logo";
import { BackContext } from "@/components/layout/back-button";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { cn, initials } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  home: Home, send: Send, users: Users, template: LayoutTemplate, globe: Globe, chart: BarChart3, card: CreditCard,
  settings: Settings, shield: ShieldCheck, flag: Flag, ban: Ban, building: Building2, review: ClipboardCheck,
  activity: Activity, history: History, team: UsersRound, at: AtSign,
};

export type ShellNavItem = { label: string; href: string; icon: keyof typeof icons };

const ITEM_PITCH = 44; // h-10 item + 4px gap

export function AppShell({
  nav,
  area,
  user,
  signOut,
  children,
  switchLink,
  defaultCollapsed = false,
  organizations,
  activeOrganizationId,
  switchOrganization,
}: {
  nav: ShellNavItem[];
  area: "app" | "admin";
  user: { fullName: string; email: string };
  signOut: () => Promise<void>;
  children: React.ReactNode;
  switchLink?: { label: string; href: string };
  /** Read from a cookie on the server, so the sidebar renders in the right state with no flash. */
  defaultCollapsed?: boolean;
  /** Shown as a switcher when the person belongs to more than one organization. */
  organizations?: { id: string; name: string }[];
  activeOrganizationId?: string;
  switchOrganization?: (formData: FormData) => Promise<void>;
}) {
  const rawPath = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  // The highlight jumps to the clicked item at once, rather than waiting for the next page to arrive.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const admin = area === "admin";

  // The admin console is served from its own host, so its public paths have no /admin prefix.
  const pathname = admin ? rawPath.replace(/^\/admin(?=\/|$)/, "") || "/" : rawPath;
  const root = nav[0]?.href;
  const target = pendingHref ?? pathname;
  const activeIndex = nav.findIndex((item) => (item.href === root ? target === root : target.startsWith(item.href)));

  useEffect(() => setPendingHref(null), [pathname]);

  // Back link: a page inside a section (a campaign, the import page) goes back to that section's
  // list; a section's own page goes back to the home page; the home page has none.
  const back = (() => {
    if (!root || pathname === root) return null;
    let section: ShellNavItem | undefined;
    for (const item of nav) {
      if (item.href === root) continue;
      const inside = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (inside && (!section || item.href.length > section.href.length)) section = item;
    }
    if (section && pathname !== section.href) return { href: section.href, label: section.label };
    return { href: root, label: nav[0].label };
  })();

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  // "[" toggles the sidebar, like most admin tools.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      toggle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function renderSidebar(compact: boolean) {
    return (
      <div className={cn("flex h-full flex-col", admin ? "bg-night text-white" : "bg-white")}>
        <div className={cn("flex h-[72px] items-center", compact ? "justify-center px-2" : "justify-between px-5")}>
          {compact ? (
            <Link href={root} aria-label="Home" className="logo">
              <LogoMark light={admin} className="h-9 sm:h-9 lg:h-9" />
            </Link>
          ) : (
            <Logo href={root} light={admin} className="[&_img]:lg:h-10 [&_span]:lg:text-2xl" />
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn("rounded-full p-2 lg:hidden", admin ? "hover:bg-white/10" : "hover:bg-mist-100")}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {admin && !compact ? (
          <p className="mx-5 mb-2 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Admin console
          </p>
        ) : null}

        <nav className={cn("flex-1 px-3 py-2", compact ? "overflow-visible" : "overflow-y-auto")} aria-label={admin ? "Admin" : "Dashboard"}>
          <div className="relative space-y-1">
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-0 top-0 h-10 rounded-xl transition-all duration-300 ease-out",
                admin ? "bg-white/10" : "bg-brand-50",
                activeIndex < 0 && "opacity-0",
              )}
              style={{ transform: `translateY(${Math.max(activeIndex, 0) * ITEM_PITCH}px)` }}
            >
              <span className={cn("absolute inset-y-2 left-0 w-1 rounded-full", admin ? "bg-accent-400" : "bg-brand-700")} />
            </span>
            {nav.map((item, i) => {
              const Icon = icons[item.icon];
              const active = i === activeIndex;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setOpen(false);
                    setPendingHref(item.href);
                  }}
                  aria-current={active ? "page" : undefined}
                  aria-label={compact ? item.label : undefined}
                  title={compact ? item.label : undefined}
                  className={cn(
                    "group relative flex h-10 items-center rounded-xl text-sm font-semibold transition-colors",
                    compact ? "justify-center px-0" : "gap-3 px-3",
                    admin
                      ? active ? "text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                      : active ? "text-brand-800" : "text-ink-soft hover:bg-mist-100 hover:text-ink",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                  {compact ? null : <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className={cn("border-t p-4", admin ? "border-white/10" : "border-mist", compact && "px-2")}>
          {organizations && organizations.length > 1 && switchOrganization && !compact ? (
            <form action={switchOrganization} className="mb-3">
              <label htmlFor={`org-${compact ? "c" : "f"}`} className={cn("mb-1 block px-1 text-xs font-semibold", admin ? "text-white/60" : "text-ink-muted")}>Organization</label>
              <select
                id={`org-${compact ? "c" : "f"}`}
                name="workspaceId"
                defaultValue={activeOrganizationId}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="h-10 w-full rounded-xl border border-mist bg-white px-3 text-sm font-semibold text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </form>
          ) : null}
          {switchLink && !compact ? (
            <a
              href={switchLink.href}
              className={cn("mb-3 block rounded-xl px-3 py-2 text-sm font-semibold", admin ? "text-accent-300 hover:bg-white/10" : "text-brand-800 hover:bg-brand-50")}
            >
              {switchLink.label}
            </a>
          ) : null}
          <div className={cn("flex items-center gap-3", compact && "flex-col")}>
            <span
              title={compact ? user.fullName || user.email : undefined}
              className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", admin ? "bg-accent-400 text-night" : "bg-brand-700 text-white")}
            >
              {initials(user.fullName || user.email)}
            </span>
            {compact ? null : (
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-semibold", admin ? "text-white" : "text-ink")}>{user.fullName || "Your account"}</p>
                <p className={cn("truncate text-xs", admin ? "text-white/60" : "text-ink-muted")}>{user.email}</p>
              </div>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className={cn("rounded-full p-2", admin ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-ink-muted hover:bg-mist-100 hover:text-ink")}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mist-50">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r transition-[width] duration-300 ease-out lg:block",
          admin ? "border-night-800" : "border-mist",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        {renderSidebar(collapsed)}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar  [" : "Collapse sidebar  ["}
          className="absolute -right-3.5 top-[88px] z-40 flex h-7 w-7 items-center justify-center rounded-full border border-accent-200 bg-white text-night shadow-sm transition-colors hover:bg-accent-100"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
        </button>
      </aside>

      <div className={cn("sticky top-0 z-20 flex h-16 items-center justify-between border-b px-4 lg:hidden", admin ? "border-night-800 bg-night" : "border-mist bg-white")}>
        <Logo href={root} light={admin} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn("rounded-full p-2", admin ? "text-white hover:bg-white/10" : "hover:bg-mist-100")}
          aria-label="Open menu"
          aria-expanded={open}
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="animate-fade-in absolute inset-0 bg-night/50" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="animate-slide-in-left absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl">{renderSidebar(false)}</div>
        </div>
      ) : null}

      <main className={cn("transition-[padding] duration-300 ease-out", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
        <div key={pathname} className="animate-rise-fast mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
          <BackContext.Provider value={back}>{children}</BackContext.Provider>
        </div>
      </main>
    </div>
  );
}