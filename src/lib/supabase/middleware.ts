import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Refreshes the Supabase session cookies and returns the verified user. Pass `rewriteTo` to serve
 * the request from a different internal path (used for the admin host) while keeping the cookies.
 */
export async function updateSession(request: NextRequest, rewriteTo?: URL, opts: { verify?: boolean } = {}) {
  const verify = opts.verify ?? true;
  const make = () => (rewriteTo ? NextResponse.rewrite(rewriteTo, { request }) : NextResponse.next({ request }));
  let response = make();

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = make();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // verify = true  -> asks the Auth server (one network round trip). Used for the admin host and sign-in pages.
  // verify = false -> reads the session locally (refreshing it if expired), with no network call. Used only to
  //                   decide redirects for /app. Real authorisation still happens in the layout and every
  //                   data loader, which verify the user with the Auth server (cached once per request).
  const user = verify
    ? (await supabase.auth.getUser()).data.user
    : (await supabase.auth.getSession()).data.session?.user ?? null;

  return { response: () => response, supabase, user };
}
