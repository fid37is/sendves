import { resolveTxt } from "dns/promises";

export type DnsRecord = { purpose: "DKIM" | "SPF" | "DMARC"; type: "CNAME" | "TXT"; host: string; value: string };

export function dnsRecordsFor(domain: string, dkimTokens: string[]): DnsRecord[] {
  return [
    ...dkimTokens.map((t): DnsRecord => ({ purpose: "DKIM", type: "CNAME", host: `${t}._domainkey.${domain}`, value: `${t}.dkim.amazonses.com` })),
    { purpose: "SPF", type: "TXT", host: domain, value: "v=spf1 include:amazonses.com ~all" },
    { purpose: "DMARC", type: "TXT", host: `_dmarc.${domain}`, value: "v=DMARC1; p=none;" },
  ];
}

async function txt(host: string): Promise<string[]> {
  try {
    return (await resolveTxt(host)).map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

export async function checkSpf(domain: string): Promise<boolean> {
  return (await txt(domain)).some((r) => r.toLowerCase().startsWith("v=spf1") && r.toLowerCase().includes("amazonses.com"));
}

export async function checkDmarc(domain: string): Promise<boolean> {
  return (await txt(`_dmarc.${domain}`)).some((r) => r.toUpperCase().startsWith("V=DMARC1"));
}
