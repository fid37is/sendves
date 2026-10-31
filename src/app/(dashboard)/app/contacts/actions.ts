"use server";

import { revalidatePath } from "next/cache";
import { limitsFor } from "@/config/plan-limits";
import { canAccessDepartment, canAssignDepartment, type Access } from "@/lib/access";
import { go } from "@/lib/flash";
import { requireWorkspace } from "@/lib/workspace";
import { checkEmail } from "@/lib/validation/email";
import { parseContactsCsv } from "@/server/imports";

const MAX_BYTES = 5 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Most contacts one bulk action can touch (the table shows 25 per page). */
const MAX_SELECTION = 100;

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

/**
 * Department for a list created without an explicit choice: organization-wide for people who can see
 * every department, otherwise their own (first) department so they can still see what they create.
 */
function defaultDepartment(access: Access): string | null {
  return access.allDepartments ? null : access.departmentIds[0] ?? null;
}

/** Finds the requested list, or creates one (adding " (2)", " (3)"… if the name is taken). */
async function resolveAudienceList(ctx: Awaited<ReturnType<typeof requireWorkspace>>, audience: NonNullable<AddContactsInput["audience"]>) {
  if ("listId" in audience) {
    const { data } = await ctx.db.from("lists").select("id, name, department_id").eq("id", String(audience.listId)).eq("workspace_id", ctx.workspace.id).maybeSingle();
    const row = data as { id: string; name: string; department_id: string | null } | null;
    return row && canAccessDepartment(ctx.access, row.department_id) ? { id: row.id, name: row.name } : null;
  }
  const base = String(audience.newListName ?? "").trim().slice(0, 70) || "New audience";
  for (let n = 1; n <= 20; n++) {
    const name = n === 1 ? base : `${base} (${n})`;
    const { data, error } = await ctx.db.from("lists").insert({ workspace_id: ctx.workspace.id, name, department_id: defaultDepartment(ctx.access) }).select("id, name").single();
    if (!error && data) return data as { id: string; name: string };
    if (error?.code !== "23505") return null;
  }
  return null;
}

/** Adds one or several contacts in a single save. Problem rows are reported back; the rest are saved. */
export async function addContactsAction(input: AddContactsInput): Promise<AddContactsResult> {
  const ctx = await requireWorkspace("/app/contacts", "contacts.manage");
  const rowErrors: AddContactsResult["rowErrors"] = [];
  const fail = (error: string): AddContactsResult => ({ added: 0, error, rowErrors });

  if (!input || !Array.isArray(input.contacts)) return fail("Add at least one contact.");
  if (input.consent !== true) return fail("Confirm consent first.");
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
    if (!target) return { added: toInsert.length, error: "Saved, but not added to a list.", rowErrors };
    const members = [...insertedIds, ...alreadyThere].map((m) => ({ list_id: target.id, contact_id: m.id }));
    const { error: memberError } = await ctx.db.from("list_members").upsert(members, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
    if (memberError) return { added: toInsert.length, error: "Saved, but not added to the list.", rowErrors };
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
  ].filter(Boolean).join(", ") + (list ? ` · list: ${list.name}.` : ".");
  return { added: toInsert.length + alreadyThere.length, message, rowErrors, list };
}

