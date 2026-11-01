/**
 * The campaign design: what the editor edits and what is rendered into the email.
 *
 * A campaign is either built from one of five TEMPLATES (fixed layout, you edit the content) or is a
 * CUSTOM layout (free blocks you add, remove and reorder). Both share one brand logo, one banner and
 * one brand colour. Any section or block can be limited to some contacts ("conditions").
 *
 * Pure and dependency-free (no server code), so the editor, the preview and the sending engine all
 * agree. `renderEmailHtml` produces table-based HTML that email clients can display; the editor
 * canvas is drawn separately in React from the same Design.
 */
import { emailTheme } from "@/config/brand";
import type { Block } from "@/lib/email/blocks";
import { VARIABLE_KEY_RE, type RecipientData } from "@/lib/email/variables";

// ── Vocabulary ───────────────────────────────────────────────────────────────

export type TemplateKey = "announcement" | "newsletter" | "promo" | "event" | "product";
export type Mode = TemplateKey | "custom";
export const TEMPLATE_KEYS: TemplateKey[] = ["announcement", "newsletter", "promo", "event", "product"];
export const TEMPLATE_LABEL: Record<TemplateKey, string> = { announcement: "Announcement", newsletter: "Newsletter", promo: "Promo", event: "Event", product: "Product showcase" };
export const TEMPLATE_BLURB: Record<TemplateKey, string> = {
  announcement: "One clear message", newsletter: "Header, story and image", promo: "Bold offer, big button", event: "Countdown and details", product: "Three-product grid",
};
/** Tiny wireframe of each template for the picker: l logo, b banner, h heading, t text, B button, f footer, c countdown, p products. */
export const TEMPLATE_THUMB: Record<TemplateKey, string> = { announcement: "lbhttBf", newsletter: "lhttbBf", promo: "lbhtBf", event: "lbhcttBf", product: "lhpBf" };

export type BlockType = "logo" | "banner" | "heading" | "text" | "image" | "columns" | "products" | "countdown" | "social" | "button" | "divider" | "footer";
export const BLOCK_LABEL: Record<BlockType, string> = {
  logo: "Logo", banner: "Banner", heading: "Heading", text: "Text", image: "Image", columns: "Columns", products: "Products", countdown: "Countdown",
  social: "Social", button: "Button", divider: "Divider", footer: "Footer",
};
/** Blocks offered in the Blocks tab (logo is part of Brand). */
export const ADDABLE_BLOCKS: BlockType[] = ["heading", "text", "image", "banner", "columns", "products", "countdown", "social", "button", "divider", "footer"];
/** Blocks with their own editing form rather than a single text box. */
export const FORM_BLOCKS: BlockType[] = ["columns", "countdown", "products", "social"];

/** Preset "images": soft colour gradients used where no picture is uploaded. */
export const GRADIENTS = [
  ["#0f766e", "#34d399"], ["#334155", "#94a3b8"], ["#b45309", "#fbbf24"], ["#6d28d9", "#a78bfa"], ["#be123c", "#fb7185"], ["#1d4ed8", "#60a5fa"],
] as const;
export const gradientCss = (i: number) => {
  const g = GRADIENTS[((i % GRADIENTS.length) + GRADIENTS.length) % GRADIENTS.length];
  return `linear-gradient(135deg,${g[0]},${g[1]})`;
};

/** Brand colour choices. The first is the product's own brand colour. */
export const BRAND_COLORS = [emailTheme.action, "#1d4ed8", "#b45309", "#be123c"] as const;

export type Cond = "" | "lagos" | "nolagos" | "company" | "named";
export const CONDITIONS: { key: Cond; label: string }[] = [
  { key: "", label: "Everyone" },
  { key: "lagos", label: "Contacts in Lagos" },
  { key: "nolagos", label: "Contacts outside Lagos" },
  { key: "company", label: "Contacts with a company" },
  { key: "named", label: "Contacts with a first name" },
];
const COND_KEYS = new Set<string>(CONDITIONS.map((c) => c.key));

const field = (r: RecipientData | null | undefined, key: string): string => {
  if (!r) return "";
  if (key === "first_name") return String(r.first_name ?? "").trim();
  const cf = r.custom_fields && typeof r.custom_fields === "object" ? r.custom_fields : {};
  const hit = Object.entries(cf).find(([k]) => k.toLowerCase() === key);
  return hit ? String(hit[1] ?? "").trim() : "";
};

