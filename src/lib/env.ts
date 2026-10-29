/**
 * Public (browser-safe) environment values.
 * Server-only secrets live in env.server.ts.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "localhost:3000";
  }
}

/** The bare domain the marketing site and the app run on, e.g. "sendves.com" or "localhost:3000". */
const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? hostOf(siteUrl)).replace(/^www\./, "").toLowerCase();
const protocol = siteUrl.startsWith("https://") ? "https" : "http";
const adminPrefix = (process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN ?? "admin").toLowerCase();

export const env = {
  siteUrl,
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@sendves.com",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  rootDomain,
  /** The admin console lives on its own host, e.g. admin.sendves.com. It is never served under /admin. */
  adminHost: `${adminPrefix}.${rootDomain}`,
  adminUrl: `${protocol}://${adminPrefix}.${rootDomain}`,
  /**
   * Marketing-only: shows placeholder social proof (fake stats and testimonials) on the
   * landing page. It has no effect on the dashboard or the admin console. Turn off before launch.
   */
  sampleData: process.env.NEXT_PUBLIC_SAMPLE_DATA === "true",
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
