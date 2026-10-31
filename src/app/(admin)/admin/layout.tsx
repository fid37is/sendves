import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/admin";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { FlashToast } from "@/components/ui/flash-toast";
import { AppShell, type ShellNavItem } from "@/components/layout/app-shell";
import { adminSignOutAction } from "@/app/(admin-auth)/admin/auth-actions";

// Paths are host-relative: this console is served at admin.<domain>/..., never under /admin.
const nav: ShellNavItem[] = [
  { label: "Overview", href: "/", icon: "home" },
  { label: "Analytics", href: "/analytics", icon: "activity" },
  { label: "Workspaces", href: "/workspaces", icon: "building" },
  { label: "Users", href: "/users", icon: "users" },
  { label: "Campaign review", href: "/review", icon: "review" },
  { label: "Abuse reports", href: "/abuse", icon: "flag" },
  { label: "Suppression list", href: "/suppression", icon: "ban" },
  { label: "Audit log", href: "/audit", icon: "history" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin(); // signed in, role = admin, 2FA passed — or this never renders
  const collapsed = cookies().get(SIDEBAR_COOKIE)?.value === "1";
  return (
    <AppShell nav={nav} area="admin" user={user} signOut={adminSignOutAction} defaultCollapsed={collapsed}>
      <FlashToast />
      {children}
    </AppShell>
  );
}