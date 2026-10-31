import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser, getSessionUser } from "@/lib/auth/session";
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

const isRole = (v: unknown): v is MemberRole => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/**
 * The signed-in user plus their organization and what they may do in it. `workspace` and `db` are
 * null only when the service role key is missing, so pages can show empty states instead of crashing.
 *
 * A person can belong to several organizations (their own, plus any they were invited to). The one
 * they last switched to is used; otherwise the one they joined most recently.
 */
export const getContext = cache(async (): Promise<Ctx | null> => {
  const authUser = await getAuthUser(); // verified once per request, shared with the layout
  if (!authUser) return null;
  const bare = async (): Promise<Ctx | null> => {
    const user = await getSessionUser();
    return user ? { user, workspace: null, db: null, access: null, memberships: [] } : null;
  };
  if (!isSupabaseConfigured) return bare();

  let db: Db;
  try {
    db = createAdminClient();
  } catch {
    return bare();
  }

  // The profile and the memberships do not depend on each other, so they load in parallel.
  const [user, { data }] = await Promise.all([
    getSessionUser(),
    db.from("workspace_members").select("role, created_at, workspaces(*)").eq("user_id", authUser.id).eq("status", "active").order("created_at", { ascending: false }),
  ]);
  if (!user) return null;

  type Row = { role: string; workspaces: Workspace | null };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.workspaces && isRole(r.role));
  const memberships: Membership[] = rows.map((r) => ({ id: r.workspaces!.id, name: r.workspaces!.name, role: r.role as MemberRole }));
  if (rows.length === 0) return { user, workspace: null, db, access: null, memberships };

  const wanted = cookies().get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const chosen = rows.find((r) => r.workspaces!.id === wanted) ?? rows[0];
  const workspace = chosen.workspaces as Workspace;
  const role = chosen.role as MemberRole;

  const [{ data: override }, { data: depts }] = await Promise.all([
    role === "owner" ? Promise.resolve({ data: null }) : db.from("role_permissions").select("permissions").eq("workspace_id", workspace.id).eq("role", role).maybeSingle(),
    db.from("department_members").select("department_id").eq("workspace_id", workspace.id).eq("user_id", user.id),
  ]);
  const access = buildAccess(role, (override as { permissions?: unknown } | null)?.permissions ?? null, ((depts ?? []) as { department_id: string }[]).map((d) => d.department_id));
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