/** Does this contact see content that is limited to `cond`? Contacts with no data see "outside Lagos". */
export function matchesCondition(cond: Cond | undefined, r: RecipientData | null | undefined): boolean {
  if (!cond) return true;
  const inLagos = field(r, "city").toLowerCase() === "lagos";
  switch (cond) {
    case "lagos": return inLagos;
    case "nolagos": return !inLagos;
    case "company": return field(r, "company") !== "";
    case "named": return field(r, "first_name") !== "";
    default: return true;
  }
}

// ── The document ─────────────────────────────────────────────────────────────

export type Product = { n: string; p: string; u: string };
export type Social = { n: string; u: string };
export type DBlock = {
  id: number; t: BlockType;
  x?: string; y?: string; u?: string; g?: number; img?: string; d?: string; p?: Product[]; soc?: Social[]; cond?: Cond;
};
export type Content = { headline: string; body: string; btn: string; u: string; foot: string; d: string; p: Product[] };
export type Banner = { src: string; fx: number; fy: number; alt: string };
export type Logo = { src: string; align: "left" | "center" | "right"; size: "s" | "m" | "l" };
/** Shared by every campaign of the workspace. */
export type Brand = { logo: Logo };

export type Design = {
  v: 2;
  tpl: Mode;
  color: string;
  /** Content of the template layouts. */
  C: Content;
  /** Who each template section is shown to (key = section name). */
  cond: Record<string, Cond>;
  banner: Banner;
  /** The custom layout. */
  blocks: DBlock[];
  /** Custom blocks set aside while a template is in use; they come back if the layout is customised again. */
  tray: DBlock[];
  nextId: number;
};

export const emptyBrand = (): Brand => ({ logo: { src: "", align: "left", size: "m" } });
export const EMPTY_BANNER: Banner = { src: "", fx: 50, fy: 50, alt: "" };

const sampleProducts = (): Product[] => [
  { n: "Warrior tee", p: "₦12,500", u: "" }, { n: "Training band", p: "₦6,000", u: "" }, { n: "Cap", p: "₦4,500", u: "" },
];

/** What a new campaign starts as. */
export function defaultDesign(): Design {
  const C: Content = {
    headline: "Hi {{first_name}}, big news",
    body: "We’re opening a new season for {{company}} in {{city}}. Here is what’s coming and how to take part.",
    btn: "Reserve my spot",
    u: "https://example.com/reserve",
    foot: "You’re receiving this because you subscribed.",
    d: "2026-12-05",
    p: sampleProducts(),
  };
  return {
    v: 2, tpl: "announcement", color: BRAND_COLORS[0], C, cond: {}, banner: { ...EMPTY_BANNER },
    blocks: [
      { id: 1, t: "logo" }, { id: 2, t: "heading", x: C.headline }, { id: 3, t: "text", x: C.body }, { id: 4, t: "image", g: 0 },
      { id: 5, t: "button", x: C.btn, u: C.u }, { id: 6, t: "footer", x: C.foot },
    ],
    tray: [], nextId: 10,
  };
}

// ── Validation (used on the server for everything the browser sends) ─────────

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const BLOCK_TYPES = new Set<string>(Object.keys(BLOCK_LABEL));

/** A link people can click: https:// or mailto: only. Anything else (javascript:, data:…) is dropped. */
export const isLink = (u: string | undefined) => /^(https?:\/\/[^\s"<>]+|mailto:[^\s"<>]+)$/i.test((u ?? "").trim());
export const isHttps = (u: string | undefined) => /^https:\/\/[^\s"<>]+$/i.test((u ?? "").trim());

function cleanProducts(v: unknown): Product[] {
  if (!Array.isArray(v)) return sampleProducts();
  return v.slice(0, 6).map((x) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return { n: str(o.n, 80), p: str(o.p, 40), u: str(o.u, 2000) };
  });
}

