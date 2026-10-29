"use server";

import { revalidatePath } from "next/cache";
import { limitsFor } from "@/config/plan-limits";
import { go } from "@/lib/flash";
import { FREE_MAIL_DOMAINS, isValidDomain } from "@/lib/validation/email";
import { requireWorkspace } from "@/lib/workspace";
import { getProvider } from "@/server/sending/providers";
import { checkDmarc, checkSpf } from "@/server/sending/domains";

const BACK = "/app/domains";

export async function addDomainAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  if (!isValidDomain(domain)) go(BACK, "err", "Enter a domain like example.com.");
  if (FREE_MAIL_DOMAINS.has(domain)) go(BACK, "err", "You can’t send from a free email domain like gmail.com. Use a domain you own.");

  const { count } = await ctx.db.from("sending_domains").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
  if ((count ?? 0) >= limitsFor(ctx.workspace.plan).domains) go(BACK, "err", "You’ve reached your plan’s domain limit.");

  const { data: taken } = await ctx.db.from("sending_domains").select("id").eq("domain", domain).maybeSingle();
  if (taken) go(BACK, "err", "That domain is already registered on Sendves.");

  let tokens: string[] = [];
  try {
    tokens = (await getProvider().ensureDomain(domain)).dkimTokens;
  } catch (err) {
    go(BACK, "err", `Couldn’t register the domain with the sending provider: ${(err as Error).message}`);
  }

  const { error } = await ctx.db.from("sending_domains").insert({ workspace_id: ctx.workspace.id, domain, dkim_tokens: tokens });
  if (error) go(BACK, "err", "Couldn’t save the domain. Try again.");
  revalidatePath(BACK);
  go(BACK, "ok", "Domain added. Create the DNS records below, then select Check records.");
}

export async function checkDomainAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const { data: d } = await ctx.db.from("sending_domains").select("*").eq("id", String(formData.get("id") ?? "")).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!d) go(BACK, "err", "Domain not found.");

  let verified = false;
  let failed = false;
  try {
    const s = await getProvider().getDomainStatus(d.domain);
    verified = s.verifiedForSending;
    failed = s.dkimStatus === "failed";
  } catch (err) {
    go(BACK, "err", `Couldn’t check the domain: ${(err as Error).message}`);
  }
  const [spf, dmarc] = await Promise.all([checkSpf(d.domain), checkDmarc(d.domain)]);

  await ctx.db.from("sending_domains").update({
    dkim_ok: verified, spf_ok: spf, dmarc_ok: dmarc,
    status: verified ? "verified" : failed ? "failed" : "pending",
    verified_at: verified ? d.verified_at ?? new Date().toISOString() : null,
  }).eq("id", d.id);

  revalidatePath(BACK);
  go(BACK, verified ? "ok" : "err", verified
    ? "Domain verified. You can send campaigns from it." + (spf && dmarc ? "" : " SPF and DMARC records are recommended for best delivery.")
    : "Not verified yet. DNS changes can take up to 48 hours; check the records and try again later.");
}

export async function removeDomainAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const { data: d } = await ctx.db.from("sending_domains").select("id, domain").eq("id", String(formData.get("id") ?? "")).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!d) go(BACK, "err", "Domain not found.");
  try { await getProvider().removeDomain(d.domain); } catch { /* the row is removed regardless */ }
  await ctx.db.from("sending_domains").delete().eq("id", d.id);
  revalidatePath(BACK);
  go(BACK, "ok", "Domain removed.");
}
