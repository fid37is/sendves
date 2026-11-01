/**
 * The campaign editor's email model and renderer. Pure functions with no server dependencies, so the
 * editor's canvas and preview (browser) and the delivery engine (server) produce the same email.
 *
 * An email is one of
 *  - a TEMPLATE layout (announcement, newsletter, promo, event, product): the layout is fixed and
 *    only its content is edited (`C`), or
 *  - a CUSTOM layout: free blocks that can be added, removed and reordered.
 *
 * The logo is a shared asset of the workspace and the banner is shared inside one email, so neither
 * belongs to a single block.
 *
 * What gets stored on a campaign is `html` (see renderCampaignHtml), which still holds three kinds
 * of marker that are resolved for every recipient at send time:
 *   {{variable}} / {{variable|fallback}}   see lib/email/variables.ts
 *   <!--sv-if:lagos-->…<!--/sv-if-->        blocks shown only to some contacts (applyConditions)
 *   [[sv-cd:days:2026-12-05]]               countdown numbers (fillCountdown)
 *   [[sv-unsub]]                            the recipient's unsubscribe link
 */
import { emailCanvas } from "@/config/brand";
import { escapeHtml, type Block as LegacyBlock } from "@/lib/email/blocks";
import { VARIABLE_TOKEN_RE, BUILT_IN_VARIABLES, VARIABLE_KEY_RE, type VariableDef } from "@/lib/email/variables";

// ── Vocabulary ─────────────────────────────────────────────────────────────

export const TEMPLATE_KEYS = ["announcement", "newsletter", "promo", "event", "product"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export type Layout = TemplateKey | "custom";

export const TEMPLATE_NAMES: Record<TemplateKey, string> = {
  announcement: "Announcement", newsletter: "Newsletter", promo: "Promo", event: "Event", product: "Product showcase",
};
export const TEMPLATE_BLURBS: Record<TemplateKey, string> = {
  announcement: "One clear message", newsletter: "Header, story and image", promo: "Bold offer, big button",
  event: "Countdown and details", product: "Three-product grid",
};
/** One letter per stripe of the little layout picture in the Templates tab. */
export const TEMPLATE_THUMBS: Record<TemplateKey, string> = {
  announcement: "lbhttBf", newsletter: "lhttbBf", promo: "lbhtBf", event: "lbhcttBf", product: "lhpBf",
};

export type Cond = "" | "lagos" | "nolagos" | "company" | "named";
export const CONDITIONS: { value: Cond; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "lagos", label: "Contacts in Lagos" },
  { value: "nolagos", label: "Contacts outside Lagos" },
  { value: "company", label: "Contacts with a company" },
  { value: "named", label: "Contacts with a first name" },
];
const COND_VALUES = new Set<string>(CONDITIONS.map((c) => c.value));

export type SlotKey = "logo" | "banner" | "headline" | "countdown" | "products" | "body" | "button" | "footer";
export type BlockType = "logo" | "banner" | "heading" | "text" | "image" | "columns" | "products" | "countdown" | "social" | "button" | "divider" | "footer";
export const BLOCK_TYPES: readonly BlockType[] = ["logo", "banner", "heading", "text", "image", "columns", "products", "countdown", "social", "button", "divider", "footer"];
export const BLOCK_LABELS: Record<BlockType, string> = {
  logo: "Logo", banner: "Banner", heading: "Heading", text: "Text", image: "Image", columns: "Columns", products: "Products",
  countdown: "Countdown", social: "Social", button: "Button", divider: "Divider", footer: "Footer",
};
/** The tiles of the Blocks tab, in order. (A logo only comes with a layout.) */
export const ADDABLE_BLOCKS: readonly BlockType[] = ["heading", "text", "image", "banner", "columns", "products", "countdown", "social", "button", "divider", "footer"];
/** Blocks whose editor is more than one text box. */
export const EXTRA_EDITOR_BLOCKS: ReadonlySet<BlockType> = new Set<BlockType>(["columns", "countdown", "products", "social"]);

export const BRAND_COLORS: readonly string[] = emailCanvas.brandColors;
export const GRADIENT_COUNT = emailCanvas.gradients.length;
const gradient = (i: number) => {
  const [a, b] = emailCanvas.gradients[((i % GRADIENT_COUNT) + GRADIENT_COUNT) % GRADIENT_COUNT];
  return { from: a, css: `linear-gradient(135deg,${a},${b})` };
};

export const DEFAULT_FOOTER_TEXT = "You’re receiving this because you subscribed.";
export const UNSUBSCRIBE_TOKEN = "[[sv-unsub]]";

// ── Model ──────────────────────────────────────────────────────────────────

export type Product = { n: string; p: string; u: string };
export type SocialLink = { n: string; u: string };
export type EmailBlock = {
  id: string;
  t: BlockType;
  /** Text (heading, text, button label, footer, left column). */
  x?: string;
  /** Right column. */
  y?: string;
  /** Button link. */
  u?: string;
  /** Preset picture of an Image block. */
  g?: number;
  /** Countdown date, YYYY-MM-DD. */
  d?: string;
  p?: Product[];
  soc?: SocialLink[];
  cond?: Cond;
  /** Only on an Image block that came from an older campaign, which could point at a picture. */
  url?: string; alt?: string; link?: string;
};
export type Content = { headline: string; body: string; btn: string; u: string; foot: string; d: string; p: Product[] };
export type Banner = { src: string; fx: number; fy: number; alt: string };
export type Logo = { src: string; align: "left" | "center" | "right"; size: "s" | "m" | "l"; w: number; h: number };
export type Design = {
  tpl: Layout;
  color: string;
  C: Content;
  cond: Partial<Record<SlotKey, Cond>>;
  blocks: EmailBlock[];
  /** Blocks set aside while a template layout is in use; they come back when the layout is customised again. */
  tray: EmailBlock[];
  banner: Banner;
};

