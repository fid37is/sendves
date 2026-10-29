// src/app/(dashboard)/app/contacts/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { limitsFor } from "@/config/plan-limits";
import { go } from "@/lib/flash";
import { requireWorkspace } from "@/lib/workspace";
import { checkEmail } from "@/lib/validation/email";
import { parseContactsCsv } from "@/server/imports";

const MAX_BYTES = 5 * 1024 * 1024;

async function remainingRoom(ctx: Awaited<ReturnType<typeof requireWorkspace>>) {
  const { count } = await ctx.db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
  const cap = Math.min(ctx.workspace.max_contacts, limitsFor(ctx.workspace.plan).contacts);
  return { used: count ?? 0, room: Math.max(0, cap - (count ?? 0)), cap };
}

export type AddContactsInput = {
  consent: boolean;
  contacts: { firstName: string; lastName: string; email: string }[];
  /**
   * Optional. Puts the people into a list so they can be chosen as a campaign audience.
   * With an audience, people who are already subscribed contacts are included instead of rejected.
   */
  audience?: { listId: string } | { newListName: string };
};
export type AddContactsResult = {
  added: number;
  message?: string;
  error?: string;
  /** `index` is the position in the submitted `contacts` array. */
  rowErrors: { index: number; message: string }[];
  /** Set when an audience was requested: the list the people are now in. */
  list?: { id: string; name: string; count: number };
};

const MAX_BATCH = 500;

/** Finds the requested list, or creates one (adding " (2)", " (3)"… if the name is taken). */
async function resolveAudienceList(ctx: Awaited<ReturnType<typeof requireWorkspace>>, audience: NonNullable<AddContactsInput["audience"]>) {
  if ("listId" in audience) {
    const { data } = await ctx.db.from("lists").select("id, name").eq("id", String(audience.listId)).eq("workspace_id", ctx.workspace.id).maybeSingle();
    return data as { id: string; name: string } | null;
  }
  const base = String(audience.newListName ?? "").trim().slice(0, 70) || "New audience";
  for (let n = 1; n <= 20; n++) {
    const name = n === 1 ? base : `${base} (${n})`;
    const { data, error } = await ctx.db.from("lists").insert({ workspace_id: ctx.workspace.id, name }).select("id, name").single();
    if (!error && data) return data as { id: string; name: string };
    if (error?.code !== "23505") return null;
  }
  return null;
}

