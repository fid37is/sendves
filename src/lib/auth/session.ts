import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/types";

/**
 * Wrapped in React `cache`, so however many layouts, pages and loaders ask in one request,
 * the identity is verified with the Auth server exactly once.
 */
export const getAuthUser = cache(async () => {
  if (!isSupabaseConfigured) return null;
  const {
    data: { user },
  } = await createClient().auth.getUser(); // validated by the Auth server, never trusted from the cookie
  return user;
});

/**
 * Returns the signed-in user, or null. There is no fallback identity: when Supabase is not
 * configured or the visitor is not signed in, the result is always null.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const { data: profile } = await createClient().from("profiles").select("full_name, role").eq("id", user.id).single();

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? "",
    role: profile?.role === "admin" ? "admin" : "user",
  };
});