export const EMPTY_LOGO: Logo = { src: "", align: "left", size: "m", w: 0, h: 0 };

export const newId = () => Math.random().toString(36).slice(2, 10);
const pad2 = (n: number) => String(n).padStart(2, "0");
export const isoDate = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: unknown): v is string => typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const defaultProducts = (): Product[] => [{ n: "Product name", p: "", u: "" }, { n: "Product name", p: "", u: "" }, { n: "Product name", p: "", u: "" }];

export function defaultContent(now = Date.now()): Content {
  return { headline: "Your headline", body: "Write your message here.", btn: "Learn more", u: "", foot: DEFAULT_FOOTER_TEXT, d: isoDate(now + 14 * 864e5), p: defaultProducts() };
}

export function defaultDesign(tpl: Layout = "announcement", now = Date.now()): Design {
  const d: Design = { tpl, color: BRAND_COLORS[0], C: defaultContent(now), cond: {}, blocks: [], tray: [], banner: { src: "", fx: 50, fy: 50, alt: "" } };
  if (tpl === "custom") d.blocks = [{ id: newId(), t: "logo" }, { id: newId(), t: "footer", x: DEFAULT_FOOTER_TEXT }];
  return d;
}

export const cloneJson = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ── Validation (everything that comes from the browser or the database goes through here) ──

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, dflt: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt; };
const cond = (v: unknown): Cond => (typeof v === "string" && COND_VALUES.has(v) ? (v as Cond) : "");
const MAX_BLOCKS = 60;
export const MAX_PRODUCTS = 6;

/** A link a recipient can open: http(s) or mailto. Anything else is treated as "no link". */
export const isValidLink = (u: unknown): boolean => typeof u === "string" && /^(https?:\/\/[^\s"<>]+|mailto:[^\s"<>]+)$/i.test(u.trim());

function sanitizeProducts(v: unknown, fallback: Product[]): Product[] {
  if (!Array.isArray(v)) return fallback;
  const out = v.slice(0, MAX_PRODUCTS).map((r) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    return { n: str(o.n, 120), p: str(o.p, 60), u: str(o.u, 2000).trim() };
  });
  return out.length ? out : fallback;
}

function sanitizeBlocks(v: unknown, seen: Set<string>): EmailBlock[] {
  if (!Array.isArray(v)) return [];
  const out: EmailBlock[] = [];
  for (const raw of v.slice(0, MAX_BLOCKS)) {
    const o = raw as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || !BLOCK_TYPES.includes(o.t as BlockType)) continue;
    const t = o.t as BlockType;
    let id = str(o.id, 40).replace(/[^A-Za-z0-9_-]/g, "");
    if (!id || seen.has(id)) id = newId();
    seen.add(id);
    const b: EmailBlock = { id, t };
    if (o.cond !== undefined && t !== "footer") { const c = cond(o.cond); if (c) b.cond = c; }
    switch (t) {
      case "heading": b.x = str(o.x, 300); break;
      case "text": b.x = str(o.x, 8000); break;
      case "footer": b.x = str(o.x, 500); break;
      case "button": b.x = str(o.x, 100); b.u = str(o.u, 2000).trim(); break;
      case "columns": b.x = str(o.x, 4000); b.y = str(o.y, 4000); break;
      case "countdown": b.d = validDate(o.d) ? o.d : isoDate(Date.now() + 14 * 864e5); break;
      case "products": b.p = sanitizeProducts(o.p, defaultProducts()); break;
      case "social": b.soc = ["IG", "X", "FB", "YT"].map((n) => {
        const found = Array.isArray(o.soc) ? (o.soc as Record<string, unknown>[]).find((s) => s && s.n === n) : undefined;
        return { n, u: str(found?.u, 2000).trim() };
      }); break;
      case "image": {
        b.g = num(o.g, 0, GRADIENT_COUNT - 1, 0);
        const url = str(o.url, 2000).trim();
        if (/^https?:\/\//i.test(url)) { b.url = url; b.alt = str(o.alt, 300); const l = str(o.link, 2000).trim(); if (l) b.link = l; }
        break;
      }
      default: break;
    }
    out.push(b);
  }
  return out;
}

