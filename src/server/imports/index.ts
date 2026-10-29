import { parse } from "csv-parse/sync";
import { checkEmail } from "@/lib/validation/email";

export type ParsedRow = { email: string; first_name: string | null; last_name: string | null };
export type ParsedImport = {
  rows: ParsedRow[];
  invalid: number;
  disposable: number;
  duplicates: number;
  roleAddresses: number;
  error?: string;
};

const MAX_ROWS = 50000;
const EMAIL_KEYS = ["email", "e-mail", "email address", "emailaddress", "mail"];
const FIRST_KEYS = ["first_name", "first name", "firstname", "first", "given name"];
const LAST_KEYS = ["last_name", "last name", "lastname", "last", "surname", "family name"];
const NAME_KEYS = ["name", "full name", "fullname"];

function findKey(headers: string[], candidates: string[]): string | undefined {
  return headers.find((h) => candidates.includes(h.trim().toLowerCase()));
}

export function parseContactsCsv(text: string): ParsedImport {
  const empty: ParsedImport = { rows: [], invalid: 0, disposable: 0, duplicates: 0, roleAddresses: 0 };
  let records: Record<string, string>[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: true });
  } catch {
    return { ...empty, error: "That file couldn’t be read as a CSV. Check that the first row contains column names." };
  }
  if (records.length === 0) return { ...empty, error: "The file has no rows." };
  if (records.length > MAX_ROWS) return { ...empty, error: `Imports are limited to ${MAX_ROWS.toLocaleString("en-US")} rows at a time.` };

  const headers = Object.keys(records[0]);
  const emailKey = findKey(headers, EMAIL_KEYS);
  if (!emailKey) return { ...empty, error: "No email column found. Name the column “email”." };
  const firstKey = findKey(headers, FIRST_KEYS);
  const lastKey = findKey(headers, LAST_KEYS);
  const nameKey = findKey(headers, NAME_KEYS);

  const out: ParsedImport = { ...empty };
  const seen = new Set<string>();

  for (const r of records) {
    const check = checkEmail(r[emailKey] ?? "");
    if (!check.ok) {
      if (check.reason === "disposable") out.disposable++;
      else out.invalid++;
      continue;
    }
    if (seen.has(check.email)) {
      out.duplicates++;
      continue;
    }
    seen.add(check.email);
    if (check.role) out.roleAddresses++;

    let first = firstKey ? r[firstKey] : "";
    let last = lastKey ? r[lastKey] : "";
    if (!first && !last && nameKey && r[nameKey]) {
      const [f, ...rest] = r[nameKey].split(" ");
      first = f;
      last = rest.join(" ");
    }
    out.rows.push({ email: check.email, first_name: first || null, last_name: last || null });
  }
  return out;
}