/** Adds one or several contacts in a single save. Problem rows are reported back; the rest are saved. */
export async function addContactsAction(input: AddContactsInput): Promise<AddContactsResult> {
  const ctx = await requireWorkspace("/app/contacts");
  const rowErrors: AddContactsResult["rowErrors"] = [];
  const fail = (error: string): AddContactsResult => ({ added: 0, error, rowErrors });

  if (!input || !Array.isArray(input.contacts)) return fail("Add at least one contact.");
  if (input.consent !== true) return fail("Confirm that these people agreed to receive your emails.");
  if (input.contacts.length > MAX_BATCH) return fail(`Add up to ${MAX_BATCH} contacts at a time. To add more, import a CSV.`);

  type Candidate = { index: number; email: string; first_name: string | null; last_name: string | null; role: boolean };
  const candidates: Candidate[] = [];
  const seen = new Map<string, number>();

  input.contacts.forEach((c, index) => {
    const rawEmail = String(c?.email ?? "").trim();
    const first = String(c?.firstName ?? "").trim().slice(0, 100);
    const last = String(c?.lastName ?? "").trim().slice(0, 100);
    if (!rawEmail && !first && !last) return; // an empty row is ignored

    if (!rawEmail) return void rowErrors.push({ index, message: "Enter an email address." });
    const check = checkEmail(rawEmail);
    if (!check.ok) {
      return void rowErrors.push({ index, message: check.reason === "disposable" ? "Disposable email addresses aren’t allowed." : "Enter a valid email address." });
    }
    const firstSeen = seen.get(check.email);
    if (firstSeen !== undefined) return void rowErrors.push({ index, message: `Same email as person ${firstSeen + 1}.` });
    seen.set(check.email, index);
    candidates.push({ index, email: check.email, first_name: first || null, last_name: last || null, role: check.role });
  });

  if (candidates.length === 0) {
    return fail(rowErrors.length ? "Fix the highlighted rows and try again." : "Add at least one email address.");
  }

  const { room } = await remainingRoom(ctx);
  if (room <= 0) return fail("You’ve reached your contact limit. Upgrade your plan to add more.");

  const emails = candidates.map((c) => c.email);
  const [{ data: blocked }, { data: existing }] = await Promise.all([
    // Platform-wide blocks plus this workspace's own (e.g. people who unsubscribed from you).
    ctx.db.from("suppression_entries").select("email").or(`workspace_id.is.null,workspace_id.eq.${ctx.workspace.id}`).in("email", emails),
    ctx.db.from("contacts").select("id, email, status").eq("workspace_id", ctx.workspace.id).in("email", emails),
  ]);
  const blockedSet = new Set((blocked ?? []).map((b: { email: string }) => b.email.toLowerCase()));
  type Known = { id: string; email: string; status: string };
  const existingByEmail = new Map<string, Known>((existing ?? []).map((x: Known) => [x.email.toLowerCase(), x] as const));
  const withAudience = !!input.audience;

  const toInsert: Candidate[] = [];
  const alreadyThere: { id: string }[] = []; // existing subscribed contacts to include in the audience
  for (const c of candidates) {
    const known = existingByEmail.get(c.email);
    if (blockedSet.has(c.email)) rowErrors.push({ index: c.index, message: "This address previously bounced, reported spam or unsubscribed, so it can’t be emailed." });
    else if (known && withAudience && known.status === "subscribed") alreadyThere.push({ id: known.id });
    else if (known && withAudience) rowErrors.push({ index: c.index, message: `Already in your contacts as ${known.status}, so it can’t be emailed.` });
    else if (known) rowErrors.push({ index: c.index, message: "Already in your contacts." });
    else if (toInsert.length >= room) rowErrors.push({ index: c.index, message: "Your plan’s contact limit was reached. Upgrade to add more." });
    else toInsert.push(c);
  }

  if (toInsert.length === 0 && alreadyThere.length === 0) return fail("None of these contacts could be added. Check the highlighted rows.");

  const now = new Date().toISOString();
  let insertedIds: { id: string }[] = [];
  if (toInsert.length > 0) {
    const { data: inserted, error } = await ctx.db.from("contacts").insert(
      toInsert.map((c) => ({
        workspace_id: ctx.workspace.id, email: c.email, first_name: c.first_name, last_name: c.last_name,
        source: withAudience ? "campaign audience" : "manual", consented_at: now,
      })),
    ).select("id");
    if (error) return fail(error.code === "23505" ? "Some of these contacts already exist. Review them and try again." : "Couldn’t add the contacts. Try again.");
    insertedIds = inserted ?? [];
  }

  let list: AddContactsResult["list"];
  if (input.audience) {
    const target = await resolveAudienceList(ctx, input.audience);
    if (!target) return { added: toInsert.length, error: "The contacts were saved, but we couldn’t put them in a list. Choose a list and try again.", rowErrors };
    const members = [...insertedIds, ...alreadyThere].map((m) => ({ list_id: target.id, contact_id: m.id }));
    const { error: memberError } = await ctx.db.from("list_members").upsert(members, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
    if (memberError) return { added: toInsert.length, error: "The contacts were saved, but we couldn’t put them in the list. Try again.", rowErrors };
    const { count } = await ctx.db.from("list_members").select("contact_id", { count: "exact", head: true }).eq("list_id", target.id);
    list = { id: target.id, name: target.name, count: count ?? members.length };
    revalidatePath("/app/lists");
  }

  revalidatePath("/app/contacts");
  const roles = toInsert.filter((c) => c.role).length;
  const message = [
    toInsert.length ? `${toInsert.length} ${toInsert.length === 1 ? "contact" : "contacts"} added` : "",
    alreadyThere.length ? `${alreadyThere.length} already in your contacts` : "",
    roles ? `${roles} role ${roles === 1 ? "address" : "addresses"} like info@ (they often perform poorly)` : "",
  ].filter(Boolean).join(", ") + (list ? ` · audience: ${list.name}.` : ".");
  return { added: toInsert.length + alreadyThere.length, message, rowErrors, list };
}

export async function importContactsAction(formData: FormData) {
  const back = "/app/contacts/import";
  const ctx = await requireWorkspace(back);

  if (formData.get("consent") !== "on") go(back, "err", "Confirm that your contacts gave you permission to email them.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) go(back, "err", "Choose a CSV file to import.");
  if (file.size > MAX_BYTES) go(back, "err", "That file is larger than 5 MB. Split it and import in parts.");

  const parsed = parseContactsCsv(await file.text());
  if (parsed.error) go(back, "err", parsed.error);

  const { room } = await remainingRoom(ctx);
  if (room <= 0) go(back, "err", "You’ve reached your contact limit. Upgrade your plan to import more.");
  let rows = parsed.rows;
  const truncated = Math.max(0, rows.length - room);
  rows = rows.slice(0, room);

  // List: existing id, or a new list name.
  let listId = String(formData.get("listId") ?? "");
  const newList = String(formData.get("newList") ?? "").trim();
  if (newList) {
    const { data: l, error } = await ctx.db.from("lists").insert({ workspace_id: ctx.workspace.id, name: newList.slice(0, 80) }).select("id").single();
    if (error) {
      const { data: existing } = await ctx.db.from("lists").select("id").eq("workspace_id", ctx.workspace.id).eq("name", newList).maybeSingle();
      listId = existing?.id ?? "";
    } else listId = l.id;
  }

  let added = 0;
  let suppressed = 0;
  for (let i = 0; i < rows.length; i += 500) {
    let chunk = rows.slice(i, i + 500);
    const { data: blocked } = await ctx.db.from("suppression_entries").select("email").is("workspace_id", null).in("email", chunk.map((r) => r.email));
    const blockedSet = new Set((blocked ?? []).map((b: any) => b.email.toLowerCase()));
    suppressed += chunk.filter((r) => blockedSet.has(r.email)).length;
    chunk = chunk.filter((r) => !blockedSet.has(r.email));
    if (chunk.length === 0) continue;

    const now = new Date().toISOString();
    const { data: inserted } = await ctx.db.from("contacts")
      .upsert(chunk.map((r) => ({ workspace_id: ctx.workspace.id, ...r, source: "csv import", consented_at: now })), { onConflict: "workspace_id,email", ignoreDuplicates: true })
      .select("id");
    added += inserted?.length ?? 0;

    if (listId) {
      const { data: ids } = await ctx.db.from("contacts").select("id").eq("workspace_id", ctx.workspace.id).in("email", chunk.map((r) => r.email));
      if (ids?.length) await ctx.db.from("list_members").upsert(ids.map((c: any) => ({ list_id: listId, contact_id: c.id })), { onConflict: "list_id,contact_id", ignoreDuplicates: true });
    }
  }

  const notes = [
    `${added.toLocaleString("en-US")} new contacts imported`,
    rows.length - added - suppressed > 0 ? `${(rows.length - added - suppressed).toLocaleString("en-US")} already existed` : "",
    parsed.invalid ? `${parsed.invalid} invalid` : "",
    parsed.disposable ? `${parsed.disposable} disposable skipped` : "",
    parsed.duplicates ? `${parsed.duplicates} duplicates in the file` : "",
    suppressed ? `${suppressed} skipped (previously bounced or reported spam)` : "",
    parsed.roleAddresses ? `${parsed.roleAddresses} role addresses like info@ (they often perform poorly)` : "",
    truncated ? `${truncated} not imported because you reached your plan limit` : "",
  ].filter(Boolean);
  revalidatePath("/app/contacts");
  go("/app/contacts", "ok", `${notes.join(", ")}.`);
}

export async function createListAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/lists");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) go("/app/lists", "err", "Give the list a name.");
  const { error } = await ctx.db.from("lists").insert({ workspace_id: ctx.workspace.id, name });
  if (error) go("/app/lists", "err", error.code === "23505" ? "You already have a list with that name." : "Couldn’t create the list.");
  revalidatePath("/app/lists");
  go("/app/lists", "ok", "List created.");
}