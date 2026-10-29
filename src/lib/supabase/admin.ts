import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Service-role client. Bypasses RLS, so only use it in trusted server code, and always
 * filter by the workspace of the signed-in user. Also used by the worker and webhooks.
 */
export function createAdminClient() {
  if (!env.supabaseUrl || !serverEnv.supabaseServiceRoleKey) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(env.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Db = ReturnType<typeof createAdminClient>;
