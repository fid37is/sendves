import { resolveCname, resolveTxt } from "dns/promises";

export type DnsRecord = { purpose: "DKIM" | "SPF" | "DMARC"; type: "CNAME" | "TXT"; host: string; value: string };

export function dnsRecordsFor(domain: string, dkimTokens: string[]): DnsRecord[] {
  return [
    ...dkimTokens.map((t): DnsRecord => ({ purpose: "DKIM", type: "CNAME", host: `${t}._domainkey.${domain}`, value: `${t}.dkim.amazonses.com` })),
    { purpose: "SPF", type: "TXT", host: domain, value: "v=spf1 include:amazonses.com ~all" },
    { purpose: "DMARC", type: "TXT", host: `_dmarc.${domain}`, value: "v=DMARC1; p=none;" },
  ];
}

/** One check's result. `incorrect` means a record exists but is wrong; `missing` means there is none. */
export type Finding = { status: "ok" | "missing" | "incorrect" | "pending"; message: string; found: string[] };

async function lookup<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback; // ENODATA / ENOTFOUND / timeouts: treated as "nothing there"
  }
}

export const txt = (host: string) => lookup(async () => (await resolveTxt(host)).map((parts) => parts.join("")), [] as string[]);
const cname = (host: string) => lookup(() => resolveCname(host), [] as string[]);

const norm = (s: string) => s.trim().toLowerCase().replace(/\.$/, "");

/** SPF: exactly one v=spf1 record, and it must authorise Amazon SES. */
export function evaluateSpf(records: string[]): Finding {
  const spf = records.filter((r) => r.trim().toLowerCase().startsWith("v=spf1"));
  if (spf.length === 0) return { status: "missing", found: [], message: "No SPF record found. Add the TXT record shown above." };
  if (spf.length > 1) return { status: "incorrect", found: spf, message: "More than one SPF record exists. A domain may have only one: merge them into a single record." };
  if (!/(^|\s)include:amazonses\.com(\s|$)/i.test(spf[0])) {
    return { status: "incorrect", found: spf, message: "Your SPF record doesn’t include amazonses.com. Add include:amazonses.com to your existing record; don’t create a second one." };
  }
  return { status: "ok", found: spf, message: "SPF authorises Amazon SES." };
}

/** DMARC: a single v=DMARC1 record with a valid p= policy. */
export function evaluateDmarc(records: string[]): Finding {
  const d = records.filter((r) => r.trim().toUpperCase().startsWith("V=DMARC1"));
  if (d.length === 0) return { status: "missing", found: [], message: "No DMARC record found. Add the TXT record shown above." };
  if (d.length > 1) return { status: "incorrect", found: d, message: "More than one DMARC record exists. A domain may have only one." };
  const policy = /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)\s*(?:;|$)/i.exec(d[0]);
  if (!policy) return { status: "incorrect", found: d, message: "The DMARC record has no valid p= policy (none, quarantine or reject)." };
  return { status: "ok", found: d, message: `DMARC is published with policy “${policy[1].toLowerCase()}”.` };
}

/**
 * DKIM. The email provider is the authority (it signs with these keys), so its status decides.
 * The CNAME lookups only explain WHICH record is missing or wrong.
 */
export function evaluateDkim(provider: "success" | "pending" | "failed", records: { host: string; expected: string; found: string[] }[]): Finding {
  const problems = records.filter((r) => !r.found.some((f) => norm(f) === norm(r.expected)));
  const detail = problems.map((r) =>
    r.found.length === 0 ? `${r.host} has no CNAME record.` : `${r.host} points to ${r.found.join(", ")} instead of ${r.expected}.`,
  );
  if (provider === "success") return { status: "ok", found: records.flatMap((r) => r.found), message: "DKIM is verified by the email provider." };
  if (detail.length > 0) {
    const wrong = problems.some((r) => r.found.length > 0);
    return { status: wrong ? "incorrect" : "missing", found: records.flatMap((r) => r.found), message: detail.join(" ") };
  }
  return provider === "failed"
    ? { status: "incorrect", found: [], message: "The provider couldn’t verify DKIM even though the records look right. Check for proxying (turn off any CDN proxy on these records) and try again." }
    : { status: "pending", found: [], message: "The records are published; the provider hasn’t confirmed them yet. This can take a few minutes." };
}

/** Looks up the live DNS for a domain and evaluates SPF, DMARC and the DKIM CNAMEs. */
export async function inspectDns(domain: string, dkimTokens: string[], dkimProvider: "success" | "pending" | "failed") {
  const [spfTxt, dmarcTxt, cnames] = await Promise.all([
    txt(domain),
    txt(`_dmarc.${domain}`),
    Promise.all(dkimTokens.map(async (t) => ({ host: `${t}._domainkey.${domain}`, expected: `${t}.dkim.amazonses.com`, found: await cname(`${t}._domainkey.${domain}`) }))),
  ]);
  return { dkim: evaluateDkim(dkimProvider, cnames), spf: evaluateSpf(spfTxt), dmarc: evaluateDmarc(dmarcTxt) };
}

/** Kept for callers that only need a yes/no. */
export async function checkSpf(domain: string): Promise<boolean> {
  return evaluateSpf(await txt(domain)).status === "ok";
}

export async function checkDmarc(domain: string): Promise<boolean> {
  return evaluateDmarc(await txt(`_dmarc.${domain}`)).status === "ok";
}
