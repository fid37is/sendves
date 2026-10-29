import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient, type Db } from "@/lib/supabase/admin";
import { go } from "@/lib/flash";
import { requireAdminDb as requireAdminSession } from "@/lib/auth/admin";
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

export type Ctx = { user: SessionUser; workspace: Workspace | null; db: Db | null };

/**
 * The signed-in user plus their workspace. `workspace` and `db` are null only when the service
 * role key is missing, so pages can show empty states instead of crashing.
 */
export async function getContext(): Promise<Ctx | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (!isSupabaseConfigured) return { user, workspace: null, db: null };

  let db: Db;
  try {
    db = createAdminClient();
  } catch {
    return { user, workspace: null, db: null };
  }

  const { data } = await db
    .from("workspace_members")
    .select("workspaces(*)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const ws = (data as any)?.workspaces as Workspace | undefined;
  return { user, workspace: ws ?? null, db };
}

/** For server actions: guarantees a signed-in user with a real workspace, or redirects. */
export async function requireWorkspace(back = "/app"): Promise<{ user: SessionUser; workspace: Workspace; db: Db }> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!ctx.workspace || !ctx.db) {
    go(back, "err", "Your workspace isn’t available right now. Please try again, or contact support if this continues.");
  }
  return { user: ctx.user, workspace: ctx.workspace, db: ctx.db };
}

/**
 * For admin actions: guarantees a signed-in admin who passed 2FA, plus a service-role client.
 * Anyone else is redirected or receives a 404 before any work happens.
 */
export const requireAdminDb = requireAdminSession;