export async function importContactsAction(formData: FormData) {
  const back = "/app/contacts/import";
  const ctx = await requireWorkspace(back, "contacts.manage");

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

  // List: existing id (must belong to this workspace), or a new list name.
  let listId = String(formData.get("listId") ?? "");
  if (listId) {
    const { data: own } = UUID_RE.test(listId)
      ? await ctx.db.from("lists").select("id, department_id").eq("id", listId).eq("workspace_id", ctx.workspace.id).maybeSingle()
      : { data: null };
    if (!own || !canAccessDepartment(ctx.access, (own as { department_id: string | null }).department_id)) go(back, "err", "That list no longer exists. Choose another list.");
    listId = own?.id ?? "";
  }
  const newList = String(formData.get("newList") ?? "").trim();
  if (newList) {
    const { data: l, error } = await ctx.db.from("lists").insert({ workspace_id: ctx.workspace.id, name: newList.slice(0, 80), department_id: defaultDepartment(ctx.access) }).select("id, department_id").single();
    if (error) {
      const { data: existing } = await ctx.db.from("lists").select("id, department_id").eq("workspace_id", ctx.workspace.id).eq("name", newList).maybeSingle();
      listId = existing && canAccessDepartment(ctx.access, existing.department_id) ? existing.id : "";
    } else listId = l.id;
  }

  let added = 0;
  let suppressed = 0;
  for (let i = 0; i < rows.length; i += 500) {
    let chunk = rows.slice(i, i + 500);
    const { data: blocked } = await ctx.db.from("suppression_entries").select("email").or(`workspace_id.is.null,workspace_id.eq.${ctx.workspace.id}`).in("email", chunk.map((r) => r.email));
    const blockedSet = new Set((blocked ?? []).map((b: any) => b.email.toLowerCase()));
    suppressed += chunk.filter((r) => blockedSet.has(r.email)).length;
    chunk = chunk.filter((r) => !blockedSet.has(r.email));
    if (chunk.length === 0) continue;

    const now = new Date().toISOString();
    const { data: inserted } = await ctx.db.from("contacts")
      .upsert(chunk.map((r) => ({ workspace_id: ctx.workspace.id, email: r.email, first_name: r.first_name, last_name: r.last_name, custom_fields: r.custom, source: "csv import", consented_at: now })), { onConflict: "workspace_id,email", ignoreDuplicates: true })
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
  go(listId ? `/app/contacts?list=${listId}` : "/app/contacts", "ok", `${notes.join(", ")}.`);
}

// ── Lists ───────────────────────────────────────────────────────────

export type ListActionResult = { ok: boolean; message?: string; error?: string; id?: string };

type Ws = Awaited<ReturnType<typeof requireWorkspace>>;

const cleanName = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 80);

/** Valid, de-duplicated ids from the client, or null when the selection is empty or too large. */
function cleanIds(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const ids = Array.from(new Set(v.map(String).filter((id) => UUID_RE.test(id))));
  return ids.length > 0 && ids.length <= MAX_SELECTION ? ids : null;
}