function cleanBlock(raw: unknown, assetOk: (u: string) => boolean): DBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const t = String(o.t);
  if (!BLOCK_TYPES.has(t)) return null;
  const b: DBlock = { id: num(o.id, 1, 1_000_000, 0), t: t as BlockType };
  if (typeof o.x === "string") b.x = str(o.x, 8000);
  if (typeof o.y === "string") b.y = str(o.y, 8000);
  if (typeof o.u === "string") b.u = str(o.u, 2000);
  if (typeof o.g === "number") b.g = num(o.g, 0, GRADIENTS.length - 1, 0);
  if (typeof o.img === "string" && assetOk(o.img)) b.img = o.img;
  if (typeof o.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.d)) b.d = o.d;
  if (Array.isArray(o.p)) b.p = cleanProducts(o.p);
  if (Array.isArray(o.soc)) b.soc = o.soc.slice(0, 8).map((s) => ({ n: str((s as Record<string, unknown>)?.n, 4), u: str((s as Record<string, unknown>)?.u, 2000) }));
  if (typeof o.cond === "string" && COND_KEYS.has(o.cond) && o.cond) b.cond = o.cond as Cond;
  return b;
}

/**
 * Turns whatever the browser sent into a valid Design. `assetOk` says which picture URLs are allowed
 * (the workspace's own uploads), so an email can't be made to load arbitrary remote images.
 */
export function sanitizeDesign(input: unknown, assetOk: (url: string) => boolean = () => false): Design {
  const d0 = defaultDesign();
  if (!input || typeof input !== "object") return d0;
  const o = input as Record<string, any>;
  const tpl: Mode = o.tpl === "custom" || TEMPLATE_KEYS.includes(o.tpl) ? o.tpl : d0.tpl;
  const c = (o.C && typeof o.C === "object" ? o.C : {}) as Record<string, unknown>;
  const C: Content = {
    headline: str(c.headline, 300), body: str(c.body, 8000), btn: str(c.btn, 100), u: str(c.u, 2000), foot: str(c.foot, 1000),
    d: typeof c.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.d) ? c.d : d0.C.d, p: cleanProducts(c.p),
  };
  const cond: Record<string, Cond> = {};
  if (o.cond && typeof o.cond === "object") {
    for (const [k, v] of Object.entries(o.cond as Record<string, unknown>)) if (/^[a-z]{3,12}$/.test(k) && typeof v === "string" && COND_KEYS.has(v) && v) cond[k] = v as Cond;
  }
  const b = (o.banner && typeof o.banner === "object" ? o.banner : {}) as Record<string, unknown>;
  const bsrc = str(b.src, 2000);
  const banner: Banner = {
    src: /^g[0-5]$/.test(bsrc) || (isHttps(bsrc) && assetOk(bsrc)) ? bsrc : "",
    fx: num(b.fx, 0, 100, 50), fy: num(b.fy, 0, 100, 50), alt: str(b.alt, 300),
  };
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 60).map((x) => cleanBlock(x, assetOk)).filter((x): x is DBlock => !!x) : []);
  let blocks = list(o.blocks);
  const tray = list(o.tray);
  // Block ids must be unique, because the editor addresses blocks by id.
  let next = num(o.nextId, 10, 1_000_000, 10);
  const seen = new Set<number>();
  const fix = (arr: DBlock[]) => arr.map((x) => { if (!x.id || seen.has(x.id)) x = { ...x, id: ++next }; seen.add(x.id); next = Math.max(next, x.id); return x; });
  blocks = fix(blocks);
  const trayFixed = fix(tray);
  const color = typeof o.color === "string" && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : d0.color;
  return { v: 2, tpl, color, C, cond, banner, blocks, tray: trayFixed, nextId: next };
}

export function sanitizeBrand(input: unknown, assetOk: (url: string) => boolean = () => false): Brand {
  const l = ((input as Record<string, any> | null)?.logo ?? {}) as Record<string, unknown>;
  const src = str(l.src, 2000);
  return {
    logo: {
      src: isHttps(src) && assetOk(src) ? src : "",
      align: l.align === "center" || l.align === "right" ? l.align : "left",
      size: l.size === "s" || l.size === "l" ? l.size : "m",
    },
  };
}

// ── Editing operations (pure; the editor keeps the history) ──────────────────

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const BLOCK_DEFAULT_TEXT: Partial<Record<BlockType, string>> = {
  heading: "New heading", text: "Write something here.", button: "Click here", footer: "You’re receiving this because you subscribed.",
};

