import "server-only";
import { inScope } from "@/server/scope";
import type { Access } from "@/lib/access";
import type { Db } from "@/lib/supabase/admin";
import { checkEmail } from "@/lib/validation/email";

/**
 * A campaign's audience is any mix of whole lists and individually chosen contacts (picked, pasted
 * or imported), or "everyone subscribed". The same person reached by several routes is ONE recipient:
 * the size shown in the editor comes from the same SQL rules the delivery queue uses
 * (campaign_audience_size / enqueue_campaign, migration 0005).
 */

export const MAX_AUDIENCE_CONTACTS = 5000;
export const MAX_AUDIENCE_LISTS = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AudienceSelection = { mode: "all" | "custom"; listIds: string[]; contactIds: string[] };

type Owner = { db: Db; workspace: { id: string; plan: string; max_contacts: number }; access: Access | null };

const uniqueIds = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? [...new Set(v.map(String).filter((id) => UUID_RE.test(id)))].slice(0, max) : [];

/** Reads a selection from the browser: ids that aren't UUIDs, duplicates and excess are dropped. */
export function parseSelection(input: unknown): AudienceSelection {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return { mode: o.mode === "custom" ? "custom" : "all", listIds: uniqueIds(o.listIds, MAX_AUDIENCE_LISTS), contactIds: uniqueIds(o.contactIds, MAX_AUDIENCE_CONTACTS) };
}

/** Keeps only lists this person may use and contacts of this workspace. Nothing foreign survives. */
export async function scopeSelection(ctx: Owner, sel: AudienceSelection): Promise<AudienceSelection> {
  if (sel.mode === "all") return { mode: "all", listIds: [], contactIds: [] };
  const [lists, contacts] = await Promise.all([
    sel.listIds.length
      ? inScope(ctx.db.from("lists").select("id").eq("workspace_id", ctx.workspace.id).in("id", sel.listIds), ctx.access)
      : Promise.resolve({ data: [] as { id: string }[] }),
    sel.contactIds.length ? selectContactIds(ctx, sel.contactIds) : Promise.resolve([] as string[]),
  ]);
  return { mode: "custom", listIds: ((lists as { data: { id: string }[] | null }).data ?? []).map((l) => l.id), contactIds: contacts as string[] };
}

async function selectContactIds(ctx: Owner, ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await ctx.db.from("contacts").select("id").eq("workspace_id", ctx.workspace.id).in("id", ids.slice(i, i + 500));
    out.push(...((data ?? []) as { id: string }[]).map((c) => c.id));
  }
  return out;
}

/** People who would receive the campaign: subscribed, not suppressed, counted once. */
export async function audienceSize(ctx: Owner, sel: AudienceSelection): Promise<number> {
  const clean = await scopeSelection(ctx, sel);
  const { data } = await ctx.db.rpc("campaign_audience_size", {
    p_workspace: ctx.workspace.id, p_mode: clean.mode, p_lists: clean.listIds, p_contacts: clean.contactIds,
  });
  return Number(data ?? 0) || 0;
}

/**
 * Stores the audience on a campaign. New rows are added first and the rows that are no longer
 * selected are removed second, so a failure part-way never leaves the campaign with no audience.
 */
