/**
 * Template variables. Pure functions with no server dependencies, so the editor preview (browser)
 * and the sending engine (server) resolve every {{variable}} identically.
 *
 * Syntax        {{first_name}}   {{first_name|there}}   {{offer_code}}
 *
 * Two kinds of variable
 *  - recipient: filled from the person receiving the email. first_name, last_name and email are
 *    built in; any extra column in an imported CSV becomes a custom contact field (company, plan…).
 *  - campaign:  a value the sender types once (offer_code, event_date…) that is the same for everyone.
 *
 * What an email shows for {{key}}, in this order (the first one that has text wins)
 *  1. the recipient's own value, when they have one
 *  2. the campaign value, when the variable is a campaign variable
 *  3. the fallback written in the email: {{key|fallback}}. An empty one, {{key|}}, means "show nothing"
 *  4. the variable's default fallback (Variables tab); first_name defaults to "there"
 *  5. nothing
 */
import type { Block } from "@/lib/email/blocks";

export const VARIABLE_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
export const MAX_VARIABLES = 40;

export type VariableScope = "recipient" | "campaign";
export type VariableDef = { key: string; scope: VariableScope; value: string; fallback: string };

export const BUILT_IN_VARIABLES = [
  { key: "first_name", label: "First name", fallback: "there" },
  { key: "last_name", label: "Last name", fallback: "" },
  { key: "email", label: "Email address", fallback: "" },
] as const;
const BUILT_IN_KEYS = new Set<string>(BUILT_IN_VARIABLES.map((v) => v.key));
export const isBuiltInVariable = (key: string) => BUILT_IN_KEYS.has(key);

/** The person an email is for. `custom_fields` comes straight from the contact row. */
export type RecipientData = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  custom_fields?: Record<string, unknown> | null;
};

const clean = (v: unknown, max: number) =>
  (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);

/** Validates variable definitions coming from the browser or the database. Bad entries are dropped. */
export function sanitizeVariables(input: unknown): VariableDef[] {
  if (!Array.isArray(input)) return [];
  const out: VariableDef[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, MAX_VARIABLES * 2)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const key = clean(r.key, 40).toLowerCase();
    if (!VARIABLE_KEY_RE.test(key) || seen.has(key)) continue;
    const builtIn = BUILT_IN_KEYS.has(key);
    // A campaign variable can't reuse a built-in name: it would silently compete with the person's own data.
    const scope: VariableScope = builtIn || r.scope === "recipient" ? "recipient" : "campaign";
    seen.add(key);
    out.push({ key, scope, value: scope === "campaign" ? clean(r.value, 500) : "", fallback: clean(r.fallback, 100) });
    if (out.length >= MAX_VARIABLES) break;
  }
  return out;
}

/** What each recipient-level variable resolves from, as plain trimmed text. */
export function recipientValues(r: RecipientData): Record<string, string> {
  const out: Record<string, string> = {};
  if (r.custom_fields && typeof r.custom_fields === "object") {
    for (const [k, v] of Object.entries(r.custom_fields)) {
      const key = k.toLowerCase();
      if (VARIABLE_KEY_RE.test(key)) out[key] = clean(v, 500);
    }
  }
  // Built-ins win over a custom field that happens to share a name.
  out.first_name = clean(r.first_name, 100);
  out.last_name = clean(r.last_name, 100);
  out.email = clean(r.email, 254);
  return out;
}

/** Resolves one variable. `inline` is undefined when the email wrote no fallback, "" when it wrote {{key|}}. */
export function resolveVariable(key: string, inline: string | undefined, values: Record<string, string>, defs: Map<string, VariableDef>): string {
  const own = values[key];
  if (own) return own;
  const def = defs.get(key);
  if (def?.scope === "campaign" && def.value) return def.value;
  if (inline !== undefined) return inline.trim();
  if (def?.fallback) return def.fallback;
  const builtIn = BUILT_IN_VARIABLES.find((v) => v.key === key);
  return builtIn?.fallback ?? "";
}

/** Matches {{key}} and {{key|fallback}}. The key is case-insensitive; the fallback can't contain "}". */
export const VARIABLE_TOKEN_RE = /\{\{\s*([A-Za-z][A-Za-z0-9_]{0,39})\s*(?:\|([^}]*))?\}\}/g;
const ANY_TOKEN_RE = /\{\{([^{}]*)\}\}/g;

export function defsMap(defs: VariableDef[]): Map<string, VariableDef> {
  return new Map(defs.map((d) => [d.key, d]));
}

/** Every string in a block list that ends up in the email (so the checks below see all of it). */
export function blockStrings(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "text") out.push(b.text);
    else if (b.type === "button") out.push(b.label, b.url);
    else if (b.type === "image") out.push(b.alt, b.url, b.link ?? "");
  }
  return out;
}

export type VariableReport = {
  /** Every distinct variable the email uses. */
  used: string[];
  /** Used with no value anywhere and no fallback: the email would show a blank where it appears. */
  undefinedKeys: string[];
  /** Things that look like variables but can't be read, such as {{first name}}: they'd show as raw text. */
  malformed: string[];
};

/**
 * Checks the text of an email against the variables that exist.
 * `known` = built-in + custom contact fields + defined campaign variables (lower-case keys).
 */
export function analyzeVariables(texts: string[], known: ReadonlySet<string>, defs: VariableDef[] = []): VariableReport {
  const used = new Set<string>();
  const undefinedKeys = new Set<string>();
  const malformed = new Set<string>();
  const byKey = defsMap(defs);
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(ANY_TOKEN_RE)) {
      const inner = m[1];
      const [rawKey, ...rest] = inner.split("|");
      const key = rawKey.trim().toLowerCase();
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) { malformed.add(`{{${inner.trim().slice(0, 40)}}}`); continue; }
      used.add(key);
      const hasInline = rest.length > 0;
      const hasDefault = Boolean(byKey.get(key)?.fallback || byKey.get(key)?.value);
      if (!known.has(key) && !hasInline && !hasDefault) undefinedKeys.add(key);
    }
  }
  return { used: [...used].sort(), undefinedKeys: [...undefinedKeys].sort(), malformed: [...malformed].sort() };
}

/** Lower-case keys of everything an email may legitimately use. */
export function knownKeys(customFieldKeys: readonly string[], defs: VariableDef[]): Set<string> {
  return new Set<string>([...BUILT_IN_KEYS, ...customFieldKeys.map((k) => k.toLowerCase()), ...defs.map((d) => d.key)]);
}

/** A readable key from whatever the person typed: "Offer code" becomes "offer_code". */
export function toVariableKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "")
    .slice(0, 40);
}
