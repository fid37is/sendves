import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * Public, indexable pages only. Sign-in pages, the app and the admin console are left out on purpose.
 * No `lastModified`: it used to be "now" on every build, which teaches Google to ignore it. Add a real date per page
 * here when you want to send one.
 */
const paths = [
  "", "/features", "/pricing", "/about", "/contact", "/help",
  "/terms-of-service", "/privacy-policy", "/anti-spam-policy", "/acceptable-use-policy", "/data-protection",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url.replace(/\/$/, "");
  return paths.map((p) => ({ url: `${base}${p || "/"}` }));
}
