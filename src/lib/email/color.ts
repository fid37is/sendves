/**
 * Colour helpers for the campaign email. Pure, so the editor, the preview and the server agree.
 *
 * Text on a brand colour (buttons, countdown tiles, social icons) switches between white and a
 * near-black automatically, using WCAG 2.x contrast rather than a brightness guess.
 */

import { emailCanvas } from "@/config/brand";

/** Light and dark text come from the email palette in config/brand.ts, never typed here. */
export const LIGHT_TEXT: string = emailCanvas.onColor.toLowerCase();
export const DARK_TEXT: string = emailCanvas.ink.toLowerCase();

/** The only colour format accepted from the browser: #rrggbb. */
export const HEX_RE = /^#[0-9a-f]{6}$/i;
export const isHexColor = (v: unknown): v is string => typeof v === "string" && HEX_RE.test(v);

/** A valid #rrggbb in lower case, or `fallback`. */
export const cleanHex = (v: unknown, fallback = ""): string => (isHexColor(v) ? v.toLowerCase() : fallback);

function channel(n: number): number {
  const c = n / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb colour (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The text colour (light or dark) that reads best on `bg`. */
export function readableOn(bg: string): string {
  if (!isHexColor(bg)) return LIGHT_TEXT;
  return contrastRatio(bg, LIGHT_TEXT) >= contrastRatio(bg, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

/** Below this, body-size text is hard to read (WCAG AA). */
export const MIN_TEXT_CONTRAST = 4.5;
