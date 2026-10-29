import { notFound, redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, type Db } from "@/lib/supabase/admin";
import type { SessionUser } from "@/types";

/** True when the current session has passed the second factor (or MFA is not required). */
export async function hasRequiredAssurance(): Promise<boolean> {
  if (!serverEnv.admin.requireMfa) return true;
  const { data } = await createClient().auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal2";
}

/**
 * The single gate for everything on the admin host. Used by the layout, every admin page's data
 * loaders and every admin server action, so a missed check in one place cannot expose data.
 *
 *  - not signed in            -> admin sign-in
 *  - signed in, not an admin  -> 404 (the console's existence is not confirmed)
 *  - admin without 2FA        -> 2FA step
 */
export async function requireAdmin(): Promise<SessionUser> {
  if (!isSupabaseConfigured) redirect("/login");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") notFound();
  if (!(await hasRequiredAssurance())) redirect("/mfa");
  return user;
}

/** Admin identity plus a service-role client. */
export async function requireAdminDb(): Promise<{ user: SessionUser; db: Db }> {
  const user = await requireAdmin();
  return { user, db: createAdminClient() };
}
