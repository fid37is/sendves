import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { signOutAction } from "@/app/(auth)/actions";
import { FlashToast } from "@/components/ui/flash-toast";
import { AppShell, type ShellNavItem } from "@/components/layout/app-shell";

const nav: ShellNavItem[] = [
  { label: "Overview", href: "/app", icon: "home" },
  { label: "Campaigns", href: "/app/campaigns", icon: "send" },
  { label: "Reports", href: "/app/reports", icon: "chart" },
  { label: "Contacts", href: "/app/contacts", icon: "users" },
  { label: "Templates", href: "/app/templates", icon: "template" },
  { label: "Sending domains", href: "/app/domains", icon: "globe" },
  { label: "Billing", href: "/app/billing", icon: "card" },
  { label: "Settings", href: "/app/settings", icon: "settings" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const collapsed = cookies().get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <AppShell
      nav={nav}
      area="app"
      user={user}
      signOut={signOutAction}
      defaultCollapsed={collapsed}
      // The admin console lives on its own host. Only admins ever see this link.
      switchLink={user.role === "admin" ? { label: "Open admin console", href: env.adminUrl } : undefined}
    >
      <FlashToast />
      {children}
    </AppShell>
  );
}