/** Where uploaded pictures live: only pictures under this prefix are accepted as the logo or banner. */
export type AssetRule = { prefix: string };
const assetOk = (src: string, rule: AssetRule) => src.length <= 600 && src.startsWith(rule.prefix) && !/["'<>\s\\]/.test(src);

export function sanitizeLogo(input: unknown, rule: AssetRule): Logo {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const src = typeof o.src === "string" && assetOk(o.src, rule) ? o.src : "";
  return {
    src,
    align: o.align === "center" || o.align === "right" ? o.align : "left",
    size: o.size === "s" || o.size === "l" ? o.size : "m",
    w: src ? num(o.w, 0, 4000, 0) : 0,
    h: src ? num(o.h, 0, 4000, 0) : 0,
  };
}

export function sanitizeDesign(input: unknown, rule: AssetRule, now = Date.now()): Design {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = defaultDesign("announcement", now);
  const tpl: Layout = o.tpl === "custom" || TEMPLATE_KEYS.includes(o.tpl as TemplateKey) ? (o.tpl as Layout) : "announcement";
  const c = (o.C && typeof o.C === "object" ? o.C : {}) as Record<string, unknown>;
  const C: Content = {
    headline: str(c.headline, 300), body: str(c.body, 8000), btn: str(c.btn, 100), u: str(c.u, 2000).trim(), foot: str(c.foot, 500),
    d: validDate(c.d) ? c.d : base.C.d, p: sanitizeProducts(c.p, base.C.p),
  };
  const rawCond = (o.cond && typeof o.cond === "object" ? o.cond : {}) as Record<string, unknown>;
  const slots: SlotKey[] = ["logo", "banner", "headline", "countdown", "products", "body", "button"];
  const conds: Partial<Record<SlotKey, Cond>> = {};
  for (const k of slots) { const v = cond(rawCond[k]); if (v) conds[k] = v; }
  const bn = (o.banner && typeof o.banner === "object" ? o.banner : {}) as Record<string, unknown>;
  const bsrc = typeof bn.src === "string" ? bn.src : "";
  const seen = new Set<string>();
  const blocks = sanitizeBlocks(o.blocks, seen);
  const tray = sanitizeBlocks(o.tray, seen);
  return {
    tpl,
    color: BRAND_COLORS.includes(String(o.color)) ? String(o.color) : BRAND_COLORS[0],
    C, cond: conds, blocks, tray,
    banner: {
      src: /^g[0-5]$/.test(bsrc) ? bsrc : assetOk(bsrc, rule) ? bsrc : "",
      fx: num(bn.fx, 0, 100, 50), fy: num(bn.fy, 0, 100, 50), alt: str(bn.alt, 300),
    },
  };
}

// ── Where a design comes from ──────────────────────────────────────────────

/** An older campaign (a list of simple blocks) becomes a custom layout: logo, its blocks, then a footer. */
export function designFromLegacyBlocks(old: LegacyBlock[], now = Date.now()): Design {
  const d = defaultDesign("custom", now);
  const blocks: EmailBlock[] = [{ id: newId(), t: "logo" }];
  for (const b of old) {
    switch (b.type) {
      case "heading": blocks.push({ id: newId(), t: "heading", x: b.text }); break;
      case "text": blocks.push({ id: newId(), t: "text", x: b.text }); break;
      case "button": blocks.push({ id: newId(), t: "button", x: b.label, u: b.url }); break;
      case "divider": blocks.push({ id: newId(), t: "divider" }); break;
      case "image": blocks.push({ id: newId(), t: "image", g: 0, ...(b.url ? { url: b.url, alt: b.alt, ...(b.link ? { link: b.link } : {}) } : {}) }); break;
      default: break; // spacers have no counterpart: every block has its own padding
    }
  }
  blocks.push({ id: newId(), t: "footer", x: DEFAULT_FOOTER_TEXT });
  d.blocks = blocks;
  return d;
}

/** The starting content of the built-in starters; any other starting point becomes a custom layout. */
export function designFromStarter(id: string, now = Date.now()): Design | null {
  const base = (tpl: TemplateKey, C: Partial<Content>): Design => { const d = defaultDesign(tpl, now); d.C = { ...d.C, ...C }; return d; };
  switch (id) {
    case "blank": return defaultDesign("custom", now);
    case "newsletter": return base("newsletter", { headline: "What’s new this month", body: "Hi {{first_name|there}},\n\nHere’s a quick update on what we’ve been working on and what’s coming next.", btn: "Read the full story", u: "https://example.com" });
    case "announcement": return base("announcement", { headline: "Introducing something new", body: "Hi {{first_name|there}}, we’ve just launched something we think you’ll like.\n\n• Faster: do more in less time\n• Simpler: fewer steps to get started\n• Better: built from your feedback", btn: "See what’s new", u: "https://example.com" });
    case "event": return base("event", { headline: "You’re invited", body: "Hi {{first_name|there}},\n\nJoin us for an evening of conversation and connection.\n\nWhen: Saturday, 7:00 PM\nWhere: Add your venue here", btn: "RSVP now", u: "https://example.com" });
    default: return null;
  }
}

/** The design of a stored campaign: the saved design, or one made from its older blocks. */
export function designFromRow(design: unknown, legacyBlocks: LegacyBlock[], rule: AssetRule, now = Date.now()): Design {
  if (design && typeof design === "object" && !Array.isArray(design)) return sanitizeDesign(design, rule, now);
  return legacyBlocks.length ? designFromLegacyBlocks(legacyBlocks, now) : defaultDesign("custom", now);
}

// ── Contacts: who sees a conditional block ─────────────────────────────────

export type ContactLike = { first_name?: string | null; last_name?: string | null; email?: string | null; custom_fields?: Record<string, unknown> | null };

function field(c: ContactLike | null | undefined, key: string): string {
  const f = c?.custom_fields;
  if (!f || typeof f !== "object") return "";
  for (const [k, v] of Object.entries(f)) if (k.toLowerCase() === key && v != null) return String(v).trim();
  return "";
}

export function showFor(k: Cond | string | undefined, c: ContactLike | null | undefined): boolean {
  switch (k) {
    case "lagos": return field(c, "city").toLowerCase() === "lagos";
    case "nolagos": return field(c, "city").toLowerCase() !== "lagos";
    case "company": return field(c, "company") !== "";
    case "named": return Boolean(c?.first_name && String(c.first_name).trim());
    default: return true;
  }
}

/** Removes the blocks a contact isn't meant to see. Runs on the stored html for each recipient. */
export function applyConditions(html: string, c: ContactLike | null | undefined): string {
  return html.replace(/<!--sv-if:(\w+)-->([\s\S]*?)<!--\/sv-if-->/g, (_m, k: string, inner: string) => (showFor(k, c) ? inner : ""));
}

// ── Time ───────────────────────────────────────────────────────────────────

function zoneOffsetMs(utcMs: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}

/** The moment (ms since 1970) at which the wall clock of `tz` shows `date` at `time`. Null for an unreadable date or time. */
export function zonedInstant(date: string, time: string, tz: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const wall = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  if (Number.isNaN(wall)) return null;
  try {
    let at = wall - zoneOffsetMs(wall, tz);
    at = wall - zoneOffsetMs(at, tz); // once more: the offset can differ across a daylight-saving change
    return at;
  } catch {
    return wall - zoneOffsetMs(wall, "UTC");
  }
}

export function countdownParts(date: string, tz: string, now = Date.now()): { days: number; hours: number; mins: number } {
  const at = zonedInstant(date, "09:00", tz);
  const ms = Math.max(0, (at ?? now) - now);
  return { days: Math.floor(ms / 864e5), hours: Math.floor(ms / 36e5) % 24, mins: Math.floor(ms / 6e4) % 60 };
}

/** Fills in the countdown numbers, counting to 09:00 on the date in the workspace's time zone. */
export function fillCountdown(html: string, tz: string, now = Date.now()): string {
  return html.replace(/\[\[sv-cd:(days|hours|mins):(\d{4}-\d{2}-\d{2})\]\]/g, (_m, unit: "days" | "hours" | "mins", date: string) => String(countdownParts(date, tz, now)[unit]));
}

/** Where a send can be scheduled. Both zones have no daylight-saving changes, so the time is exact. */
export const SCHEDULE_ZONES = [
  { key: "lagos", label: "Africa/Lagos (WAT)", tz: "Africa/Lagos" },
  { key: "utc", label: "UTC", tz: "UTC" },
] as const;
export type ScheduleZoneKey = (typeof SCHEDULE_ZONES)[number]["key"];

export function scheduleInstant(date: string, time: string, zone: ScheduleZoneKey): number | null {
  const z = SCHEDULE_ZONES.find((x) => x.key === zone);
  return z ? zonedInstant(date, time, z.tz) : null;
}

// ── Rendering ──────────────────────────────────────────────────────────────

export type RenderCtx = {
  logo: Logo;
  /** The workspace's time zone; countdowns count to 09:00 there. */
  tz: string;
  /** How a variable is named on a chip while editing. */
  labels?: Record<string, string>;
  now?: number;
};
type Mode = "edit" | "final";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const { ink: INK, muted: MUTED, rule: RULE, card: CARD, page: PAGE, onColor: ON } = emailCanvas;

export const variableLabel = (key: string, labels?: Record<string, string>) => labels?.[key.toLowerCase()] ?? key;
export const prettyKey = (key: string) => { const s = key.replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };

/** Text for the email. Editing shows each {{variable}} as a chip; the sent email keeps the token for later. */
function inline(text: string | undefined, mode: Mode, ctx: RenderCtx): string {
  const src = String(text ?? "");
  let out: string;
  if (mode === "final") out = escapeHtml(src);
  else {
    out = "";
    let last = 0;
    for (const m of src.matchAll(VARIABLE_TOKEN_RE)) {
      const at = m.index ?? 0;
      out += escapeHtml(src.slice(last, at));
      out += `<span style="background:${emailCanvas.chipBg};color:${emailCanvas.chipInk};border-radius:10px;padding:0 8px;font-size:.92em;white-space:nowrap">${escapeHtml(variableLabel(m[1], ctx.labels))}</span>`;
      last = at + m[0].length;
    }
    out += escapeHtml(src.slice(last));
  }
  return out.replace(/\r?\n/g, "<br>");
}

const href = (u: string | undefined, mode: Mode) => (mode === "final" && isValidLink(u) ? ` href="${escapeHtml(String(u).trim())}"` : "");

const ph = (label: string, extra = "") =>
  `<div style="border:1.5px dashed ${emailCanvas.placeholderBorder};border-radius:6px;padding:12px 16px;text-align:center;color:${emailCanvas.placeholderText};font-family:${FONT};font-size:13px;${extra}">${label}</div>`;

function logoHtml(ctx: RenderCtx, mode: Mode): string {
  const L = ctx.logo;
  if (!L.src) return mode === "edit" ? `<div style="text-align:${L.align}">${ph("Add your logo", "display:inline-block")}</div>` : "";
  const [bw, bh] = { s: [80, 40], m: [120, 56], l: [170, 80] }[L.size];
  let dims = `max-width:${bw}px;max-height:${bh}px;`;
  let attrs = "";
  if (L.w > 0 && L.h > 0) { // fitted into the box, so clients that ignore max-height still show it the same size
    const k = Math.min(bw / L.w, bh / L.h, 1);
    attrs = ` width="${Math.max(1, Math.round(L.w * k))}" height="${Math.max(1, Math.round(L.h * k))}"`;
    dims = "";
  }
  return `<div align="${L.align}" style="text-align:${L.align}"><img src="${escapeHtml(L.src)}" alt="Logo"${attrs} style="${dims}display:inline-block;border:0;outline:none"></div>`;
}

function bannerHtml(d: Design, mode: Mode): string {
  const B = d.banner;
  if (!B.src) return mode === "edit" ? ph("Add banner · 600×200", "aspect-ratio:3/1;display:flex;align-items:center;justify-content:center;") : "";
  if (/^g[0-5]$/.test(B.src)) {
    const g = gradient(+B.src.slice(1));
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="181" bgcolor="${g.from}" style="height:181px;border-radius:6px;background-color:${g.from};background-image:${g.css};font-size:1px;line-height:1px">&nbsp;</td></tr></table>`;
  }
  return `<img src="${escapeHtml(B.src)}" alt="${escapeHtml(B.alt)}" width="544" style="display:block;width:100%;max-width:544px;height:auto;aspect-ratio:3/1;object-fit:cover;object-position:${B.fx}% ${B.fy}%;border:0;border-radius:6px">`;
}

function headingHtml(text: string | undefined, mode: Mode, ctx: RenderCtx, o: { center?: boolean; size?: number } = {}): string {
  return `<h2 class="sv-ink" style="margin:0;font-family:${FONT};font-size:${o.size ?? 26}px;line-height:1.2;font-weight:700;letter-spacing:normal;color:${INK};${o.center ? "text-align:center;" : ""}">${inline(text, mode, ctx)}</h2>`;
}

function paragraphHtml(text: string | undefined, mode: Mode, ctx: RenderCtx, center = false): string {
  return `<p class="sv-ink" style="margin:0;font-family:${FONT};font-size:14px;line-height:1.45;color:${INK};${center ? "text-align:center;" : ""}">${inline(text, mode, ctx)}</p>`;
}

function buttonHtml(label: string | undefined, url: string | undefined, color: string, mode: Mode, ctx: RenderCtx, o: { center?: boolean; big?: boolean } = {}): string {
  const a = `<a${href(url, mode)} style="display:inline-block;padding:${o.big ? "14px 40px" : "10px 20px"};border-radius:6px;color:${ON};font-family:${FONT};font-size:${o.big ? 16 : 14}px;line-height:1.45;font-weight:600;text-decoration:none;background:${color}">${inline(label, mode, ctx)}</a>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${o.center ? ' align="center" style="margin:0 auto"' : ""}><tr><td bgcolor="${color}" style="background:${color};border-radius:6px">${a}</td></tr></table>`;
}

const dividerHtml = () => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="sv-rule" height="1" style="height:1px;font-size:1px;line-height:1px;border-top:1px solid ${RULE}">&nbsp;</td></tr></table>`;

function footerHtml(text: string | undefined, mode: Mode, ctx: RenderCtx): string {
  const link = mode === "final"
    ? `<a href="${UNSUBSCRIBE_TOKEN}" class="sv-mute" style="color:${MUTED};text-decoration:underline">Unsubscribe</a>`
    : `<span style="text-decoration:underline">Unsubscribe</span>`;
  return `<div class="sv-mute" style="text-align:center;font-family:${FONT};font-size:12px;line-height:1.45;color:${MUTED}">${inline(text, mode, ctx)}<br>${link}</div>`;
}

function countdownHtml(date: string | undefined, color: string, mode: Mode, ctx: RenderCtx): string {
  const d = validDate(date) ? date : isoDate(Date.now());
  const parts = mode === "edit" ? countdownParts(d, ctx.tz, ctx.now ?? Date.now()) : null;
  const tile = (unit: "days" | "hours" | "mins", label: string) => {
    const n = parts ? String(parts[unit]) : `[[sv-cd:${unit}:${d}]]`;
    return `<td align="center" style="padding:0 5px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="76" align="center" bgcolor="${color}" style="width:76px;background:${color};color:${ON};border-radius:8px;padding:10px 0;font-family:${FONT}"><div style="font-size:24px;line-height:1.3;font-weight:700">${n}</div><div style="font-size:11px;line-height:1.3;opacity:.85">${label}</div></td></tr></table></td>`;
  };
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>${tile("days", "Days")}${tile("hours", "Hours")}${tile("mins", "Mins")}</tr></table>`;
}

function productsHtml(products: Product[], mode: Mode, ctx: RenderCtx): string {
  const list = products.length ? products : defaultProducts();
  const width = Math.floor(100 / list.length);
  const cells = list.map((x, i) => {
    const g = gradient(i * 2);
    const linked = mode === "final" && isValidLink(x.u);
    const open = linked ? `<a${href(x.u, mode)} style="display:block;color:${INK};text-decoration:none">` : "";
    const close = linked ? "</a>" : "";
    return `<td class="sv-col" width="${width}%" valign="top" style="padding:0 6px;text-align:center">${open}` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="150" bgcolor="${g.from}" style="height:150px;border-radius:8px;background-color:${g.from};background-image:${g.css};font-size:1px;line-height:1px">&nbsp;</td></tr></table>` +
      `<div class="sv-ink" style="margin-top:6px;font-family:${FONT};font-size:14px;line-height:1.45;font-weight:600;color:${INK}">${inline(x.n, mode, ctx)}</div>` +
      (x.p ? `<div class="sv-mute" style="font-family:${FONT};font-size:14px;line-height:1.45;color:${MUTED}">${inline(x.p, mode, ctx)}</div>` : "") +
      `${close}</td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -6px;width:calc(100% + 12px)"><tr>${cells}</tr></table>`;
}

function socialHtml(links: SocialLink[] | undefined, color: string, mode: Mode): string {
  const items = (links ?? []).filter((x) => mode === "edit" || isValidLink(x.u)).map((x) => {
    const linked = mode === "final" && isValidLink(x.u);
    const tag = linked ? "a" : "span";
    const dim = mode === "edit" && !isValidLink(x.u) ? "opacity:.45;" : "";
    return `<${tag}${href(x.u, mode)} aria-label="${escapeHtml(x.n)}" style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;background:${color};color:${ON};font-family:${FONT};font-size:11px;font-weight:700;text-align:center;margin:0 4px;text-decoration:none;${dim}">${escapeHtml(x.n)}</${tag}>`;
  }).join("");
  return `<div style="text-align:center">${items}</div>`;
}

function columnsHtml(b: EmailBlock, mode: Mode, ctx: RenderCtx): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td class="sv-col" width="50%" valign="top" style="padding-right:8px">${paragraphHtml(b.x, mode, ctx)}</td>` +
    `<td class="sv-col" width="50%" valign="top" style="padding-left:8px">${paragraphHtml(b.y, mode, ctx)}</td></tr></table>`;
}

function imageHtml(b: EmailBlock, mode: Mode): string {
  if (b.url) {
    const img = `<img src="${escapeHtml(b.url)}" alt="${escapeHtml(b.alt ?? "")}" width="544" style="display:block;width:100%;max-width:544px;height:auto;border:0;border-radius:6px">`;
    return b.link && mode === "final" && isValidLink(b.link) ? `<a href="${escapeHtml(b.link.trim())}">${img}</a>` : img;
  }
  const g = gradient(b.g ?? 0);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" height="170" bgcolor="${g.from}" style="height:170px;border-radius:6px;background-color:${g.from};background-image:${g.css};color:${ON};font-family:${FONT};font-size:14px;font-weight:600">Image</td></tr></table>`;
}

function blockHtml(b: EmailBlock, d: Design, ctx: RenderCtx, mode: Mode): string {
  switch (b.t) {
    case "logo": return logoHtml(ctx, mode);
    case "banner": return bannerHtml(d, mode);
    case "heading": return headingHtml(b.x, mode, ctx);
    case "text": return paragraphHtml(b.x, mode, ctx);
    case "image": return imageHtml(b, mode);
    case "columns": return columnsHtml(b, mode, ctx);
    case "products": return productsHtml(b.p ?? [], mode, ctx);
    case "countdown": return countdownHtml(b.d, d.color, mode, ctx);
    case "social": return socialHtml(b.soc, d.color, mode);
    case "button": return buttonHtml(b.x, b.u, d.color, mode, ctx);
    case "divider": return dividerHtml();
    case "footer": return footerHtml(b.x, mode, ctx);
  }
}

/** One stripe of the email: a template part or a custom block. `slot`/`blockId` say what a click selects. */
export type Row = { key: string; slot?: SlotKey; blockId?: string; html: string; cond: Cond; pad: string; bg?: string };

const PAD = "14px 28px";

/** The email as a list of rows, in order. The editor wraps each row; renderCampaignHtml turns them into the email. */
export function layoutRows(d: Design, ctx: RenderCtx, mode: Mode): Row[] {
  if (d.tpl === "custom") {
    // A footer carries the unsubscribe link, so it is never limited to some contacts.
    return d.blocks.map((b) => ({ key: b.id, blockId: b.id, html: blockHtml(b, d, ctx, mode), cond: b.t === "footer" ? "" : b.cond ?? "", pad: PAD }));
  }
  const C = d.C, color = d.color, center = { center: true };
  const S = (slot: SlotKey, html: string, extra: Partial<Row> = {}): Row[] =>
    html ? [{ key: slot, slot, html, cond: slot === "footer" ? "" : d.cond[slot] ?? "", pad: PAD, ...extra }] : [];
  const lg = logoHtml(ctx, mode), bn = bannerHtml(d, mode);
  const hd = (size?: number, c = true) => headingHtml(C.headline, mode, ctx, { center: c, size });
  const bd = (c = true) => paragraphHtml(C.body, mode, ctx, c);
  const bt = (o: { center?: boolean; big?: boolean }) => buttonHtml(C.btn, C.u, color, mode, ctx, o);
  const ft = footerHtml(C.foot, mode, ctx);
  const rule: Row = { key: "rule", html: dividerHtml(), cond: "", pad: "4px 28px" };
  switch (d.tpl) {
    case "event": return [...S("logo", lg), ...S("banner", bn), ...S("headline", hd()), ...S("countdown", countdownHtml(C.d, color, mode, ctx)), ...S("body", bd()), ...S("button", bt(center)), ...S("footer", ft)];
    case "product": return [...S("logo", lg), ...S("headline", hd()), ...S("products", productsHtml(C.p, mode, ctx)), ...S("body", bd()), ...S("button", bt(center)), ...S("footer", ft)];
    case "newsletter": return [...S("logo", lg), rule, ...S("headline", hd(30)), ...S("body", bd()), ...S("banner", bn), ...S("button", bt(center)), ...S("footer", ft)];
    case "promo": return [...S("logo", lg, { bg: color }), ...S("banner", bn), ...S("headline", hd(34)), ...S("body", bd()), ...S("button", bt({ center: true, big: true })), ...S("footer", ft)];
    default: return [...S("logo", lg), ...S("banner", bn), ...S("headline", hd(undefined, false)), ...S("body", bd(false)), ...S("button", bt({})), ...S("footer", ft)];
  }
}

function rowFinal(r: Row): string {
  if (!r.html) return "";
  const td = `<tr><td style="padding:${r.pad};${r.bg ? `background:${r.bg};` : ""}font-family:${FONT}">${r.html}</td></tr>`;
  return r.cond ? `<!--sv-if:${r.cond}-->${td}<!--/sv-if-->` : td;
}

/**
 * The email as stored on the campaign (campaigns.html). It still holds the markers listed at the top
 * of this file; buildEmail resolves them for each recipient. `<!--FOOTER-->` is where the server adds
 * the business address.
 */
export function renderCampaignHtml(d: Design, ctx: RenderCtx, preheader = ""): string {
  const rows = layoutRows(d, ctx, "final").filter((r) => r.html);
  const pre = preheader.trim() ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheader)}</div>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>@media (max-width:480px){.sv-col{display:block!important;width:100%!important;padding:0 0 12px!important}}</style></head>` +
    `<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};">${pre}` +
    `<table role="presentation" class="sv-page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE}"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" class="sv-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${CARD};color:${INK};border-radius:6px;">${rows.map(rowFinal).join("")}</table>` +
    `<!--FOOTER--></td></tr></table></body></html>`;
}

