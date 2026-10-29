// src/app/(dashboard)/app/domains/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { limitsFor } from "@/config/plan-limits";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { go } from "@/lib/flash";
import { FREE_MAIL_DOMAINS, isValidDomain } from "@/lib/validation/email";
import { requireWorkspace } from "@/lib/workspace";
import { checkDmarc, checkSpf } from "@/server/sending/domains";
import { getProvider } from "@/server/sending/providers";

const BACK = "/app/domains";

/** Accepts "Example.com", "https://example.com/", "me@example.com" and returns "example.com". */
function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // protocol
  d = d.replace(/^.*@/, ""); // user@
  d = d.split(/[/?#]/)[0]; // path, query, fragment
  d = d.replace(/:\d+$/, ""); // port
  d = d.replace(/\.$/, ""); // trailing dot
  return d;
}

/** The platform's own domains can never be registered, or one customer could impersonate Sendves. */
function isPlatformDomain(domain: string): boolean {
  const root = env.rootDomain.split(":")[0];
  if (!root || root === "localhost") return false;
  return domain === root || domain.endsWith(`.${root}`);
}

const idOf = (formData: FormData) => String(formData.get("id") ?? "").trim().slice(0, 60);

export async function addDomainAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const domain = normalizeDomain(String(formData.get("domain") ?? ""));

  if (!domain) go(BACK, "err", "Enter the domain you want to send from.");
  if (!isValidDomain(domain)) go(BACK, "err", "Enter a valid domain such as example.com.");
  if (FREE_MAIL_DOMAINS.has(domain)) go(BACK, "err", "Use a domain you own. Free email domains like gmail.com can’t be authenticated.");
  if (isPlatformDomain(domain)) go(BACK, "err", "That domain belongs to Sendves. Use your own domain.");
  if (ctx.workspace.status === "suspended") go(BACK, "err", "Your account is suspended. Contact support to add a domain.");

  // Plan limit.
  const { count } = await ctx.db.from("sending_domains").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
  const cap = limitsFor(ctx.workspace.plan).domains;
  if ((count ?? 0) >= cap) {
    go(BACK, "err", `Your plan includes ${cap} sending ${cap === 1 ? "domain" : "domains"}. Remove one or upgrade your plan to add another.`);
  }

  // Check ownership before touching the provider. A domain is unique across the platform, and
  // registering it first could affect an identity that belongs to another workspace.
  const { data: existing } = await ctx.db.from("sending_domains").select("id, workspace_id").eq("domain", domain).maybeSingle();
  if (existing) {
    go(BACK, "err", existing.workspace_id === ctx.workspace.id ? "You’ve already added that domain." : "That domain is already registered on another account. Contact support if it’s yours.");
  }

  let dkimTokens: string[];
  try {
    ({ dkimTokens } = await getProvider().ensureDomain(domain));
  } catch (err) {
    console.error("[domains] ensureDomain failed:", (err as Error).message);
    go(BACK, "err", "Couldn’t register that domain with the email provider. Try again in a moment.");
  }

  const { error } = await ctx.db.from("sending_domains").insert({
    workspace_id: ctx.workspace.id,
    domain,
    dkim_tokens: dkimTokens,
  });
  if (error) {
    if (error.code === "23505") go(BACK, "err", "That domain is already registered.");
    // The provider identity was created for this attempt, so do not leave it orphaned.
    await getProvider().removeDomain(domain).catch(() => {});
    go(BACK, "err", "Couldn’t save the domain. Try again.");
  }

  revalidatePath(BACK);
  go(BACK, "ok", `${domain} added. Add the DNS records below, then choose “Check records”.`);
}

export async function checkDomainAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const id = idOf(formData);

  const { data: row } = await ctx.db.from("sending_domains").select("id, domain, status, verified_at").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!row) go(BACK, "err", "Domain not found.");

  const isConsole = serverEnv.sending.provider === "console";
  let status: "success" | "pending" | "failed";
  let verifiedForSending: boolean;
  try {
    const s = await getProvider().getDomainStatus(row.domain);
    status = s.dkimStatus;
    verifiedForSending = s.verifiedForSending;
  } catch (err) {
    console.error("[domains] getDomainStatus failed:", (err as Error).message);
    go(BACK, "err", "Couldn’t check the records right now. Try again in a moment.");
  }

  // In test mode nothing is sent, so there is no real DNS to look up.
  const [spfOk, dmarcOk] = isConsole ? [true, true] : await Promise.all([checkSpf(row.domain), checkDmarc(row.domain)]);
  const dkimOk = status === "success";
  const verified = dkimOk && verifiedForSending;

  await ctx.db.from("sending_domains").update({
    dkim_ok: dkimOk,
    spf_ok: spfOk,
    dmarc_ok: dmarcOk,
    status: verified ? "verified" : status === "failed" ? "failed" : "pending",
    verified_at: verified ? row.verified_at ?? new Date().toISOString() : null,
  }).eq("id", row.id);

  revalidatePath(BACK);
  revalidatePath("/app");

  if (!verified) {
    if (status === "failed") go(BACK, "err", `We couldn’t verify ${row.domain}. Check that the DKIM records match exactly, then try again.`);
    go(BACK, "warn", `${row.domain} isn’t verified yet. DNS changes can take up to 48 hours.`);
  }
  const missing = [!spfOk && "SPF", !dmarcOk && "DMARC"].filter(Boolean).join(" and ");
  if (missing) go(BACK, "warn", `${row.domain} is verified and ready to send. Add the ${missing} record${missing.includes("and") ? "s" : ""} too for better deliverability.`);
  go(BACK, "ok", `${row.domain} is verified and ready to send.`);
}

export async function removeDomainAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const id = idOf(formData);

  const { data: row } = await ctx.db.from("sending_domains").select("id, domain").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!row) go(BACK, "err", "Domain not found.");

  // Don't pull the domain out from under a campaign that is queued or going out.
  const { count: active } = await ctx.db.from("campaigns").select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspace.id).in("status", ["scheduled", "sending"]).ilike("from_email", `%@${row.domain}`);
  if ((active ?? 0) > 0) go(BACK, "err", `A campaign that sends from ${row.domain} is scheduled or sending. Wait for it to finish or cancel it first.`);

  try {
    await getProvider().removeDomain(row.domain);
  } catch (err) {
    console.error("[domains] removeDomain failed:", (err as Error).message);
    go(BACK, "err", "Couldn’t remove that domain from the email provider. Try again in a moment.");
  }

  const { error } = await ctx.db.from("sending_domains").delete().eq("id", row.id);
  if (error) go(BACK, "err", "Couldn’t remove the domain. Try again.");

  revalidatePath(BACK);
  revalidatePath("/app");
  go(BACK, "ok", `${row.domain} removed.`);
}