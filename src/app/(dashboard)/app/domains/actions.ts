"use server";

import { revalidatePath } from "next/cache";
import { limitsFor } from "@/config/plan-limits";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { go } from "@/lib/flash";
import { FREE_MAIL_DOMAINS, isValidDomain } from "@/lib/validation/email";
import { requireWorkspace } from "@/lib/workspace";
import { inspectDns } from "@/server/sending/domains";
import { recordAudit } from "@/server/audit";
import { getProvider } from "@/server/sending/providers";

const BACK = "/app/domains";

/** What the Add domain drawer gets back: an error stays in the drawer; success opens the new domain. */
export type DomainResult = { ok: true; message: string; tone: "success" | "warning"; href?: string } | { ok: false; error: string };
const fail = (error: string): DomainResult => ({ ok: false, error });

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

export async function addDomainAction(formData: FormData): Promise<DomainResult> {
  const ctx = await requireWorkspace(BACK, "domains.manage");
  const domain = normalizeDomain(String(formData.get("domain") ?? ""));

  if (!domain) return fail("Enter the domain you want to send from.");
  if (!isValidDomain(domain)) return fail("Enter a valid domain such as example.com.");
  if (FREE_MAIL_DOMAINS.has(domain)) return fail("Use a domain you own. Free email domains like gmail.com can’t be authenticated.");
  if (isPlatformDomain(domain)) return fail("That domain belongs to Sendves. Use your own domain.");
  if (ctx.workspace.status === "suspended") return fail("Your account is suspended. Contact support to add a domain.");

  // Plan limit.
  const { count } = await ctx.db.from("sending_domains").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
  const cap = limitsFor(ctx.workspace.plan).domains;
  if ((count ?? 0) >= cap) {
    return fail(`Your plan includes ${cap} sending ${cap === 1 ? "domain" : "domains"}. Remove one or upgrade your plan to add another.`);
  }

  // Check ownership before touching the provider. A domain is unique across the platform, and
  // registering it first could affect an identity that belongs to another workspace.
  const { data: existing } = await ctx.db.from("sending_domains").select("id, workspace_id").eq("domain", domain).maybeSingle();
  if (existing) {
    return fail(existing.workspace_id === ctx.workspace.id ? "You’ve already added that domain." : "That domain is already registered on another account. Contact support if it’s yours.");
  }

  let dkimTokens: string[];
  try {
    ({ dkimTokens } = await getProvider().ensureDomain(domain));
  } catch (err) {
    console.error("[domains] ensureDomain failed:", (err as Error).message);
    return fail("Couldn’t register that domain with the email provider. Try again in a moment.");
  }

  const { data: created, error } = await ctx.db.from("sending_domains").insert({
    workspace_id: ctx.workspace.id,
    domain,
    dkim_tokens: dkimTokens,
  }).select("id").single();
  if (error || !created) {
    if (error?.code === "23505") return fail("That domain is already registered.");
    // The provider identity was created for this attempt, so do not leave it orphaned.
    await getProvider().removeDomain(domain).catch(() => {});
    return fail("Couldn’t save the domain. Try again.");
  }

  await recordAudit(ctx.db, { id: ctx.user.id, email: ctx.user.email }, "domain.added", { type: "domain", id: domain }, { workspace_id: ctx.workspace.id });
  revalidatePath(BACK);
  return { ok: true, message: `${domain} added. Add the DNS records, then choose Check records.`, tone: "success", href: `${BACK}/${created.id}` };
}

