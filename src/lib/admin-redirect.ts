import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { flash } from "@/lib/flash";

const kinds = { ok: "success", err: "error", warn: "warning", info: "info" } as const;
const ADMIN_PREFIX = (process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN ?? "admin").toLowerCase();

/** The origin the console is being served from (so redirects stay on the admin host), never a value the visitor can choose freely. */
function adminOrigin(): string {
  const h = headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const hostname = host.split(":")[0];
  const isConsoleHost = hostname === env.adminHost.split(":")[0].toLowerCase() || (process.env.NODE_ENV !== "production" && hostname === `${ADMIN_PREFIX}.localhost`);
  if (!isConsoleHost) return env.adminUrl;
  const proto = (h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http")).split(",")[0].trim();
  return `${proto}://${host}`;
}

/**
 * Redirect + toast for the admin console.
 *
 * The console lives on its own host and its URLs are rewritten to /admin/... by the middleware. When a server
 * action redirects to a *relative* path, Next fetches that page itself from inside the server (without going through
 * the console host), so it can render the 404 page and show it at the new address. An absolute URL on the console
 * host makes the browser do an ordinary page load instead, which goes through the middleware like any other visit.
 */
export function adminGo(path: string, kind: keyof typeof kinds, message: string): never {
  flash(kinds[kind], message);
  redirect(`${adminOrigin()}${path.startsWith("/") ? path : `/${path}`}`);
}
