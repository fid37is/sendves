// src/lib/validation/paste-contacts.ts
import { checkEmail } from "./email";

export type PastedContact = { firstName: string; lastName: string; email: string };
export type PasteParse = {
  contacts: PastedContact[];
  /** Pasted text we couldn't read as an email address (first few, for display). */
  invalid: string[];
  invalidCount: number;
  duplicates: number;
};

const EMAIL_IN_TEXT = /[^\s,;<>"'()[\]]+@[^\s,;<>"'()[\]]+/g;

function splitName(raw: string): { firstName: string; lastName: string } {
  const cleaned = raw.replace(/["']/g, "").replace(/[,;|\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return { firstName: "", lastName: "" };
  const [first, ...rest] = cleaned.split(" ");
  return { firstName: first.slice(0, 100), lastName: rest.join(" ").slice(0, 100) };
}

/**
 * Reads pasted text into contacts. Accepts one entry per line or several separated by commas,
 * semicolons or spaces, in any of these shapes:
 *   ada@example.com
 *   Ada Lovelace <ada@example.com>
 *   ada@example.com, Ada, Lovelace        (a single address with a name after it)
 *   ada@example.com   Ada Lovelace
 * Lines with more than one address are treated as bare addresses (no names).
 */
export function parsePastedContacts(text: string): PasteParse {
  const out: PasteParse = { contacts: [], invalid: [], invalidCount: 0, duplicates: 0 };
  const seen = new Set<string>();

  const reject = (raw: string) => {
    out.invalidCount++;
    if (out.invalid.length < 5) out.invalid.push(raw.trim().slice(0, 80));
  };

  const push = (rawEmail: string, nameText: string) => {
    const check = checkEmail(rawEmail);
    if (!check.ok) return reject(rawEmail);
    if (seen.has(check.email)) {
      out.duplicates++;
      return;
    }
    seen.add(check.email);
    out.contacts.push({ email: check.email, ...splitName(nameText) });
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const found = trimmed.match(EMAIL_IN_TEXT);
    if (!found) {
      reject(trimmed);
      continue;
    }
    if (found.length > 1) {
      for (const email of found) push(email, "");
      continue;
    }
    // One address: whatever else is on the line is the name.
    const email = found[0];
    const nameText = trimmed.replace(email, " ").replace(/[<>]/g, " ");
    push(email, nameText);
  }
  return out;
}
