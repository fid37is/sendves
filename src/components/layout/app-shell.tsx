"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Activity, BarChart3, Ban, Building2, ChevronDown, ClipboardCheck, Clock, CreditCard, FileText, Flag, Globe, History, Home, LayoutTemplate, Layers, LogOut, Mail, MailOpen, Menu,
  AtSign, Inbox, PanelLeftClose, PanelLeftOpen, Send, Settings, ShieldAlert, ShieldCheck, Trash2, UserCog, Users, UsersRound, X, type LucideIcon,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/ui/logo";
import { BackContext } from "@/components/layout/back-button";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { cn, initials } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  home: Home, send: Send, users: Users, template: LayoutTemplate, globe: Globe, chart: BarChart3, card: CreditCard,
  settings: Settings, shield: ShieldCheck, flag: Flag, ban: Ban, building: Building2, review: ClipboardCheck,
  activity: Activity, history: History, team: UsersRound, at: AtSign, account: UserCog, inbox: Inbox,
  mail: Mail, mailopen: MailOpen, file: FileText, clock: Clock, layers: Layers, junk: ShieldAlert, trash: Trash2,
};

/** One entry inside a collapsible group (a mail folder). `key` is what the page's `folder` parameter holds. */
export type ShellNavChild = { key: string; label: string; href: string; icon: keyof typeof icons; badge?: number };

/**
 * `badge` is a count shown beside the label (unread conversations). Zero or missing shows nothing.
 * With `children` the item is a collapsible group: only the first `visibleChildren` entries show until "More" is pressed.
 */
export type ShellNavItem = { label: string; href: string; icon: keyof typeof icons; badge?: number; children?: ShellNavChild[]; visibleChildren?: number };

/**
 * Opens and closes a block of rows with a smooth height and fade, instead of snapping. The height animates from 0 to the content's
 * own height (a 0fr to 1fr grid row), so it needs no measuring. While closed the rows are inert: hidden from keyboard and screen readers.
 */