export async function saveAudience(ctx: Owner, campaignId: string, sel: AudienceSelection): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = await scopeSelection(ctx, sel);
  const { error: modeError } = await ctx.db.from("campaigns").update({ audience_mode: clean.mode }).eq("id", campaignId).eq("workspace_id", ctx.workspace.id).eq("status", "draft");
  if (modeError) return { ok: false, error: "Couldn’t save the audience." };

  const lists = clean.mode === "custom" ? clean.listIds : [];
  const contacts = clean.mode === "custom" ? clean.contactIds : [];

  if (lists.length) {
    const { error } = await ctx.db.from("campaign_audience_lists").upsert(lists.map((list_id) => ({ campaign_id: campaignId, list_id })), { onConflict: "campaign_id,list_id", ignoreDuplicates: true });
    if (error) return { ok: false, error: "Couldn’t save the selected lists." };
  }
  for (let i = 0; i < contacts.length; i += 500) {
    const { error } = await ctx.db.from("campaign_audience_contacts").upsert(contacts.slice(i, i + 500).map((contact_id) => ({ campaign_id: campaignId, contact_id })), { onConflict: "campaign_id,contact_id", ignoreDuplicates: true });
    if (error) return { ok: false, error: "Couldn’t save the selected contacts." };
  }

  const dropLists = ctx.db.from("campaign_audience_lists").delete().eq("campaign_id", campaignId);
  const dropContacts = ctx.db.from("campaign_audience_contacts").delete().eq("campaign_id", campaignId);
  const [a, b] = await Promise.all([
    lists.length ? dropLists.not("list_id", "in", `(${lists.join(",")})`) : dropLists,
    // Excluding thousands of ids in one URL isn't possible, so remove by difference instead.
    removeUnselectedContacts(ctx, campaignId, new Set(contacts), dropContacts),
  ]);
  if (a.error || b.error) return { ok: false, error: "Couldn’t update the audience." };
  return { ok: true };
}

async function removeUnselectedContacts(ctx: Owner, campaignId: string, keep: Set<string>, dropAll: PromiseLike<{ error: unknown }>): Promise<{ error: unknown }> {
  if (keep.size === 0) return dropAll;
  const { data } = await ctx.db.from("campaign_audience_contacts").select("contact_id").eq("campaign_id", campaignId).limit(MAX_AUDIENCE_CONTACTS + 1000);
  const stale = ((data ?? []) as { contact_id: string }[]).map((r) => r.contact_id).filter((id) => !keep.has(id));
  for (let i = 0; i < stale.length; i += 200) {
    const { error } = await ctx.db.from("campaign_audience_contacts").delete().eq("campaign_id", campaignId).in("contact_id", stale.slice(i, i + 200));
    if (error) return { error };
  }
  return { error: null };
}

// ── Pasted and imported contacts ────────────────────────────────────

export type IngestRow = { email: string; firstName?: string | null; lastName?: string | null; custom?: Record<string, string> };

