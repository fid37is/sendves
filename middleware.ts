import { NextResponse, type NextRequest } from "next/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import { updateSession } from "@/lib/supabase/middleware";

const AUTH_PAGES = ["/login", "/register", "/forgot-password"];
/** Paths on the admin host that are reachable before the admin has fully signed in. */
const ADMIN_SIGN_IN = ["/login", "/mfa"];
/** Endpoints that never need a user session, so they skip the (slow) session lookup entirely. */
const STATELESS_API = /^\/api\/(track|webhooks|cron|unsubscribe|health)(\/|$)/;

const hostOnly = (h: string | null) => (h ?? "").split(":")[0].toLowerCase();
const ADMIN_HOSTNAME = hostOnly(env.adminHost);

function notFound(request: NextRequest) {
  // A path that matches no route renders the standard 404 page.
  return NextResponse.rewrite(new URL("/__not-found", request.url));
}

/** Headers for every admin response: never cached, never indexed, never framed. */
function lockDown(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return lockDown(NextResponse.redirect(url));
}

/**
 * The admin console is served ONLY from admin.<domain>. Public paths there have no /admin prefix
 * (admin.example.com/users); they are rewritten to the internal /admin/users route.
 *
 * Layers: optional IP allowlist -> signed-in -> role is admin -> second factor passed.
 * Pages, data loaders and server actions check all of this again (see lib/auth/admin.ts).
 */
async function adminHost(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const allowed = (process.env.ADMIN_ALLOWED_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.length) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "";
    if (!allowed.includes(ip)) return lockDown(new NextResponse("Not found", { status: 404 }));
  }

  // Internal paths must never be addressed directly, and only console routes exist here.
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/")) return lockDown(notFound(request));

  const internal = new URL(request.url);
  internal.pathname = `/admin${pathname === "/" ? "" : pathname}`;

  if (!isSupabaseConfigured) {
    return pathname === "/login" ? lockDown(NextResponse.rewrite(internal)) : redirectTo(request, "/login");
  }

  const { response, supabase, user } = await updateSession(request, internal);
  const signingIn = ADMIN_SIGN_IN.includes(pathname);

  if (!user) return signingIn && pathname === "/login" ? lockDown(response()) : redirectTo(request, "/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    // Not an admin: only the sign-in page (to switch accounts) answers; everything else is a plain 404.
    return pathname === "/login" ? lockDown(response()) : lockDown(notFound(request));
  }

  if (process.env.ADMIN_REQUIRE_MFA !== "false") {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") return signingIn ? lockDown(response()) : redirectTo(request, "/mfa");
  }

  // Fully signed-in admins have no reason to see the sign-in pages.
  if (signingIn) return redirectTo(request, "/");
  return lockDown(response());
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (hostOnly(request.headers.get("host")) === ADMIN_HOSTNAME) return adminHost(request);

  // On every other host the admin console does not exist.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return notFound(request);

  const isProtected = pathname.startsWith("/app");
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (!isSupabaseConfigured) {
    if (isProtected) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?error=not-configured";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Public pages without a session cookie need no lookup.
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (STATELESS_API.test(pathname) || (!isProtected && !isAuthPage && !hasSessionCookie)) return NextResponse.next();

  // Sign-in pages verify with the Auth server (so a stale cookie can never cause a redirect loop);
  // /app only needs a quick local check here, because its layout verifies the user again.
  const { response, user } = await updateSession(request, undefined, { verify: isAuthPage });

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
