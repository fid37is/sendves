import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/types";

/**
 * Returns the signed-in user, or null. There is no fallback identity: when Supabase is not
 * configured or the visitor is not signed in, the result is always null.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(); // validated by the Auth server, never trusted from the cookie
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? "",
    role: profile?.role === "admin" ? "admin" : "user",
  };
}
