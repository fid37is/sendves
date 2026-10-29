Sendves web meta asset kit

Files:
- favicon.ico: multi-size browser favicon
- favicon.svg: scalable simplified teal/white envelope-inspired favicon
- favicon-16x16.png, favicon-32x32.png, favicon-48x48.png: browser tab sizes
- apple-touch-icon.png: iOS home-screen icon
- android-chrome-192x192.png, android-chrome-512x512.png: PWA icons
- site.webmanifest: installable web app metadata
- og-image.png: social sharing preview (1200x630)
- metadata-snippet.html: HTML tags to adapt for your app

Implementation:
1. Copy the asset files into your framework's public directory.
2. Add/adapt the tags in metadata-snippet.html.
3. Replace https://YOUR-DOMAIN with your actual public domain.
4. In Next.js App Router, static metadata assets can also be placed in src/app using Next.js's file conventions; use one approach rather than duplicating conflicting metadata.

Brand colors:
Deep Teal #164E63
Sea Glass #8BCFC3
Cloud White #F8FAFC

Note: raster icon variants are generated from the current logo artwork. Review at 16x16 and 32x32 in your actual browser before launch.
