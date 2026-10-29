const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "throwawaymail.com", "getnada.com", "sharklasers.com", "dispostable.com", "maildrop.cc",
  "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com", "tempinbox.com", "spamgourmet.com",
]);

const ROLE = new Set(["info", "admin", "support", "sales", "contact", "hello", "office", "billing", "postmaster", "abuse", "noreply", "no-reply", "webmaster"]);

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "mail.com", "gmx.com", "zoho.com", "yandex.com",
]);

export type EmailCheck = { ok: boolean; email: string; reason?: "invalid" | "disposable"; role: boolean };

export function checkEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, email, reason: "invalid", role: false };
  const [local, domain] = email.split("@");
  if (DISPOSABLE.has(domain)) return { ok: false, email, reason: "disposable", role: false };
  return { ok: true, email, role: ROLE.has(local) };
}

export function isValidDomain(domain: string): boolean {
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain);
}