/** Makes the preview look the way dark-mode mail apps tend to show the email. */
export function darkThemeCss(): string {
  const k = emailCanvas.dark;
  return `<style>body,.sv-page{background:${k.page}!important}.sv-card{background:${k.card}!important;color:${k.ink}!important}.sv-ink{color:${k.ink}!important}.sv-mute,.sv-mute a{color:${k.muted}!important}.sv-rule{border-color:${k.rule}!important}</style>`;
}

// ── Review ─────────────────────────────────────────────────────────────────

/** Every piece of text the email shows, for the variable check and the content scan. */
export function designTexts(d: Design): string[] {
  const out: string[] = [];
  const product = (p: Product[]) => p.forEach((x) => out.push(x.n, x.p));
  if (d.tpl !== "custom") {
    out.push(d.C.headline, d.C.body, d.C.btn, d.C.foot);
    if (d.tpl === "product") product(d.C.p);
  } else {
    for (const b of d.blocks) {
      if (b.x !== undefined) out.push(b.x);
      if (b.y !== undefined) out.push(b.y);
      if (b.p) product(b.p);
    }
  }
  return out;
}

export type VariableAudit = { used: string[]; missing: string[]; malformed: string[] };

/**
 * Which variables the email uses, and which of them would come out blank for a contact who has no
 * value: they need a fallback (set on the Variables tab, or written inline as {{first_name|friend}}).
 */