function Collapse({ open, id, children }: { open: boolean; id?: string; children: React.ReactNode }) {
  return (
    <div
      id={id}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
      {...(open ? {} : ({ inert: "", "aria-hidden": true } as object))}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

const ITEM_PITCH = 44; // h-10 item + 4px gap

/**
 * The menu items, with the sliding highlight. A group (the mail folders) opens and closes in place, so the
 * highlight follows the real position of the current row instead of a fixed step.
 */
function SidebarNav({
  nav, compact, admin, activeIndex, activeChild, onNavigate,
}: {
  nav: ShellNavItem[];
  compact: boolean;
  admin: boolean;
  activeIndex: number;
  activeChild: string | null;
  onNavigate: (href: string, child?: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(nav.map((item, i) => [item.href, Boolean(item.children?.length) && i === activeIndex])));
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);
  const rows = useRef(new Map<string, HTMLElement>());
  const ref = (key: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(key, el);
    else rows.current.delete(key);
  };

  const current = nav[activeIndex];
  const grouped = Boolean(current?.children?.length) && !compact;
  const childIndex = grouped ? current.children!.findIndex((c) => c.key === activeChild) : -1;
  const shown = current?.visibleChildren ?? 3;

  // Arriving in a group opens it, and a current entry that is folded away under "More" opens that too.
  useEffect(() => {
    if (grouped) setOpen((o) => (o[current.href] ? o : { ...o, [current.href]: true }));
  }, [grouped, current?.href]);
  useEffect(() => {
    if (grouped && childIndex >= shown) setMore((m) => (m[current.href] ? m : { ...m, [current.href]: true }));
  }, [grouped, childIndex, shown, current?.href]);

  const childVisible = grouped && open[current.href] && childIndex >= 0 && (childIndex < shown || more[current.href]);
  const targetKey = activeIndex < 0 ? null : childVisible ? `${current.href}#${activeChild}` : current.href;
  const layoutSig = JSON.stringify([open, more]);

  // The highlight is measured now, and again on every frame while a group opens or closes, so it follows the rows as they glide.
  useLayoutEffect(() => {
    const measure = () => {
      const el = targetKey ? rows.current.get(targetKey) : null;
      setPill((prev) => {
        if (!el) return prev === null ? prev : null;
        return prev && prev.top === el.offsetTop && prev.height === el.offsetHeight ? prev : { top: el.offsetTop, height: el.offsetHeight };
      });
    };
    measure();
    const started = performance.now();
    let frame = requestAnimationFrame(function tick() {
      measure();
      if (performance.now() - started < 450) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [targetKey, layoutSig, compact, nav]);
  // The highlight only glides once it has a place to glide from, so it never swoops in on first load.
  useEffect(() => {
    if (!pill) return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [pill]);

  const linkClass = (active: boolean, child = false) =>
    cn(
      "group relative flex items-center rounded-xl text-sm font-semibold transition-colors",
      child ? "h-9 gap-3 pl-[2.6rem] pr-3" : cn("h-10", compact ? "justify-center px-0" : "gap-3 px-3"),
      admin
        ? active ? "text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
        : active ? "text-brand-800" : "text-ink-soft hover:bg-mist-100 hover:text-ink",
    );
  const badgeClass = "ml-auto rounded-full bg-brand-700 px-2 py-0.5 text-xs font-bold leading-none text-white";

  return (
    <div className="relative space-y-1">
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 rounded-xl",
          ready && "transition-all duration-300 ease-out",
          admin ? "bg-white/10" : "bg-brand-50",
          activeIndex < 0 && "opacity-0",
        )}
        style={{ height: pill?.height ?? 40, transform: `translateY(${pill?.top ?? Math.max(activeIndex, 0) * ITEM_PITCH}px)` }}
      >
        <span className={cn("absolute inset-y-2 left-0 w-1 rounded-full", admin ? "bg-accent-400" : "bg-brand-700")} />
      </span>

      {nav.map((item, i) => {
        const Icon = icons[item.icon];
        const active = i === activeIndex;

        if (item.children?.length && !compact) {
          const isOpen = Boolean(open[item.href]);
          const all = item.children;
          const limit = item.visibleChildren ?? 3;
          const showAll = Boolean(more[item.href]);
          const menuId = `menu-${item.icon}-${i}`;
          const renderChild = (child: ShellNavChild) => {
            const ChildIcon = icons[child.icon];
            const childActive = active && child.key === activeChild;
            return (
              <Link
                key={child.key}
                href={child.href}
                ref={ref(`${item.href}#${child.key}`)}
                onClick={() => onNavigate(child.href, child.key)}
                aria-current={childActive ? "page" : undefined}
                className={linkClass(childActive, true)}
              >
                <ChildIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{child.label}</span>
                {child.badge ? <span className={badgeClass} aria-label={`${child.badge} ${child.key === "drafts" ? "drafts" : "unread"}`}>{child.badge > 99 ? "99+" : child.badge}</span> : null}
              </Link>
            );
          };
          return (
            <div key={item.href}>
              <button
                type="button"
                ref={ref(item.href)}
                aria-expanded={isOpen}
                aria-controls={menuId}
                onClick={() => setOpen((o) => ({ ...o, [item.href]: !isOpen }))}
                className={cn(linkClass(active), "w-full")}
              >
                <Icon className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
                {!isOpen && item.badge ? <span className={badgeClass} aria-label={`${item.badge} unread`}>{item.badge > 99 ? "99+" : item.badge}</span> : null}
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen ? "rotate-180" : "", isOpen || !item.badge ? "ml-auto" : "")} aria-hidden="true" />
              </button>
              <Collapse open={isOpen} id={menuId}>
                <div className="mt-1">
                  <div className="space-y-1">{all.slice(0, limit).map(renderChild)}</div>
                  {all.length > limit ? (
                    <>
                      {/* The folders folded under "More" glide open and shut. */}
                      <Collapse open={showAll}>
                        <div className="space-y-1 pt-1">{all.slice(limit).map(renderChild)}</div>
                      </Collapse>
                      <button
                        type="button"
                        onClick={() => setMore((m) => ({ ...m, [item.href]: !showAll }))}
                        aria-expanded={showAll}
                        className={cn("mt-1 flex h-8 w-full items-center gap-3 rounded-xl pl-[2.6rem] pr-3 text-xs font-semibold transition-colors", admin ? "text-white/60 hover:text-white" : "text-ink-muted hover:text-ink")}
                      >
                        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-300", showAll && "rotate-180")} aria-hidden="true" />
                        {showAll ? "Less" : "More"}
                      </button>
                    </>
                  ) : null}
                </div>
              </Collapse>
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            ref={ref(item.href)}
            onClick={() => onNavigate(item.href)}
            aria-current={active ? "page" : undefined}
            aria-label={compact ? item.label : undefined}
            title={compact ? item.label : undefined}
            className={linkClass(active)}
          >
            <span className="relative flex shrink-0">
              <Icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
              {compact && item.badge ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand-700 ring-2 ring-white" aria-hidden="true" /> : null}
            </span>
            {compact ? null : <span className="truncate">{item.label}</span>}
            {!compact && item.badge ? <span className={badgeClass} aria-label={`${item.badge} unread`}>{item.badge > 99 ? "99+" : item.badge}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}

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
  const [pendingChild, setPendingChild] = useState<string | null>(null);
  const search = useSearchParams();
  const searchKey = search?.toString() ?? "";
  const admin = area === "admin";

  // The admin console is served from its own host, so its public paths have no /admin prefix.
  const pathname = admin ? rawPath.replace(/^\/admin(?=\/|$)/, "") || "/" : rawPath;
  const root = nav[0]?.href;
  const target = pendingHref ?? pathname;
  const activeIndex = nav.findIndex((item) => (item.href === root ? target === root : target.startsWith(item.href)));
  // Inside a group (the mail folders) the folder in the address says which entry is current.
  const activeChild = (() => {
    const item = nav[activeIndex];
    if (!item?.children?.length) return null;
    if (pendingChild) return pendingChild;
    return pendingHref ? null : search?.get("folder") ?? item.children[0].key;
  })();

  useEffect(() => { setPendingHref(null); setPendingChild(null); }, [pathname, searchKey]);

  // Back link: a page inside a section (a campaign, the import page) goes back to that section's
  // list. A section's own page (Campaigns, Contacts…) and the home page have none: they are reached
  // from the menu, and "back" from them would only be the Overview.
  const back = (() => {
    if (!root || pathname === root) return null;
    let section: ShellNavItem | undefined;
    for (const item of nav) {
      if (item.href === root) continue;
      const inside = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (inside && (!section || item.href.length > section.href.length)) section = item;
    }
    if (section) return pathname !== section.href ? { href: section.href, label: section.label } : null;
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
          <SidebarNav
            nav={nav}
            compact={compact}
            admin={admin}
            activeIndex={activeIndex}
            activeChild={activeChild}
            onNavigate={(href, child) => {
              setOpen(false);
              setPendingHref(href);
              setPendingChild(child ?? null);
            }}
          />
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

      <main className={cn("min-w-0 overflow-x-clip transition-[padding] duration-300 ease-out", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
        <div key={pathname} className="animate-rise-fast mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
          <BackContext.Provider value={back}>{children}</BackContext.Provider>
        </div>
      </main>
    </div>
  );
}