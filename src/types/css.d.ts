// Lets TypeScript accept side-effect style imports such as `import "./globals.css";`.
// Next.js handles the CSS at build time; this only tells the type checker the import is fine.
// Keep this file free of import/export statements so the declarations stay global.
declare module "*.css";