export function newBlock(d: Design, t: BlockType): DBlock {
  const b: DBlock = { id: d.nextId + 1, t };
  if (BLOCK_DEFAULT_TEXT[t]) b.x = BLOCK_DEFAULT_TEXT[t];
  if (t === "image") b.g = 0;
  if (t === "columns") { b.x = "Left column text."; b.y = "Right column text."; }
  if (t === "countdown") b.d = d.C.d;
  if (t === "social") b.soc = ["IG", "X", "FB", "YT"].map((n) => ({ n, u: "" }));
  if (t === "button") b.u = "";
  if (t === "products") b.p = clone(d.C.p);
  return b;
}

/** What each template slot edits in `C`. */
export const SLOT_KEY: Record<string, keyof Content> = { headline: "headline", body: "body", button: "btn", footer: "foot" };
export const SLOT_LABEL: Record<string, string> = { headline: "Headline", body: "Body", button: "Button label", footer: "Footer" };

/** How a custom layout would fold back into a template: the first of each kind is used, the rest are set aside. */
export function planToTemplate(d: Design) {
  const B = d.blocks;
  const pick = (t: BlockType) => B.find((b) => b.t === t);
  const o = { H: pick("heading"), X: pick("text"), Bt: pick("button"), F: pick("footer"), Lg: pick("logo"), Im: pick("image") ?? pick("banner") };
  const used = new Set(Object.values(o).filter(Boolean));
  const aside = B.filter((b) => !used.has(b));
  const keep = ([["H", "Heading"], ["X", "Text"], ["Bt", "Button and link"], ["F", "Footer"], ["Lg", "Logo"], ["Im", "Image"]] as const).filter(([k]) => o[k]).map(([, label]) => label);
  return { ...o, aside, keep };
}

/** What changes when switching to `to`, for the confirmation dialog. */
export function switchSummary(d: Design, to: Mode) {
  if (to === "custom") {
    const keep = ["Headline", "Body text", "Button label and link", "Footer", "Logo", ...(d.banner.src ? ["Banner"] : []), ...(d.tpl === "event" ? ["Countdown date"] : []), ...(d.tpl === "product" ? ["Products"] : [])];
    return { keep, aside: [] as string[], restored: d.tray.map((b) => BLOCK_LABEL[b.t]) };
  }
  const p = planToTemplate(d);
  return { keep: p.keep as string[], aside: p.aside.map((b) => BLOCK_LABEL[b.t]), restored: [] as string[] };
}

/** Switches layout, carrying content across. Returns a new Design. */
export function switchTemplate(d0: Design, to: Mode): Design {
  if (to === d0.tpl) return d0;
  const d = clone(d0);
  if (d.tpl === "custom") {
    const o = planToTemplate(d);
    if (o.H) { d.C.headline = o.H.x ?? ""; setCond(d, "headline", o.H.cond); }
    if (o.X) { d.C.body = o.X.x ?? ""; setCond(d, "body", o.X.cond); }
    if (o.Bt) { d.C.btn = o.Bt.x ?? ""; d.C.u = o.Bt.u ?? ""; setCond(d, "button", o.Bt.cond); }
    if (o.F) d.C.foot = o.F.x ?? "";
    if (o.Im && o.Im.t === "image" && !d.banner.src) d.banner.src = `g${o.Im.g ?? 0}`;
    d.tray = o.aside;
  }
  if (to === "custom") {
    const C = d.C;
    let id = d.nextId;
    const mk = (t: BlockType, x: Partial<DBlock> = {}): DBlock => ({ id: ++id, t, ...x });
    const withCond = (c: Cond | undefined): Partial<DBlock> => (c ? { cond: c } : {});
    d.blocks = [
      mk("logo"),
      ...(d.banner.src ? [mk("banner")] : []),
      mk("heading", { x: C.headline, ...withCond(d.cond.headline) }),
      ...(d.tpl === "event" ? [mk("countdown", { d: C.d })] : []),
      ...(d.tpl === "product" ? [mk("products", { p: clone(C.p) })] : []),
      mk("text", { x: C.body, ...withCond(d.cond.body) }),
      mk("button", { x: C.btn, u: C.u, ...withCond(d.cond.button) }),
      ...d.tray,
      mk("footer", { x: C.foot }),
    ];
    d.tray = [];
    d.nextId = id;
  }
  d.tpl = to;
  return d;
}

