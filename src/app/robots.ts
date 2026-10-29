import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/api", "/login", "/register", "/forgot-password", "/reset-password"] }],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
