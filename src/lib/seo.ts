import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

/** The social preview image in public/og-image.jpg (1672x941, compressed). */
export const OG_IMAGE = {
  url: "/og-image.jpg",
  width: 1672,
  height: 941,
  alt: `${siteConfig.name}: ${siteConfig.tagline}`,
  type: "image/jpeg",
};

export const defaultTitle = `${siteConfig.name}: ${siteConfig.tagline}`;

/**
 * Metadata for a public page. Next.js replaces a layout's `openGraph` and `twitter` objects when a page sets its own,
 * so every page builds them here with the image included, plus its own canonical URL.
 *
 * Pass `title` without the site name (the layout's template adds " | Sendves"). Leave it out for the home page.
 */
export function pageMetadata({ title, description, path }: { title?: string; description: string; path: string }): Metadata {
  const fullTitle = title ? `${title} | ${siteConfig.name}` : defaultTitle;
  return {
    title: title ?? { absolute: defaultTitle },
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: siteConfig.name, locale: "en_US", url: path, title: fullTitle, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [OG_IMAGE.url] },
  };
}

/** schema.org data for the home page: who the company is, and the site itself. */
export function homeJsonLd() {
  const url = siteConfig.url.replace(/\/$/, "");
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: siteConfig.name,
      url,
      logo: `${url}/icons/android-chrome-512x512.png`,
      email: siteConfig.supportEmail,
      description: siteConfig.description,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteConfig.name,
      url,
      description: siteConfig.description,
      inLanguage: "en",
    },
  ];
}