function setCond(d: Design, slot: string, c: Cond | undefined) {
  if (c) d.cond[slot] = c; else delete d.cond[slot];
}

// ── Email HTML ───────────────────────────────────────────────────────────────

export const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const text = (s: string | undefined) => escapeAttr(String(s ?? "")).replace(/\r?\n/g, "<br>");
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const T = emailTheme;

type Ctx = { d: Design; brand: Brand };

const href = (u: string | undefined) => (isLink(u) ? ` href="${escapeAttr((u ?? "").trim())}"` : "");

function logoHtml({ brand }: Ctx): string {
  const L = brand.logo;
  if (!isHttps(L.src)) return "";
  const w = { s: 80, m: 120, l: 170 }[L.size];
  return `<div style="text-align:${L.align};"><img src="${escapeAttr(L.src)}" alt="Logo" width="${w}" style="display:inline-block;width:${w}px;max-width:100%;height:auto;border:0;"></div>`;
}

function bannerHtml({ d }: Ctx): string {
  const B = d.banner;
  if (!B.src) return "";
  if (B.src[0] === "g") {
    const g = GRADIENTS[Number(B.src.slice(1)) % GRADIENTS.length];
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="170" bgcolor="${g[0]}" style="height:170px;border-radius:6px;background:${gradientCss(Number(B.src.slice(1)))};font-size:1px;line-height:1px;">&nbsp;</td></tr></table>`;
  }
  return `<img src="${escapeAttr(B.src)}" alt="${escapeAttr(B.alt)}" width="544" style="display:block;width:100%;height:auto;aspect-ratio:3/1;object-fit:cover;object-position:${B.fx}% ${B.fy}%;border:0;border-radius:6px;">`;
}

function gradientBox(i: number, height: number, round = 6): string {
  const g = GRADIENTS[i % GRADIENTS.length];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="${height}" bgcolor="${g[0]}" style="height:${height}px;border-radius:${round}px;background:${gradientCss(i)};font-size:1px;line-height:1px;">&nbsp;</td></tr></table>`;
}

function buttonHtml({ d }: Ctx, label: string, url: string | undefined, o: { align?: string; big?: boolean } = {}): string {
  const pad = o.big ? "14px 40px" : "10px 20px";
  const size = o.big ? 16 : 15;
  return `<table role="presentation" cellpadding="0" cellspacing="0"${o.align === "center" ? ' align="center"' : ""}><tr><td bgcolor="${d.color}" style="background:${d.color};border-radius:6px;"><a${href(url)} style="display:inline-block;padding:${pad};font-family:${FONT};font-size:${size}px;font-weight:600;color:${T.onAction};text-decoration:none;">${text(label)}</a></td></tr></table>`;
}

const heading = (s: string, o: { center?: boolean; size?: number } = {}) =>
  `<h2 class="sv-t" style="margin:0;font-family:${FONT};font-size:${o.size ?? 26}px;line-height:1.2;font-weight:700;color:${T.heading};${o.center ? "text-align:center;" : ""}">${text(s)}</h2>`;
const paragraph = (s: string, center = false) =>
  `<p class="sv-t" style="margin:0;font-family:${FONT};font-size:16px;line-height:1.6;color:${T.body};${center ? "text-align:center;" : ""}">${text(s)}</p>`;

function countdownHtml({ d }: Ctx, date: string): string {
  const cell = (k: "d" | "h" | "m", label: string) =>
    `<td align="center" width="76" bgcolor="${d.color}" style="background:${d.color};border-radius:8px;padding:10px 0;font-family:${FONT};color:#ffffff;"><div style="font-size:24px;font-weight:700;line-height:1.2;">[[cd:${k}:${date}]]</div><div style="font-size:11px;opacity:.85;">${label}</div></td>`;
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>${cell("d", "Days")}<td width="10">&nbsp;</td>${cell("h", "Hours")}<td width="10">&nbsp;</td>${cell("m", "Mins")}</tr></table>`;
}

function productsHtml(ps: Product[]): string {
  if (!ps.length) return "";
  const cells = ps.map((x, i) => {
    const inner = `${gradientBox((i * 2) % 6, 120, 8)}<div class="sv-t" style="margin-top:6px;font-family:${FONT};font-weight:600;color:${T.heading};">${text(x.n)}</div><div class="sv-m" style="font-family:${FONT};color:${T.muted};">${text(x.p)}</div>`;
    return `<td class="sv-col" valign="top" width="${Math.floor(100 / ps.length)}%" align="center" style="padding:0 6px;">${isLink(x.u) ? `<a${href(x.u)} style="color:inherit;text-decoration:none;display:block;">${inner}</a>` : inner}</td>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells.join("")}</tr></table>`;
}

function socialHtml({ d }: Ctx, soc: Social[]): string {
  const items = soc.filter((s) => isLink(s.u)).map((s) =>
    `<a${href(s.u)} aria-label="${escapeAttr(s.n)}" style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;background:${d.color};color:#ffffff;font-family:${FONT};font-size:11px;font-weight:700;margin:0 4px;text-decoration:none;text-align:center;">${escapeAttr(s.n)}</a>`);
  return items.length ? `<div style="text-align:center;">${items.join("")}</div>` : "";
}

