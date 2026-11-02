/**
 * The company profile: the details every campaign depends on (logo, address, contact details, brand colour,
 * footer line). Pure and dependency-free, so the Settings form, the server actions and the tests use the
 * same rules.
 */

export type CompanyProfile = {
  name: string;
  website: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type AddressParts = Pick<CompanyProfile, "line1" | "line2" | "city" | "region" | "postalCode" | "country">;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** Collapses whitespace, strips control characters and caps the length. */
export function cleanText(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return (typeof v === "string" ? v : "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** The one-line address printed in every email footer. Empty when nothing was entered. */
export function formatAddress(a: Partial<AddressParts>): string {
  const cityLine = [a.city, [a.region, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [a.line1, a.line2, cityLine, a.country].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** A web address people can open. Adds https:// when the person left it off. Empty is allowed. */
export function checkWebsite(raw: string): Checked<string> {
  const v = cleanText(raw, 300);
  if (!v) return { ok: true, value: "" };
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || /["'<>\s]/.test(withScheme)) throw new Error("bad");
    return { ok: true, value: withScheme };
  } catch {
    return { ok: false, error: "Enter a website address like https://example.com." };
  }
}

export function checkEmail(raw: string): Checked<string> {
  const v = cleanText(raw, 254).toLowerCase();
  if (!v) return { ok: true, value: "" };
  return EMAIL_RE.test(v) ? { ok: true, value: v } : { ok: false, error: "Enter a valid contact email address." };
}

export function checkPhone(raw: string): Checked<string> {
  const v = cleanText(raw, 40);
  if (!v) return { ok: true, value: "" };
  return /^[+()\d][\d\s().\-+]{4,}$/.test(v) && v.replace(/\D/g, "").length >= 6
    ? { ok: true, value: v }
    : { ok: false, error: "Enter a phone number using digits, spaces and + ( ) - only." };
}

/** Validates the company details form. Everything but the name is optional; a partly written address is not. */
export function checkCompany(input: Record<string, unknown>): Checked<CompanyProfile> {
  const name = cleanText(input.name, 80);
  if (!name) return { ok: false, error: "Enter your business name." };
  const website = checkWebsite(String(input.website ?? ""));
  if (!website.ok) return website;
  const email = checkEmail(String(input.email ?? ""));
  if (!email.ok) return email;
  const phone = checkPhone(String(input.phone ?? ""));
  if (!phone.ok) return phone;

  const address: AddressParts = {
    line1: cleanText(input.line1, 120), line2: cleanText(input.line2, 120), city: cleanText(input.city, 80),
    region: cleanText(input.region, 80), postalCode: cleanText(input.postalCode, 20), country: cleanText(input.country, 80),
  };
  const any = Object.values(address).some(Boolean);
  if (any && (!address.line1 || !address.city || !address.country)) {
    return { ok: false, error: "A business address needs a street, a city and a country. Fill those in, or clear the address." };
  }
  return { ok: true, value: { name, website: website.value, email: email.value, phone: phone.value, ...address } };
}

/** The brand colour as stored: lower-case hex, or null for "use the default". */
export function checkBrandColor(raw: unknown, fallback: string): Checked<string | null> {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return { ok: true, value: null };
  if (!HEX_COLOR_RE.test(v)) return { ok: false, error: "Choose a colour from the picker." };
  return { ok: true, value: v.toLowerCase() === fallback.toLowerCase() ? null : v.toLowerCase() };
}

export const FOOTER_TEXT_MAX = 500;

/**
 * Time zones offered in Settings. A workspace that already has another valid zone keeps it (the page adds it to
 * the list), so nobody is forced to change.
 */
export const TIME_ZONES = [
  "Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Africa/Casablanca",
  "UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Istanbul",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Shanghai", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo",
] as const;

export function isTimeZone(z: string): boolean {
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){0,2}$/.test(z)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: z });
    return true;
  } catch {
    return false;
  }
}

/** What the campaign editor can insert as {{company_name}} and so on. Only details that are filled in. */
export type CompanyVariable = { key: string; scope: "campaign"; value: string; fallback: string };

export function companyVariables(c: { name?: string | null; address?: string | null; phone?: string | null; email?: string | null; website?: string | null }): CompanyVariable[] {
  const rows: [string, string | null | undefined][] = [
    ["company_name", c.name], ["company_address", c.address], ["company_phone", c.phone],
    ["company_email", c.email], ["company_website", c.website],
  ];
  return rows.filter(([, v]) => v && v.trim()).map(([key, v]) => ({ key, scope: "campaign" as const, value: (v as string).trim().slice(0, 500), fallback: "" }));
}
