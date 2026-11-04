import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser, getCookieUserId, getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient, type Db } from "@/lib/supabase/admin";
import { go } from "@/lib/flash";
import { requireAdminDb as requireAdminSession } from "@/lib/auth/admin";
import { buildAccess, can, NO_PERMISSION, ROLES, type Access, type MemberRole, type Permission } from "@/lib/access";
import type { SessionUser } from "@/types";

export type Workspace = {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  status: "active" | "review" | "suspended";
  business_address: string | null;
  timezone: string;
  daily_send_limit: number;
  max_contacts: number;
  track_opens: boolean;
  billing_provider: string | null;
  billing_ref: string | null;
  // Company profile (migration 0010). Optional so the app still runs before that migration is applied.
  company_website?: string | null;
  company_email?: string | null;
  company_phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_region?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
  brand_color?: string | null;
  email_footer_text?: string | null;
  /** Set on a business added under someone's main business (migration 0016). Null on the main business. */
  account_workspace_id?: string | null;
};

/** An organization the signed-in person belongs to. */
export type Membership = { id: string; name: string; role: MemberRole };

export type Ctx = {
  user: SessionUser;
  workspace: Workspace | null;
  db: Db | null;
  /** What this person may do in `workspace`. Null only when there is no workspace. */
  access: Access | null;
  /** Every organization this person is an active member of (for the switcher). */
  memberships: Membership[];
};

/** What the read queries need: the organization, a database client and the person's access. */
export type ScopeCtx = { workspace: Workspace | null; db: Db | null; access: Access | null };

/** The organization a person last switched to. Always re-checked against their memberships. */
export const ACTIVE_WORKSPACE_COOKIE = "sv_ws";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A signed-in person with no workspace (the service key is missing): pages show their own empty states. */
async function bareContext(): Promise<Ctx | null> {
  const user = await getSessionUser();
  return user ? { user, workspace: null, db: null, access: null, memberships: [] } : null;
}

const isRole = (v: unknown): v is MemberRole => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/**
 * The signed-in user plus their organization and what they may do in it. `workspace` and `db` are
 * null only when the service role key is missing, so pages can show empty states instead of crashing.
 *
 * A person can belong to several organizations (their own, plus any they were invited to). The one
 * they last switched to is used; otherwise the one they joined most recently.
 */
export const getContext = cache(async (): Promise<Ctx | null> => {
  if (!isSupabaseConfigured) {
    const authUser = await getAuthUser();
    return authUser ? bareContext() : null;
  }

  let db: Db | null = null;
  try {
    db = createAdminClient();
  } catch {
    db = null;
  }

  // Verifying the user with the Auth server is the slowest step, so the queries below start at the same time,
  // keyed by the id in the session cookie (read locally). Their results are used ONLY if the Auth server then
  // confirms that very id; otherwise they are thrown away and loaded again for the verified id.
  const hintId = db ? await getCookieUserId() : null;
  const verifying = getAuthUser();

  const wanted = cookies().get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const wantedId = wanted && UUID_RE.test(wanted) ? wanted : null;

  // One round trip for everything: the profile, the memberships, and (for the workspace the person last used)
  // that workspace's role overrides and their departments.
  const loadAll = (userId: string) =>
    Promise.all([
      db!.from("profiles").select("full_name, role").eq("id", userId).maybeSingle(),
      db!.from("workspace_members").select("role, created_at, workspaces(*)").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }),
      wantedId ? db!.from("role_permissions").select("role, permissions").eq("workspace_id", wantedId) : Promise.resolve({ data: null }),
      wantedId ? db!.from("department_members").select("department_id").eq("workspace_id", wantedId).eq("user_id", userId) : Promise.resolve({ data: null }),
    ]);

  const guess = db && hintId ? loadAll(hintId) : null;
  guess?.catch(() => {}); // a failed guess is simply not used (and must not become an unhandled rejection)

  const authUser = await verifying;
  if (!authUser) return null;
  if (!db) return bareContext();

  const [{ data: profile }, { data }, { data: allOverrides }, { data: wantedDepts }] = await (guess && hintId === authUser.id ? guess.catch(() => loadAll(authUser.id)) : loadAll(authUser.id));

  const user: SessionUser = {
    id: authUser.id,
    email: authUser.email ?? "",
    fullName: (profile as { full_name?: string } | null)?.full_name ?? (authUser.user_metadata?.full_name as string | undefined) ?? "",
    role: (profile as { role?: string } | null)?.role === "admin" ? "admin" : "user",
  };

  type Row = { role: string; workspaces: Workspace | null };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.workspaces && isRole(r.role));
  const memberships: Membership[] = rows.map((r) => ({ id: r.workspaces!.id, name: r.workspaces!.name, role: r.role as MemberRole }));
  if (rows.length === 0) return { user, workspace: null, db, access: null, memberships };

  const chosen = rows.find((r) => r.workspaces!.id === wantedId) ?? rows[0];
  const workspace = chosen.workspaces as Workspace;
  const role = chosen.role as MemberRole;

  let override: unknown = null;
  let deptRows: { department_id: string }[];
  if (workspace.id === wantedId) {
    // The speculative queries were for this very workspace: nothing more to fetch.
    override = role === "owner" ? null : ((allOverrides ?? []) as { role: string; permissions: unknown }[]).find((o) => o.role === role)?.permissions ?? null;
    deptRows = (wantedDepts ?? []) as { department_id: string }[];
  } else {
    // No (or an outdated) workspace cookie: the person's default workspace needs one more round trip.
    const [{ data: o }, { data: d }] = await Promise.all([
      role === "owner" ? Promise.resolve({ data: null }) : db.from("role_permissions").select("permissions").eq("workspace_id", workspace.id).eq("role", role).maybeSingle(),
      db.from("department_members").select("department_id").eq("workspace_id", workspace.id).eq("user_id", user.id),
    ]);
    override = (o as { permissions?: unknown } | null)?.permissions ?? null;
    deptRows = (d ?? []) as { department_id: string }[];
  }
  const access = buildAccess(role, override, deptRows.map((d) => d.department_id));
  return { user, workspace, db, access, memberships };
});

/**
 * For server actions: guarantees a signed-in user with a real workspace, or redirects.
 * Pass the permission(s) the action needs. They are checked HERE, on the server, for every call, so
 * hiding a button in the UI is never what keeps someone out.
 */
export async function requireWorkspace(
  back = "/app",
  need?: Permission | readonly Permission[],
): Promise<{ user: SessionUser; workspace: Workspace; db: Db; access: Access }> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!ctx.workspace || !ctx.db || !ctx.access) {
    go(back, "err", "Your workspace isn’t available right now. Please try again, or contact support if this continues.");
  }
  if (need) {
    const list = Array.isArray(need) ? (need as readonly Permission[]) : [need as Permission];
    if (!list.every((p) => can(ctx.access, p))) go(back, "err", NO_PERMISSION);
  }
  return { user: ctx.user, workspace: ctx.workspace, db: ctx.db, access: ctx.access };
}

/**
 * For admin actions: guarantees a signed-in admin who passed 2FA, plus a service-role client.
 * Anyone else is redirected or receives a 404 before any work happens.
 */
export const requireAdminDb = requireAdminSession;