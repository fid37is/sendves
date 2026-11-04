/** Security headers for every response. The admin host adds stricter ones in middleware.ts. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Next 14.2 keeps NOTHING in the browser's page cache for dynamic pages (dynamic: 0), so every click on the menu
    // waited for the server again. Keeping visited pages for 30 seconds makes going back and forth instant.
    // Saving something (a server action) or router.refresh() still clears it, so edits show up straight away.
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