async function ownedList(ctx: Ws, id: unknown) {
  const listId = String(id ?? "");
  if (!UUID_RE.test(listId)) return null;
  const { data } = await ctx.db.from("lists").select("id, name, department_id").eq("id", listId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  const row = data as { id: string; name: string; department_id: string | null } | null;
  // A list that belongs to another department behaves as if it doesn't exist.
  return row && canAccessDepartment(ctx.access, row.department_id) ? { id: row.id, name: row.name } : null;
}

/** Only ids of contacts that belong to this workspace survive. */
async function ownedContactIds(ctx: Ws, ids: string[]) {
  const { data } = await ctx.db.from("contacts").select("id").eq("workspace_id", ctx.workspace.id).in("id", ids);
  return (data ?? []).map((c: { id: string }) => c.id);
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const SELECTION_ERROR = `Select between 1 and ${MAX_SELECTION} contacts.`;

export async function createListAction(input: { name: string; departmentId?: string }): Promise<ListActionResult> {
  const ctx = await requireWorkspace("/app/contacts", "contacts.manage");
  const name = cleanName(input?.name);
  if (!name) return { ok: false, error: "Give the list a name." };
  let departmentId = defaultDepartment(ctx.access);
  if (input?.departmentId !== undefined) {
    const wanted = String(input.departmentId || "");
    if (wanted && !UUID_RE.test(wanted)) return { ok: false, error: "Choose a valid department." };
    if (wanted) {
      const { data: dept } = await ctx.db.from("departments").select("id").eq("id", wanted).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (!dept || !canAssignDepartment(ctx.access, wanted)) return { ok: false, error: "Choose a department you belong to." };
      departmentId = wanted;
    } else {
      if (!canAssignDepartment(ctx.access, null)) return { ok: false, error: "Choose a department you belong to." };
      departmentId = null;
    }
  }
  const { data, error } = await ctx.db.from("lists").insert({ workspace_id: ctx.workspace.id, name, department_id: departmentId }).select("id").single();
  if (error || !data) return { ok: false, error: error?.code === "23505" ? "You already have a list with that name." : "Couldn’t create the list." };
  revalidatePath("/app/contacts");
  return { ok: true, id: data.id, message: `List “${name}” created.` };
}

export async function renameListAction(input: { listId: string; name: string }): Promise<ListActionResult> {
  const ctx = await requireWorkspace("/app/contacts", "contacts.manage");
  const list = await ownedList(ctx, input?.listId);
  if (!list) return { ok: false, error: "That list no longer exists." };
  const name = cleanName(input?.name);
  if (!name) return { ok: false, error: "Give the list a name." };
  const { error } = await ctx.db.from("lists").update({ name }).eq("id", list.id).eq("workspace_id", ctx.workspace.id);
  if (error) return { ok: false, error: error.code === "23505" ? "You already have a list with that name." : "Couldn’t rename the list." };
  revalidatePath("/app/contacts");
  revalidatePath("/app/campaigns");
  return { ok: true, message: "List renamed." };
}

/**
 * Deletes a list (the contacts stay). Blocked while an unfinished campaign still targets it:
 * deleting would shrink that campaign's audience.
 */
export async function deleteListAction(input: { listId: string }): Promise<ListActionResult> {
  const ctx = await requireWorkspace("/app/contacts", "contacts.manage");
  const list = await ownedList(ctx, input?.listId);
  if (!list) return { ok: false, error: "That list no longer exists." };

  const { data: using } = await ctx.db.from("campaign_audience_lists").select("campaign_id, campaigns!inner(status, workspace_id)")
    .eq("list_id", list.id).eq("campaigns.workspace_id", ctx.workspace.id).in("campaigns.status", ["draft", "scheduled", "sending", "paused"]);
  const count = (using ?? []).length;
  if (count > 0) {
    return { ok: false, error: `“${list.name}” is the audience of ${plural(count, "campaign", "campaigns")} that haven’t finished sending. Change their audience or delete them first.` };
  }

  const { error } = await ctx.db.from("lists").delete().eq("id", list.id).eq("workspace_id", ctx.workspace.id);
  if (error) return { ok: false, error: "Couldn’t delete the list." };
  revalidatePath("/app/contacts");
  revalidatePath("/app/campaigns");
  return { ok: true, message: `List “${list.name}” deleted. Its contacts are still in your account.` };
}

// ── Contacts inside lists ───────────────────────────────────────────

export async function addToListAction(input: { listId: string; contactIds: string[] }): Promise<ListActionResult> {
  const ctx = await requireWorkspace("/app/contacts", "contacts.manage");
  const ids = cleanIds(input?.contactIds);
  if (!ids) return { ok: false, error: SELECTION_ERROR };
  const list = await ownedList(ctx, input?.listId);
  if (!list) return { ok: false, error: "Choose a list." };
  const owned = await ownedContactIds(ctx, ids);
  if (owned.length === 0) return { ok: false, error: "Those contacts no longer exist." };

  const { error } = await ctx.db.from("list_members").upsert(owned.map((contact_id) => ({ list_id: list.id, contact_id })), { onConflict: "list_id,contact_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Couldn’t add to the list." };
  revalidatePath("/app/contacts");
  return { ok: true, message: `${plural(owned.length, "contact", "contacts")} in “${list.name}”.` };
}

export async function moveContactsAction(input: { fromListId: string; toListId: string; contactIds: string[] }): Promise<ListActionResult> {
  const ctx = await requireWorkspace("/app/contacts", "contacts.manage");
  const ids = cleanIds(input?.contactIds);
  if (!ids) return { ok: false, error: SELECTION_ERROR };
  const [from, to] = await Promise.all([ownedList(ctx, input?.fromListId), ownedList(ctx, input?.toListId)]);
  if (!from || !to) return { ok: false, error: "That list no longer exists." };
  if (from.id === to.id) return { ok: false, error: "Choose a different list." };
  const owned = await ownedContactIds(ctx, ids);
  if (owned.length === 0) return { ok: false, error: "Those contacts no longer exist." };

  // Add first, remove second: if anything fails, nobody ends up in no list.
  const { error: addError } = await ctx.db.from("list_members").upsert(owned.map((contact_id) => ({ list_id: to.id, contact_id })), { onConflict: "list_id,contact_id", ignoreDuplicates: true });
  if (addError) return { ok: false, error: "Couldn’t move contacts." };
  const { error: removeError } = await ctx.db.from("list_members").delete().eq("list_id", from.id).in("contact_id", owned);
  revalidatePath("/app/contacts");
  if (removeError) return { ok: false, error: `They were added to “${to.name}”, but couldn’t be removed from “${from.name}”. Remove them from it to finish.` };
  return { ok: true, message: `${plural(owned.length, "contact", "contacts")} moved from “${from.name}” to “${to.name}”.` };
}

export async function removeFromListAction(input: { listId: string; contactIds: string[] }): Promise<ListActionResult> {
  const ctx = await requireWorkspace("/app/contacts", "contacts.manage");
  const ids = cleanIds(input?.contactIds);
  if (!ids) return { ok: false, error: SELECTION_ERROR };
  const list = await ownedList(ctx, input?.listId);
  if (!list) return { ok: false, error: "That list no longer exists." };
  const owned = await ownedContactIds(ctx, ids);

  const { error } = await ctx.db.from("list_members").delete().eq("list_id", list.id).in("contact_id", owned);
  if (error) return { ok: false, error: "Couldn’t remove contacts." };
  revalidatePath("/app/contacts");
  return { ok: true, message: `${plural(owned.length, "contact", "contacts")} removed from “${list.name}”. They’re still in your contacts.` };
}

/** Permanently deletes contacts. Unsubscribes stay on the suppression list, so they can’t be emailed again. */
export async function deleteContactsAction(input: { contactIds: string[] }): Promise<ListActionResult> {
  const ctx = await requireWorkspace("/app/contacts", "contacts.manage");
  const ids = cleanIds(input?.contactIds);
  if (!ids) return { ok: false, error: SELECTION_ERROR };
  const owned = await ownedContactIds(ctx, ids);
  if (owned.length === 0) return { ok: false, error: "Those contacts no longer exist." };

  const { error } = await ctx.db.from("contacts").delete().eq("workspace_id", ctx.workspace.id).in("id", owned);
  if (error) return { ok: false, error: "Couldn’t delete contacts." };
  revalidatePath("/app/contacts");
  return { ok: true, message: `${plural(owned.length, "contact", "contacts")} deleted.` };
}

/** Sets the names used by {{first_name}} and {{last_name}} for one contact. */
export async function updateContactNameAction(input: { contactId: string; firstName: string; lastName: string }): Promise<ListActionResult> {
  const ctx = await requireWorkspace("/app/contacts", "contacts.manage");
  const id = String(input?.contactId ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "Contact not found." };
  const first = cleanName(input?.firstName);
  const last = cleanName(input?.lastName);
  const { data, error } = await ctx.db.from("contacts").update({ first_name: first || null, last_name: last || null })
    .eq("id", id).eq("workspace_id", ctx.workspace.id).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn’t save contact." };
  revalidatePath("/app/contacts");
  return { ok: true, message: "Contact updated." };
}