export function auditVariables(texts: string[], defs: VariableDef[]): VariableAudit {
  const byKey = new Map(defs.map((x) => [x.key, x]));
  const used = new Set<string>(), missing = new Set<string>(), malformed = new Set<string>();
  for (const text of texts) {
    for (const m of String(text ?? "").matchAll(/\{\{([^{}]*)\}\}/g)) {
      const [rawKey, ...rest] = m[1].split("|");
      const key = rawKey.trim().toLowerCase();
      if (!VARIABLE_KEY_RE.test(key)) { malformed.add(`{{${m[1].trim().slice(0, 40)}}}`); continue; }
      used.add(key);
      const def = byKey.get(key);
      const covered = rest.length > 0 || Boolean(def?.fallback?.trim()) || (def?.scope === "campaign" && Boolean(def.value.trim()));
      if (!covered) missing.add(key);
    }
  }
  return { used: [...used].sort(), missing: [...missing].sort(), malformed: [...malformed].sort() };
}

/** What a variable shows when a contact has no value: what the person set, else the built-in default. */
export const defaultFallback = (key: string, defs: VariableDef[]): string =>
  defs.find((x) => x.key === key)?.fallback ?? BUILT_IN_VARIABLES.find((x) => x.key === key)?.fallback ?? "";

export type ContentScan = { score: number; reasons: string[] };

