import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/workspace";
import { can, type Permission } from "@/lib/access";
import { env } from "@/lib/env";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { getMailboxBadges } from "@/lib/inbox-queries";
import { INBOX_FOLDERS, FOLDERS_SHOWN } from "@/lib/inbox";
import { signOutAction } from "@/app/(auth)/actions";
import { switchWorkspaceAction } from "@/app/(dashboard)/app/team/actions";
import { FlashToast } from "@/components/ui/flash-toast";
import { AppShell, type ShellNavChild, type ShellNavItem } from "@/components/layout/app-shell";

/** `needs` hides a page from people whose role doesn't include it. The pages and actions check again on the server. */
const nav: (ShellNavItem & { needs?: Permission })[] = [
  { label: "Overview", href: "/app", icon: "home" },
  { label: "Emails", href: "/app/inbox", icon: "inbox", needs: "inbox.view" },
  { label: "Campaigns", href: "/app/campaigns", icon: "send", needs: "campaigns.view" },
  { label: "Reports", href: "/app/reports", icon: "chart", needs: "reports.view" },
  { label: "Contacts", href: "/app/contacts", icon: "users", needs: "contacts.view" },
  { label: "Templates", href: "/app/templates", icon: "template", needs: "templates.view" },
  { label: "Sending domains", href: "/app/domains", icon: "globe", needs: "domains.view" },
  { label: "Team", href: "/app/team", icon: "team", needs: "members.view" },
  { label: "Billing", href: "/app/billing", icon: "card", needs: "billing.manage" },
  { label: "Settings", href: "/app/settings", icon: "settings" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const user = ctx.user;
  // The customer app is for customers. A platform admin who lands here is sent to the admin console.
  if (user.role === "admin") redirect(env.adminUrl);
  // Without a workspace (service key missing) show everything, as before: pages show their own empty states.
  const badges = await getMailboxBadges(ctx, user.id);
  // The mail folders, in the order a mail program lists them. Drafts and Scheduled are only for people who can write emails.
  const canCompose = !ctx.access || (can(ctx.access, "inbox.reply") && can(ctx.access, "contacts.view"));
  const folders: ShellNavChild[] = INBOX_FOLDERS.filter((f) => !f.compose || canCompose).map((f) => ({
    key: f.key,
    label: f.label,
    href: f.key === "inbox" ? "/app/inbox" : `/app/inbox?folder=${f.key}`,
    icon: f.icon,
    badge: f.key === "inbox" || f.key === "unread" ? badges.unread : f.key === "drafts" ? badges.drafts : undefined,
  }));
  const items = nav
    .filter((i) => !i.needs || !ctx.access || can(ctx.access, i.needs))
    .map(({ needs: _needs, ...item }) => (item.href === "/app/inbox" ? { ...item, badge: badges.unread, children: folders, visibleChildren: FOLDERS_SHOWN } : item));
  const collapsed = cookies().get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <AppShell
      nav={items}
      area="app"
      user={user}
      signOut={signOutAction}
      defaultCollapsed={collapsed}
      organizations={ctx.memberships.map((m) => ({ id: m.id, name: m.name }))}
      activeOrganizationId={ctx.workspace?.id}
      switchOrganization={switchWorkspaceAction}
      addBusinessHref={ctx.memberships.some((m) => m.role === "owner") ? "/app/businesses/new" : undefined}
    >
      <FlashToast />
      {children}
    </AppShell>
  );
}