import type { Metadata, Viewport } from "next";
// Fonts come from npm packages (self-hosted), not from Google at build time, so the build needs no internet access
// and visitors' browsers never contact Google. They are variable fonts, so every weight is available.
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/bricolage-grotesque";
import { siteConfig } from "@/config/site";
import { Toaster } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { themeColor } from "@/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name}: ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `${siteConfig.name}: ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <ConfirmProvider>{children}</ConfirmProvider>
        <Toaster />
      </body>
    </html>
  );
}