export type IngestResult = {
  ok: boolean;
  error?: string;
  /** People to add to the selection: new contacts plus existing subscribed ones. */
  contacts: { id: string; email: string; name: string }[];
  created: number;
  alreadyInContacts: number;
  /** Addresses left out, with the reason, so nothing disappears silently (first 50). */
  skipped: { email: string; reason: string }[];
  skippedCount: number;
  /** Counted by the parser before rows reach us. */
  invalid: number;
  duplicates: number;
  roleAddresses: number;
  message: string;
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * Finds or creates the contacts for pasted/imported rows. Existing subscribed contacts are reused,
 * unsubscribed or suppressed addresses are never added, and new contacts need `canCreate`
 * (the contacts.manage permission) and room under the plan's contact limit.
 */
export async function ingestContacts(
  ctx: Owner,
  rows: IngestRow[],
  opts: { canCreate: boolean; source: string; invalid?: number; duplicates?: number; roleAddresses?: number; maxRows?: number },
): Promise<IngestResult> {
  const result: IngestResult = {
    ok: true, contacts: [], created: 0, alreadyInContacts: 0, skipped: [], skippedCount: 0,
    invalid: opts.invalid ?? 0, duplicates: opts.duplicates ?? 0, roleAddresses: opts.roleAddresses ?? 0, message: "",
  };
  const skip = (email: string, reason: string) => {
    result.skippedCount++;
    if (result.skipped.length < 50) result.skipped.push({ email, reason });
  };

  // Validate and de-duplicate again here: the browser is never trusted.
  const seen = new Set<string>();
  const valid: IngestRow[] = [];
  for (const r of rows.slice(0, opts.maxRows ?? 50000)) {
    const check = checkEmail(String(r?.email ?? ""));
    if (!check.ok) { result.invalid++; continue; }
    if (seen.has(check.email)) { result.duplicates++; continue; }
    seen.add(check.email);
    valid.push({ email: check.email, firstName: r.firstName ?? null, lastName: r.lastName ?? null, custom: r.custom });
  }
  if (valid.length === 0) return { ...result, ok: false, error: "No valid email addresses found." , message: "No valid email addresses found." };

  const emails = valid.map((v) => v.email);
  const known = new Map<string, { id: string; status: string; first_name: string | null; last_name: string | null }>();
  const blocked = new Set<string>();
  for (let i = 0; i < emails.length; i += 500) {
    const chunk = emails.slice(i, i + 500);
    const [{ data: existing }, { data: sup }] = await Promise.all([
      ctx.db.from("contacts").select("id, email, status, first_name, last_name").eq("workspace_id", ctx.workspace.id).in("email", chunk),
      ctx.db.from("suppression_entries").select("email").or(`workspace_id.is.null,workspace_id.eq.${ctx.workspace.id}`).in("email", chunk),
    ]);
    for (const c of (existing ?? []) as any[]) known.set(String(c.email).toLowerCase(), c);
    for (const b of (sup ?? []) as any[]) blocked.add(String(b.email).toLowerCase());
  }

  const { count } = await ctx.db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
  let room = Math.max(0, ctx.workspace.max_contacts - (count ?? 0));

  const name = (a: string | null | undefined, b: string | null | undefined) => [a, b].filter(Boolean).join(" ");
  const toCreate: IngestRow[] = [];
  for (const v of valid) {
    const k = known.get(v.email);
    if (blocked.has(v.email)) skip(v.email, "Previously bounced, reported spam or unsubscribed, so it can’t be emailed.");
    else if (k) {
      if (k.status === "subscribed") { result.contacts.push({ id: k.id, email: v.email, name: name(k.first_name, k.last_name) }); result.alreadyInContacts++; }
      else skip(v.email, `Already in your contacts as ${k.status}, so it can’t be emailed.`);
    } else if (!opts.canCreate) skip(v.email, "Not in your contacts yet, and you don’t have permission to add new contacts.");
    else if (room <= 0) skip(v.email, "Your plan’s contact limit was reached.");
    else { toCreate.push(v); room--; }
  }

  if (toCreate.length) {
    const now = new Date().toISOString();
    for (let i = 0; i < toCreate.length; i += 500) {
      const chunk = toCreate.slice(i, i + 500);
      const { data: inserted, error } = await ctx.db.from("contacts")
        .upsert(chunk.map((r) => ({
          workspace_id: ctx.workspace.id, email: r.email, first_name: r.firstName || null, last_name: r.lastName || null,
          custom_fields: r.custom ?? {}, source: opts.source, consented_at: now,
        })), { onConflict: "workspace_id,email", ignoreDuplicates: true })
        .select("id, email, first_name, last_name");
      if (error) return { ...result, ok: false, error: "Couldn’t save the new contacts. Try again.", message: "Couldn’t save the new contacts. Try again." };
      for (const c of (inserted ?? []) as any[]) {
        result.created++;
        result.contacts.push({ id: c.id, email: c.email, name: name(c.first_name, c.last_name) });
      }
    }
  }

  if (result.contacts.length > MAX_AUDIENCE_CONTACTS) {
    return { ...result, ok: false, error: `You can pick up to ${MAX_AUDIENCE_CONTACTS.toLocaleString("en-US")} people individually. For bigger audiences, import them into a list on the Contacts page and select the list here.`, message: "" };
  }

  result.message = [
    result.created ? `${plural(result.created, "new contact", "new contacts")} added` : "",
    result.alreadyInContacts ? `${plural(result.alreadyInContacts, "person", "people")} already in your contacts` : "",
    result.duplicates ? `${plural(result.duplicates, "duplicate", "duplicates")} ignored` : "",
    result.invalid ? `${plural(result.invalid, "invalid address", "invalid addresses")} skipped` : "",
    result.skippedCount ? `${plural(result.skippedCount, "address", "addresses")} left out` : "",
  ].filter(Boolean).join(" · ") || "Nothing to add.";
  if (result.contacts.length === 0) { result.ok = false; result.error = "None of those people could be added. See the details below."; }
  return result;
}