export async function checkDomainAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "domains.manage");
  const id = idOf(formData);

  const { data: row } = await ctx.db.from("sending_domains").select("id, domain, status, verified_at, dkim_tokens").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!row) go(BACK, "err", "Domain not found.");
  const here = `${BACK}/${row.id}`;

  const isConsole = serverEnv.sending.provider === "console";
  let dkimStatus: "success" | "pending" | "failed";
  let verifiedForSending: boolean;
  try {
    const s = await getProvider().getDomainStatus(row.domain);
    dkimStatus = s.dkimStatus;
    verifiedForSending = s.verifiedForSending;
  } catch (err) {
    console.error("[domains] getDomainStatus failed:", (err as Error).message);
    go(here, "err", "Couldn’t check the records right now. Try again in a moment.");
  }

  // Real DNS lookups explain what is missing or wrong. In test mode nothing is sent and there is no
  // real DNS to look up, so the checks are marked as passed (the page says so).
  const ok = (message: string) => ({ status: "ok" as const, message, found: [] as string[] });
  const found = isConsole
    ? { dkim: ok("Test mode: not checked."), spf: ok("Test mode: not checked."), dmarc: ok("Test mode: not checked.") }
    : await inspectDns(row.domain, (row.dkim_tokens ?? []) as string[], dkimStatus);
  const dkimOk = dkimStatus === "success" && verifiedForSending;
  const spfOk = found.spf.status === "ok";
  const dmarcOk = found.dmarc.status === "ok";
  // Verified only when ALL THREE pass. A domain that fails any of them can't be sent from.
  const verified = dkimOk && spfOk && dmarcOk;

  await ctx.db.from("sending_domains").update({
    dkim_ok: dkimOk, spf_ok: spfOk, dmarc_ok: dmarcOk,
    status: verified ? "verified" : dkimStatus === "failed" ? "failed" : "pending",
    verified_at: verified ? row.verified_at ?? new Date().toISOString() : null,
    last_checked_at: new Date().toISOString(),
    findings: { dkim: found.dkim, spf: found.spf, dmarc: found.dmarc },
  }).eq("id", row.id).eq("workspace_id", ctx.workspace.id);

  revalidatePath(BACK);
  revalidatePath(here);
  revalidatePath("/app");
  revalidatePath("/app/team");

  if (verified) go(here, "ok", `${row.domain} is verified and ready to send.`);
  const failing = [!dkimOk && "DKIM", !spfOk && "SPF", !dmarcOk && "DMARC"].filter(Boolean).join(", ");
  if (dkimStatus === "failed") go(here, "err", `${row.domain} isn’t verified: ${failing} need attention. See what needs fixing below.`);
  go(here, "warn", `${row.domain} isn’t ready yet: ${failing} still need to pass. DNS changes can take up to 48 hours.`);
}

export async function removeDomainAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "domains.manage");
  const id = idOf(formData);

  const { data: row } = await ctx.db.from("sending_domains").select("id, domain").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!row) go(BACK, "err", "Domain not found.");

  // Don't pull the domain out from under a campaign that is queued or going out.
  const { count: active } = await ctx.db.from("campaigns").select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspace.id).in("status", ["scheduled", "sending", "paused"]).ilike("from_email", `%@${row.domain}`);
  if ((active ?? 0) > 0) go(`${BACK}/${row.id}`, "err", `A campaign that sends from ${row.domain} is scheduled or sending. Wait for it to finish or cancel it first.`);

  try {
    await getProvider().removeDomain(row.domain);
  } catch (err) {
    console.error("[domains] removeDomain failed:", (err as Error).message);
    go(`${BACK}/${row.id}`, "err", "Couldn’t remove that domain from the email provider. Try again in a moment.");
  }

  const { error } = await ctx.db.from("sending_domains").delete().eq("id", row.id);
  if (error) go(`${BACK}/${row.id}`, "err", "Couldn’t remove the domain. Try again.");

  await recordAudit(ctx.db, { id: ctx.user.id, email: ctx.user.email }, "domain.removed", { type: "domain", id: row.domain }, { workspace_id: ctx.workspace.id });
  revalidatePath(BACK);
  revalidatePath("/app");
  revalidatePath("/app/team");
  go(BACK, "ok", `${row.domain} removed, along with the work emails and aliases on it.`);
}