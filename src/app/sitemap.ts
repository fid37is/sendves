import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

const paths = [
  "", "/features", "/pricing", "/about", "/contact", "/help",
  "/terms-of-service", "/privacy-policy", "/anti-spam-policy", "/acceptable-use-policy", "/data-protection",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((p) => ({ url: `${siteConfig.url}${p}`, lastModified: new Date() }));
}
