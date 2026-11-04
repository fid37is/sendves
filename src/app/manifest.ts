import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/** Served at /manifest.webmanifest and linked from every page automatically. Replaces public/icons/site.webmanifest, whose icon paths pointed at the wrong folder. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#164E63",
    icons: [
      { src: "/icons/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
