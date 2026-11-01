/**
 * THE ONLY PLACE COLOURS ARE DEFINED.
 *
 * Everything else reads from this file:
 *  - tailwind.config.ts turns it into CSS variables (--c-brand-700, --c-ink, …) and Tailwind
 *    classes (bg-brand-700, text-ink-muted, …), so components never contain a colour value.
 *  - Email HTML cannot use CSS variables, so `emailTheme` below exposes plain hex for it.
 *  - layout.tsx uses `themeColor` for the browser chrome.
 *
 * To re-theme the product, edit the values here and nothing else. To add dark mode later, add a
 * second palette object and emit it under `.dark` in tailwind.config.ts (the variable plumbing
 * is already in place; components do not need to change).
 *
 * Direction: "Coastal Minimal". Deep Teal carries brand and action, Sea Glass is the accent,
 * Warm White is the canvas. Every text/background pair used in the UI meets WCAG AA (4.5:1).
 */

export const palette = {
  /** Deep Teal #164E63 is the brand colour (700). Buttons, links, active states, headings on light. */
  brand: {
    50: "#F0F7F9",
    100: "#D9ECF1",
    200: "#B3D8E3",
    300: "#82BED0",
    400: "#4F9DB5",
    500: "#2B7F9B",
    600: "#1D6783",
    700: "#164E63",
    800: "#113E50", // hover / pressed, and text links on light surfaces
    900: "#0C2E3C",
  },

  /** Sea Glass #8BCFC3 (400). Highlights, focus tints, toast accent, chart secondary, text on dark teal. */
  accent: {
    50: "#F2FAF8",
    100: "#E2F4F1",
    200: "#C9EAE4",
    300: "#A9DCD3",
    400: "#8BCFC3",
    500: "#62B6A8",
    600: "#3F9486",
    700: "#2D7569",
  },

  /** Deep surfaces: admin sidebar, dark marketing sections. A tinted dark, never pure black. */
  night: {
    DEFAULT: "#0B2530",
    950: "#071A22",
    900: "#0B2530",
    800: "#12394A",
    700: "#1B4D62",
  },

  /** Text. Deep teal-ink rather than black. */
  ink: {
    DEFAULT: "#0E2A35",
    soft: "#35505C",
    muted: "#566C78",
  },

  /** Warm White #FFF9F0: the page canvas. Cards sit on it in pure white. */
  canvas: "#FFF9F0",

  /** Warm neutral for borders and quiet fills. mist-50 = canvas, mist-100 = hover/zebra. */
  mist: {
    DEFAULT: "#E9E1D3",
    50: "#FFF9F0",
    100: "#F7EFE2",
  },

  spark: "#FBBF24",

  /** Status colours. `soft` is the tinted background that pairs with the text colour. */
  success: { DEFAULT: "#15803D", soft: "#EDF8F1" },
  warning: { DEFAULT: "#A16207", soft: "#FDF6E3" },
  /**
   * Brick, not signal red: a muted, warm red that sits with the teal and warm white instead of shouting.
   * Contrast (all WCAG AA): white on DEFAULT 6.1, DEFAULT on white 6.1, on canvas 5.8, on soft 5.3.
   * `strong` is the hover/pressed shade (white on strong 8.3).
   */
  danger: { DEFAULT: "#A4433A", soft: "#F8EDE9", strong: "#86342D" },
} as const;

export type Palette = typeof palette;

/** Browser UI colour (mobile address bar). */
export const themeColor: string = palette.canvas;

/**
 * Plain hex for places that cannot read CSS variables, i.e. HTML emails (mail clients strip
 * <style> and ignore var()). Derived from the palette above, never typed again.
 */
export const emailTheme = {
  action: palette.brand[700],
  onAction: "#FFFFFF",
  heading: palette.ink.DEFAULT,
  body: palette.ink.soft,
  muted: palette.ink.muted,
  rule: palette.mist.DEFAULT,
  pageBackground: palette.mist[100],
  card: "#FFFFFF",
} as const;

/**
 * Colours of the CAMPAIGN EMAIL itself: the editor's canvas, the preview and the HTML that is sent.
 * Mail clients cannot read CSS variables, so these are plain hex. The product's own screens never
 * use them; they use the palette above.
 */
export const emailCanvas = {
  page: "#F4F5F7",
  card: "#FFFFFF",
  ink: "#1D2129",
  muted: "#6B7280",
  rule: "#E5E7EB",
  onColor: "#FFFFFF",
  /** Placeholders shown only while editing ("Add your logo", "Add banner"). */
  placeholderBorder: "#B8C2CC",
  placeholderText: "#6B7280",
  /** The chip that stands in for {{variables}} while editing. */
  chipBg: "#DFF1EE",
  chipInk: "#0B5B54",
  /** The email as dark-mode mail apps tend to show it (used by the preview's dark theme). */
  dark: { page: "#101216", card: "#1B1D21", ink: "#E6E8EC", muted: "#9AA0AA", rule: "#33373E" },
  /** The colours a campaign can use for buttons, countdown tiles and social icons. The first is the default. */
  brandColors: ["#0F766E", "#1D4ED8", "#B45309", "#BE123C"],
  /** The preset pictures for Image blocks, products and the banner: [from, to]. */
  gradients: [
    ["#0F766E", "#34D399"],
    ["#334155", "#94A3B8"],
    ["#B45309", "#FBBF24"],
    ["#6D28D9", "#A78BFA"],
    ["#BE123C", "#FB7185"],
    ["#1D4ED8", "#60A5FA"],
  ],
} as const;
