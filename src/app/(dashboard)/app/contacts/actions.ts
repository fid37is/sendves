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

export async function addContactAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/contacts");
  const check = checkEmail(String(formData.get("email") ?? ""));
  if (!check.ok) go("/app/contacts", "err", check.reason === "disposable" ? "Disposable email addresses aren’t allowed." : "Enter a valid email address.");
  if (formData.get("consent") !== "on") go("/app/contacts", "err", "Confirm that this person agreed to receive your emails.");

  const { room } = await remainingRoom(ctx);
  if (room <= 0) go("/app/contacts", "err", "You’ve reached your contact limit. Upgrade your plan to add more.");

  const { count: blocked } = await ctx.db.from("suppression_entries").select("id", { count: "exact", head: true }).eq("email", check.email).is("workspace_id", null);
  if (blocked) go("/app/contacts", "err", "That address previously bounced or reported spam, so it can’t be added.");

  const { error } = await ctx.db.from("contacts").insert({
    workspace_id: ctx.workspace.id, email: check.email,
    first_name: String(formData.get("firstName") ?? "").trim() || null,
    last_name: String(formData.get("lastName") ?? "").trim() || null,
    source: "manual", consented_at: new Date().toISOString(),
  });
  if (error) go("/app/contacts", "err", error.code === "23505" ? "That contact already exists." : "Couldn’t add the contact. Try again.");
  revalidatePath("/app/contacts");
  go("/app/contacts", "ok", "Contact added.");
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