function columnsHtml(x: string, y: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="sv-col" valign="top" width="50%" style="padding-right:8px;">${paragraph(x)}</td><td class="sv-col" valign="top" width="50%" style="padding-left:8px;">${paragraph(y)}</td></tr></table>`;
}

/** The unsubscribe line. The sender replaces the marker with the real unsubscribe link and business address. */
const footerHtml = (s: string) => `<p class="sv-m" style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${T.muted};text-align:center;">${text(s)}<br><!--UNSUB--></p>`;

/** One table row. A condition wraps the whole row so recipients outside it never receive it. */
function row(inner: string, cond?: Cond, pad = "14px 28px"): string {
  if (!inner) return "";
  const tr = `<tr><td style="padding:${pad};">${inner}</td></tr>`;
  return cond ? `<!--sv-if:${cond}-->${tr}<!--/sv-if-->` : tr;
}

function blockHtml(c: Ctx, b: DBlock): string {
  switch (b.t) {
    case "logo": return logoHtml(c);
    case "banner": return bannerHtml(c);
    case "columns": return columnsHtml(b.x ?? "", b.y ?? "");
    case "countdown": return countdownHtml(c, b.d ?? c.d.C.d);
    case "products": return productsHtml(b.p ?? []);
    case "social": return socialHtml(c, b.soc ?? []);
    case "heading": return heading(b.x ?? "");
    case "text": return paragraph(b.x ?? "");
    case "image": return b.img && isHttps(b.img) ? `<img src="${escapeAttr(b.img)}" alt="" width="544" style="display:block;width:100%;height:auto;border:0;border-radius:6px;">` : gradientBox(b.g ?? 0, 170);
    case "button": return buttonHtml(c, b.x ?? "", b.u);
    case "divider": return `<hr class="sv-hr" style="border:0;border-top:1px solid ${T.rule};margin:4px 0;">`;
    case "footer": return footerHtml(b.x ?? "");
  }
}

/** The rows of a template layout, in order. */
function templateRows(c: Ctx): string {
  const { d } = c;
  const C = d.C;
  const S = (slot: string, html: string, pad?: string) => row(html, d.cond[slot], pad);
  const lg = logoHtml(c);
  const bn = bannerHtml(c);
  const btn = (center = true, big = false) => `<div style="text-align:${center ? "center" : "left"};">${buttonHtml(c, C.btn, C.u, { align: center ? "center" : undefined, big })}</div>`;
  const foot = footerHtml(C.foot);
  switch (d.tpl) {
    case "event":
      return S("logo", lg) + S("banner", bn) + S("headline", heading(C.headline, { center: true })) + S("countdown", countdownHtml(c, C.d)) + S("body", paragraph(C.body, true)) + S("button", btn()) + S("footer", foot);
    case "product":
      return S("logo", lg) + S("headline", heading(C.headline, { center: true })) + S("products", productsHtml(C.p)) + S("body", paragraph(C.body, true)) + S("button", btn()) + S("footer", foot);
    case "newsletter":
      return S("logo", lg) + row(`<hr class="sv-hr" style="border:0;border-top:1px solid ${T.rule};margin:4px 0;">`) + S("headline", heading(C.headline, { center: true, size: 30 })) + S("body", paragraph(C.body, true)) + S("banner", bn) + S("button", btn()) + S("footer", foot);
    case "promo":
      return (lg ? `<tr><td bgcolor="${d.color}" style="background:${d.color};padding:14px 28px;">${lg}</td></tr>` : "") + S("banner", bn) + S("headline", heading(C.headline, { center: true, size: 34 })) + S("body", paragraph(C.body, true)) + S("button", `<div style="text-align:center;">${buttonHtml(c, C.btn, C.u, { align: "center", big: true })}</div>`) + S("footer", foot);
    default:
      return S("logo", lg) + S("banner", bn) + S("headline", heading(C.headline)) + S("body", paragraph(C.body)) + S("button", btn(false)) + S("footer", foot);
  }
}

/**
 * The whole email as table-based HTML. Variables stay as {{tokens}} (filled in per recipient),
 * conditional rows are wrapped in <!--sv-if:…--> markers, countdown numbers are [[cd:…]] markers and
 * the unsubscribe line holds <!--UNSUB-->; see applyConditions / resolveCountdowns / buildEmail.
 */
export function renderEmailHtml(d: Design, brand: Brand, opts: { preheader?: string } = {}): string {
  const c: Ctx = { d, brand };
  const rows = d.tpl === "custom" ? d.blocks.map((b) => row(blockHtml(c, b), b.cond)).join("") : templateRows(c);
  const pre = opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;">${escapeAttr(opts.preheader)}</div>` : "";
  const css = `<style>@media only screen and (max-width:620px){.sv-w{width:100%!important}.sv-col{display:block!important;width:100%!important;padding:6px 0!important}}</style>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head>` +
    `<body class="sv-body" style="margin:0;padding:0;background:${T.pageBackground};font-family:${FONT};">${pre}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" class="sv-w sv-card" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${T.card};border-radius:6px;">${rows}</table>` +
    `</td></tr></table></body></html>`;
}

// ── Per-recipient steps (run at preview, test and send time) ─────────────────

/** Keeps only the sections this recipient is meant to see. */
export function applyConditions(html: string, r: RecipientData | null | undefined): string {
  return html.replace(/<!--sv-if:(\w+)-->([\s\S]*?)<!--\/sv-if-->/g, (_m, cond: string, inner: string) => (matchesCondition(cond as Cond, r) ? inner : ""));
}

/** UTC instant for a wall-clock date and time in an IANA time zone. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(guess.getTime())) return guess;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const offsetAt = (t: Date) => {
      const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t.getTime();
    };
    let t = new Date(guess.getTime() - offsetAt(guess));
    t = new Date(guess.getTime() - offsetAt(t));
    return t;
  } catch {
    return guess;
  }
}

/** Fills the countdown numbers for "now" (so each email shows the time left when it is sent). */
export function resolveCountdowns(html: string, opts: { now?: number; tz?: string } = {}): string {
  const now = opts.now ?? Date.now();
  return html.replace(/\[\[cd:([dhm]):(\d{4}-\d{2}-\d{2})\]\]/g, (_m, unit: string, date: string) => {
    const ms = Math.max(0, zonedToUtc(date, "09:00", opts.tz || "UTC").getTime() - now);
    return String(unit === "d" ? Math.floor(ms / 864e5) : unit === "h" ? Math.floor(ms / 36e5) % 24 : Math.floor(ms / 6e4) % 60);
  });
}

// ── Reading a design (checks and variables) ──────────────────────────────────

/** Every piece of text in the email, for finding the variables it uses. */
export function designStrings(d: Design): string[] {
  if (d.tpl !== "custom") return [d.C.headline, d.C.body, d.C.btn, d.C.foot, d.C.u, ...(d.tpl === "product" ? d.C.p.flatMap((p) => [p.n, p.p, p.u]) : [])];
  return d.blocks.flatMap((b) => [b.x ?? "", b.y ?? "", b.u ?? "", ...(b.p ?? []).flatMap((p) => [p.n, p.p, p.u]), ...(b.soc ?? []).map((s) => s.u)]);
}

export const hasUnsubscribeBlock = (d: Design) => d.tpl !== "custom" || d.blocks.some((b) => b.t === "footer");

/** Buttons whose link isn't a valid https:// or mailto: address. `slot`/`id` say where to fix it. */
export function badButtons(d: Design): { slot?: string; id?: number }[] {
  if (d.tpl !== "custom") return isLink(d.C.u) ? [] : [{ slot: "button" }];
  return d.blocks.filter((b) => b.t === "button" && !isLink(b.u)).map((b) => ({ id: b.id }));
}

export function productsMissingLinks(d: Design): number {
  const ps = d.tpl === "custom" ? d.blocks.filter((b) => b.t === "products").flatMap((b) => b.p ?? []) : d.tpl === "product" ? d.C.p : [];
  return ps.filter((p) => !isLink(p.u)).length;
}

/** Basic content checks shown in the review. They look for common mistakes; they don't predict inbox placement. */
export function contentChecks(d: Design, subject: string, preheader: string): { score: number; notes: string[] } {
  const notes: string[] = [];
  let p = 0;
  const add = (n: number, t: string) => { p += n; notes.push(t); };
  if (subject.length > 60) add(10, `Subject is long (${subject.length} characters)`);
  if (subject.length > 5 && subject === subject.toUpperCase() && /[A-Z]/.test(subject)) add(25, "Subject is all capitals");
  if ((subject.match(/!/g) ?? []).length > 1) add(15, "Several exclamation marks in the subject");
  if (/\b(free|winner|urgent|act now|guarantee|cash|100%)\b/i.test(subject)) add(20, "Subject uses spam-trigger words");
  if (!preheader.trim()) add(8, "No preheader text");
  if (d.banner.src && d.banner.src[0] !== "g" && !d.banner.alt.trim()) add(6, "Banner has no alt text");
  const body = d.tpl !== "custom" ? d.C.body : d.blocks.filter((b) => b.t === "text" || b.t === "columns").map((b) => (b.x ?? "") + (b.y ?? "")).join("");
  if (body.length < 40) add(15, "Very little text compared to images");
  return { score: Math.min(p, 100), notes };
}

// ── Saved templates (the block-based Templates page) ─────────────────────────

/** A custom design from simple blocks, used when starting from a saved or starter template. */
export function blocksToDesign(blocks: Block[], opts: { color?: string } = {}): Design {
  const d = defaultDesign();
  let id = 0;
  const out: DBlock[] = [{ id: ++id, t: "logo" }];
  for (const b of blocks) {
    if (b.type === "heading") out.push({ id: ++id, t: "heading", x: b.text });
    else if (b.type === "text") out.push({ id: ++id, t: "text", x: b.text });
    else if (b.type === "button") out.push({ id: ++id, t: "button", x: b.label, u: b.url });
    else if (b.type === "divider") out.push({ id: ++id, t: "divider" });
    else if (b.type === "image" && isHttps(b.url)) out.push({ id: ++id, t: "image", img: b.url });
  }
  out.push({ id: ++id, t: "footer", x: d.C.foot });
  return { ...d, tpl: "custom", color: opts.color ?? d.color, blocks: out, nextId: id + 10 };
}

/** The simple blocks that best describe a design, so a saved template keeps working on the Templates page. */
export function designToBlocks(d: Design): Block[] {
  const mk = (): string => Math.random().toString(36).slice(2, 10);
  if (d.tpl !== "custom") {
    const out: Block[] = [];
    if (d.C.headline) out.push({ id: mk(), type: "heading", text: d.C.headline });
    if (d.C.body) out.push({ id: mk(), type: "text", text: d.C.body });
    if (d.C.btn) out.push({ id: mk(), type: "button", label: d.C.btn, url: d.C.u });
    return out;
  }
  const out: Block[] = [];
  for (const b of d.blocks) {
    if (b.t === "heading") out.push({ id: mk(), type: "heading", text: b.x ?? "" });
    else if (b.t === "text") out.push({ id: mk(), type: "text", text: b.x ?? "" });
    else if (b.t === "button") out.push({ id: mk(), type: "button", label: b.x ?? "", url: b.u ?? "" });
    else if (b.t === "divider") out.push({ id: mk(), type: "divider" });
    else if (b.t === "image" && b.img) out.push({ id: mk(), type: "image", url: b.img, alt: "" });
  }
  return out;
}

export { VARIABLE_KEY_RE };