/** Simple, honest checks of the wording. They don't predict inbox placement. */
export function scanContent(subject: string, preheader: string, d: Design): ContentScan {
  let score = 0;
  const reasons: string[] = [];
  const add = (n: number, t: string) => { score += n; reasons.push(t); };
  if (subject.length > 60) add(10, `Subject is long (${subject.length} characters)`);
  if (subject.length > 5 && subject === subject.toUpperCase() && /[A-Z]/.test(subject)) add(25, "Subject is all capitals");
  if ((subject.match(/!/g) ?? []).length > 1) add(15, "Several exclamation marks in the subject");
  if (/\b(free|winner|urgent|act now|guarantee|cash|100%)\b/i.test(subject)) add(20, "Subject uses spam-trigger words");
  if (!preheader.trim()) add(8, "No preheader text");
  if (d.banner.src && d.banner.src[0] !== "g" && !d.banner.alt.trim()) add(6, "Banner has no alt text");
  const text = d.tpl !== "custom" ? d.C.body : d.blocks.filter((b) => b.t === "text" || b.t === "columns").map((b) => (b.x ?? "") + (b.y ?? "")).join("");
  if (text.length < 40) add(15, "Very little text compared to images");
  return { score: Math.min(score, 100), reasons };
}

export type Tab = "tpl" | "blocks" | "edit" | "vars" | "media" | "brand";
export type Step = "setup" | "content" | "preview";
export type Check = {
  key: string;
  ok: boolean;
  /** Passes, but is worth a look. */
  warn?: boolean;
  title: string;
  detail?: string;
  /** Label of the button that takes the person to the fix. */
  fix?: string;
  go?: "setup" | "content";
  focus?: "aud" | "sender" | "subject";
  tab?: Tab;
  sel?: string;
  slot?: SlotKey;
  /** A page elsewhere in the app that fixes it. */
  href?: string;
  /** Said in "Before sending, please …" when the server refuses. */
  problem?: string;
};

