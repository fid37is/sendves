"use server";

import { can, NO_PERMISSION, type Permission } from "@/lib/access";
import { getContext } from "@/lib/workspace";
import { parsePastedContacts } from "@/lib/validation/paste-contacts";
import { audienceSize, ingestContacts, parseSelection, type IngestResult } from "@/server/audience";
import { parseContactsCsv } from "@/server/imports";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PASTE_CHARS = 200_000;
const MAX_PASTE_ROWS = 2000;

/** Signed-in, with a workspace and the given permissions. Returns a message instead of redirecting. */
async function authorize(...need: Permission[]) {
  const ctx = await getContext();
  if (!ctx?.workspace || !ctx.db || !ctx.access) return { ok: false as const, error: "Your workspace isn’t available right now. Refresh and try again." };
  if (!need.every((p) => can(ctx.access, p))) return { ok: false as const, error: NO_PERMISSION };
  return { ok: true as const, ctx: { db: ctx.db, workspace: ctx.workspace, access: ctx.access } };
}

const fail = (error: string): IngestResult => ({
  ok: false, error, contacts: [], created: 0, alreadyInContacts: 0, skipped: [], skippedCount: 0, invalid: 0, duplicates: 0, roleAddresses: 0, message: error,
});

/** How many people this selection reaches, counted once each. Works on unsaved selections. */
export async function audienceSizeAction(selection: unknown): Promise<{ ok: true; size: number } | { ok: false; error: string }> {
  const a = await authorize("campaigns.view");
  if (!a.ok) return { ok: false, error: a.error };
  return { ok: true, size: await audienceSize(a.ctx, parseSelection(selection)) };
}

export type FoundContact = { id: string; email: string; name: string; subscribed: boolean };

/** Finds contacts by name or email for the "Pick people" search. */
export async function searchContactsAction(query: string): Promise<{ ok: true; contacts: FoundContact[] } | { ok: false; error: string }> {
  const a = await authorize("contacts.view", "campaigns.manage");
  if (!a.ok) return { ok: false, error: a.error };
  // Strip characters that mean something in a filter expression, then match name or email.
  const q = String(query ?? "").replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  let req = a.ctx.db.from("contacts").select("id, email, first_name, last_name, status").eq("workspace_id", a.ctx.workspace.id).order("created_at", { ascending: false }).limit(20);
  if (q) req = req.or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
  const { data } = await req;
  return {
    ok: true,
    contacts: ((data ?? []) as any[]).map((c) => ({ id: c.id, email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(" "), subscribed: c.status === "subscribed" })),
  };
}

/** Pasted addresses: one per line or comma-separated, optionally with names. */
export async function pasteAudienceAction(input: { text: string; consent: boolean }): Promise<IngestResult> {
  const a = await authorize("campaigns.manage", "contacts.view");
  if (!a.ok) return fail(a.error);
  const text = String(input?.text ?? "").slice(0, MAX_PASTE_CHARS);
  if (!text.trim()) return fail("Paste at least one email address.");
  const parsed = parsePastedContacts(text);
  if (parsed.contacts.length > MAX_PASTE_ROWS) return fail(`Paste up to ${MAX_PASTE_ROWS.toLocaleString("en-US")} addresses at a time. For more, import a file.`);
  const canCreate = can(a.ctx.access, "contacts.manage");
  if (canCreate && input?.consent !== true) return fail("Confirm that these people agreed to receive your emails.");
  return ingestContacts(a.ctx, parsed.contacts.map((c) => ({ email: c.email, firstName: c.firstName, lastName: c.lastName })), {
    canCreate, source: "campaign audience", invalid: parsed.invalidCount, duplicates: parsed.duplicates,
  });
}

/** An uploaded CSV (or a plain text file with one address per line). */
export async function importAudienceFileAction(formData: FormData): Promise<IngestResult> {
  const a = await authorize("campaigns.manage", "contacts.view");
  if (!a.ok) return fail(a.error);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV or text file.");
  if (file.size > MAX_FILE_BYTES) return fail("That file is larger than 5 MB. Split it, or import it into a list on the Contacts page.");
  const name = file.name.toLowerCase();
  if (!/\.(csv|txt)$/.test(name) && !/^(text\/csv|text\/plain|application\/vnd\.ms-excel)$/.test(file.type)) return fail("Only .csv and .txt files are supported.");
  const canCreate = can(a.ctx.access, "contacts.manage");
  if (canCreate && formData.get("consent") !== "on") return fail("Confirm that these people agreed to receive your emails.");

  const body = await file.text();
  if (name.endsWith(".txt")) {
    const parsed = parsePastedContacts(body);
    return ingestContacts(a.ctx, parsed.contacts.map((c) => ({ email: c.email, firstName: c.firstName, lastName: c.lastName })), {
      canCreate, source: "campaign audience", invalid: parsed.invalidCount, duplicates: parsed.duplicates,
    });
  }
  const parsed = parseContactsCsv(body);
  if (parsed.error) return fail(parsed.error);
  return ingestContacts(a.ctx, parsed.rows.map((r) => ({ email: r.email, firstName: r.first_name, lastName: r.last_name, custom: r.custom })), {
    canCreate, source: "csv import", invalid: parsed.invalid + parsed.disposable, duplicates: parsed.duplicates, roleAddresses: parsed.roleAddresses,
  });
}
