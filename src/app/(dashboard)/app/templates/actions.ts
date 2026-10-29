"use server";

import { revalidatePath } from "next/cache";
import { cloneBlocks, type Block } from "@/lib/email/blocks";
import { sanitizeBlocks } from "@/lib/email/sanitize";
import { go } from "@/lib/flash";
import { requireWorkspace } from "@/lib/workspace";
import { createDraftFromTemplate, resolveTemplate } from "@/server/templates";

type Ctx = Awaited<ReturnType<typeof requireWorkspace>>;
const BACK = "/app/templates";
const MAX_TEMPLATES = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const shortDate = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const editor = (id: string) => `${BACK}/${id}`;

async function templateCount(ctx: Ctx) {
  const { count } = await ctx.db.from("templates").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
  return count ?? 0;
}

async function insertTemplate(ctx: Ctx, t: { name: string; description?: string; subject?: string; preview_text?: string; blocks: Block[] }) {
  const { data, error } = await ctx.db.from("templates").insert({
    workspace_id: ctx.workspace.id, created_by: ctx.user.id,
    name: t.name.slice(0, 120) || "Untitled template", description: t.description ?? "", subject: t.subject ?? "", preview_text: t.preview_text ?? "",
    blocks: t.blocks,
  }).select("id").single();
  return error || !data ? null : (data as { id: string }).id;
}

/** “Use template”: makes a draft campaign from the template and opens it in the editor. */
export async function startFromTemplateAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const tpl = await resolveTemplate(ctx.db, ctx.workspace.id, text(formData, "template", 60));
  if (!tpl) go(BACK, "err", "That template no longer exists.");
  const id = await createDraftFromTemplate(ctx, tpl, `${tpl.name} · ${shortDate()}`);
  if (!id) go(BACK, "err", "Couldn’t start the campaign. Try again.");
  revalidatePath("/app/campaigns");
  go(`/app/campaigns/${id}`, "ok", `Campaign created from “${tpl.name}”. Check the details, choose your audience, then send.`);
}

/** “New template”: starts a small editable template and opens it. */
export async function createTemplateAction() {
  const ctx = await requireWorkspace(BACK);
  if ((await templateCount(ctx)) >= MAX_TEMPLATES) go(BACK, "err", `You can keep up to ${MAX_TEMPLATES} templates. Delete one you no longer use first.`);
  const blocks = cloneBlocks([
    { id: "h", type: "heading", text: "Your headline" },
    { id: "t", type: "text", text: "Hi {{first_name|there}},\n\nWrite your message here." },
  ]);
  const id = await insertTemplate(ctx, { name: "Untitled template", blocks });
  if (!id) go(BACK, "err", "Couldn’t create the template. Try again.");
  go(editor(id), "ok", "Template created. Give it a name and build your layout.");
}

/** Reads and saves the template editor form. Never redirects. */
async function persistTemplate(ctx: Ctx, formData: FormData) {
  const id = text(formData, "id", 60);
  if (!UUID_RE.test(id)) go(BACK, "err", "Template not found.");
  let input: unknown = [];
  try { input = JSON.parse(String(formData.get("blocks") ?? "[]")); } catch { /* treated as empty */ }
  const row = {
    name: text(formData, "name", 120) || "Untitled template",
    description: text(formData, "description", 200),
    subject: text(formData, "subject", 200),
    preview_text: text(formData, "previewText", 200),
    blocks: sanitizeBlocks(input),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await ctx.db.from("templates").update(row).eq("id", id).eq("workspace_id", ctx.workspace.id).select("id").maybeSingle();
  if (error) go(editor(id), "err", "Couldn’t save the template. Try again.");
  if (!data) go(BACK, "err", "Template not found.");
  revalidatePath(BACK);
  return { id, name: row.name };
}

export async function saveTemplateAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const t = await persistTemplate(ctx, formData);
  go(editor(t.id), "ok", "Template saved.");
}

/** Saves, then opens a new campaign made from the saved template. */
export async function saveAndUseTemplateAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const t = await persistTemplate(ctx, formData);
  const tpl = await resolveTemplate(ctx.db, ctx.workspace.id, t.id);
  if (!tpl) go(BACK, "err", "Template not found.");
  const id = await createDraftFromTemplate(ctx, tpl, `${tpl.name} · ${shortDate()}`);
  if (!id) go(editor(t.id), "err", "Saved, but couldn’t start the campaign. Try again from the Templates page.");
  revalidatePath("/app/campaigns");
  go(`/app/campaigns/${id}`, "ok", `Template saved. Campaign created from “${tpl.name}”.`);
}

export async function deleteTemplateAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const id = text(formData, "id", 60);
  if (UUID_RE.test(id)) await ctx.db.from("templates").delete().eq("id", id).eq("workspace_id", ctx.workspace.id);
  revalidatePath(BACK);
  go(BACK, "ok", "Template deleted. Campaigns already made from it are not affected.");
}

export type SaveTemplateResult = { ok: true; id: string; name: string } | { ok: false; error: string };

/** From the campaign editor: keeps the current layout as a template, without leaving the editor. */
export async function saveCampaignAsTemplateAction(input: { name: string; subject: string; previewText: string; blocks: unknown }): Promise<SaveTemplateResult> {
  const ctx = await requireWorkspace("/app/campaigns");
  const blocks = sanitizeBlocks(input?.blocks);
  if (blocks.length === 0) return { ok: false, error: "Add some content before saving it as a template." };
  if ((await templateCount(ctx)) >= MAX_TEMPLATES) return { ok: false, error: `You can keep up to ${MAX_TEMPLATES} templates. Delete one you no longer use first.` };
  const name = clean(input?.name, 120) || "Untitled template";
  const id = await insertTemplate(ctx, { name, subject: clean(input?.subject, 200), preview_text: clean(input?.previewText, 200), blocks });
  if (!id) return { ok: false, error: "Couldn’t save the template. Try again." };
  revalidatePath(BACK);
  return { ok: true, id, name };
}