export type CheckInput = {
  subject: string;
  design: Design;
  logo: Logo;
  variables: VariableDef[];
  extraTexts?: string[];
  audience: { chosen: boolean; name: string; size: number | null };
  sender: { ok: boolean; label: string; problem: string | null };
  addressSet: boolean;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** THE list of things that must be right before sending. The editor shows it; the server runs it again. */
export function reviewChecks(i: CheckInput): Check[] {
  const d = i.design;
  const hasUnsub = d.tpl !== "custom" || d.blocks.some((b) => b.t === "footer");
  const audit = auditVariables([...designTexts(d), ...(i.extraTexts ?? [])], i.variables);
  const buttons: { sel?: string; slot?: SlotKey }[] = [];
  if (d.tpl !== "custom") { if (!isValidLink(d.C.u)) buttons.push({ slot: "button" }); }
  else d.blocks.forEach((b) => { if (b.t === "button" && !isValidLink(b.u)) buttons.push({ sel: b.id }); });
  const products = d.tpl === "custom" ? d.blocks.filter((b) => b.t === "products").flatMap((b) => b.p ?? []) : d.tpl === "product" ? d.C.p : [];
  const unlinked = products.filter((x) => !isValidLink(x.u)).length;
  const size = i.audience.size;
  const reach = i.audience.chosen && (size === null || size > 0);
  const varsOk = !audit.missing.length && !audit.malformed.length;
  const varsDetail = [
    audit.missing.length ? `Missing for: ${audit.missing.map((k) => prettyKey(k)).join(", ")}` : "",
    audit.malformed.length ? `Can’t read ${audit.malformed.join(", ")}` : "",
  ].filter(Boolean).join(". ");

  const out: Check[] = [
    { key: "subject", ok: Boolean(i.subject.trim()), title: "Subject is filled in", fix: "Add a subject", go: "setup", focus: "subject", problem: "add a subject line" },
    { key: "sender", ok: i.sender.ok, title: i.sender.ok ? "Sender is ready" : "Sender isn’t ready", detail: i.sender.ok ? i.sender.label : i.sender.problem ?? "Choose who this email comes from.", fix: "Choose sender", go: "setup", focus: "sender", problem: i.sender.problem ? i.sender.problem.charAt(0).toLowerCase() + i.sender.problem.slice(1).replace(/\.$/, "") : "choose a sender" },
    { key: "audience", ok: reach, title: reach ? "Audience selected" : i.audience.chosen ? "No subscribed contacts in this audience" : "No audience selected", detail: reach ? `${i.audience.name}${size === null ? "" : ` · ${size.toLocaleString("en-US")} ${plural(size, "contact", "contacts")}`}` : i.audience.chosen ? "Choose an audience with at least one subscribed contact" : "Choose who receives this campaign", fix: "Choose audience", go: "setup", focus: "aud", problem: "choose an audience with at least one subscribed contact" },
    { key: "logo", ok: true, warn: !i.logo.src, title: i.logo.src ? "Logo added" : "No logo added", detail: i.logo.src ? "" : "You can still send, but it will go without a logo" },
    { key: "unsubscribe", ok: hasUnsub, title: "Unsubscribe link present", detail: hasUnsub ? "" : "Required before you can send", fix: "Add a footer block", tab: "blocks", go: "content", problem: "add a footer block with the unsubscribe link" },
    { key: "address", ok: i.addressSet, title: i.addressSet ? "Business address is set" : "No business address", detail: i.addressSet ? "" : "It appears at the end of every email. Add it in Settings.", fix: "Open Settings", href: "/app/settings", problem: "add your business address in Settings" },
    { key: "variables", ok: varsOk, title: "Variables used have fallbacks", detail: varsOk ? "" : varsDetail, fix: "Add fallbacks", tab: "vars", go: "content", problem: "give every variable a fallback" },
    { key: "buttons", ok: !buttons.length, title: "Button links are set", detail: buttons.length ? `${buttons.length} ${buttons.length > 1 ? "buttons have" : "button has"} no valid link (https:// or mailto:)` : "", fix: "Add link", tab: "edit", go: "content", sel: buttons[0]?.sel, slot: buttons[0]?.slot, problem: "add a valid link (https:// or mailto:) to every button" },
  ];
  if (unlinked) out.push({ key: "products", ok: true, warn: true, title: "Some products have no link", detail: `${unlinked} ${unlinked > 1 ? "products won’t" : "product won’t"} be clickable` });
  return out;
}

// ── Switching between a template and a custom layout ───────────────────────

type Plan = { H?: EmailBlock; X?: EmailBlock; Bt?: EmailBlock; F?: EmailBlock; Lg?: EmailBlock; Im?: EmailBlock; aside: EmailBlock[]; keep: string[] };

/** Which of the custom blocks a template layout would use, which it keeps aside, and what carries over. */
export function planTemplateSwitch(d: Design): Plan {
  const pk = (t: BlockType) => d.blocks.find((b) => b.t === t);
  const o = { H: pk("heading"), X: pk("text"), Bt: pk("button"), F: pk("footer"), Lg: pk("logo"), Im: pk("image") ?? pk("banner") };
  const used = new Set(Object.values(o).filter(Boolean));
  const keep = ([["H", "Heading"], ["X", "Text"], ["Bt", "Button and link"], ["F", "Footer"], ["Lg", "Logo"], ["Im", "Image"]] as const).filter(([k]) => o[k]).map(([, label]) => label);
  return { ...o, aside: d.blocks.filter((b) => !used.has(b)), keep };
}

/** What carries over when a template turns into a custom layout. */
export function customizeCarryOver(d: Design): string[] {
  return ["Headline", "Body text", "Button label and link", "Footer", "Logo"].concat(d.banner.src ? ["Banner"] : [], d.tpl === "event" ? ["Countdown date"] : [], d.tpl === "product" ? ["Products"] : []);
}

export function switchLayout(d: Design, k: Layout): Design {
  if (k === d.tpl) return d;
  const n = cloneJson(d);
  if (d.tpl === "custom") {
    const o = planTemplateSwitch(n);
    const C = n.C;
    if (o.H) { C.headline = o.H.x ?? ""; n.cond.headline = o.H.cond ?? ""; }
    if (o.X) { C.body = o.X.x ?? ""; n.cond.body = o.X.cond ?? ""; }
    if (o.Bt) { C.btn = o.Bt.x ?? ""; C.u = o.Bt.u ?? ""; n.cond.button = o.Bt.cond ?? ""; }
    if (o.F) C.foot = o.F.x ?? "";
    if (o.Im && o.Im.t === "image" && !n.banner.src) n.banner.src = `g${o.Im.g ?? 0}`;
    n.tray = o.aside;
  }
  if (k === "custom") {
    const C = n.C;
    const mk = (t: BlockType, extra: Partial<EmailBlock> = {}): EmailBlock => {
      const b: EmailBlock = { id: newId(), t, ...extra };
      if (!b.cond) delete b.cond;
      return b;
    };
    n.blocks = [
      mk("logo"),
      ...(n.banner.src ? [mk("banner")] : []),
      mk("heading", { x: C.headline, cond: n.cond.headline }),
      ...(d.tpl === "event" ? [mk("countdown", { d: C.d })] : []),
      ...(d.tpl === "product" ? [mk("products", { p: cloneJson(C.p) })] : []),
      mk("text", { x: C.body, cond: n.cond.body }),
      mk("button", { x: C.btn, u: C.u, cond: n.cond.button }),
      ...n.tray,
      mk("footer", { x: C.foot }),
    ];
    n.tray = [];
  }
  n.tpl = k;
  return n;
}

/** A new block with the same starting content as the editor's Blocks tab. */
export function newBlock(t: BlockType, d: Design): EmailBlock {
  const text: Partial<Record<BlockType, string>> = { heading: "New heading", text: "Write something here.", button: "Click here", footer: DEFAULT_FOOTER_TEXT };
  const b: EmailBlock = { id: newId(), t };
  if (text[t] !== undefined) b.x = text[t];
  if (t === "image") b.g = 0;
  if (t === "columns") { b.x = "Left column text."; b.y = "Right column text."; }
  if (t === "countdown") b.d = d.C.d;
  if (t === "social") b.soc = ["IG", "X", "FB", "YT"].map((n) => ({ n, u: "" }));
  if (t === "button") b.u = "";
  if (t === "products") b.p = cloneJson(d.C.p);
  return b;
}
