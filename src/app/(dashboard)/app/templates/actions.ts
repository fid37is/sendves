"use server";

import { revalidatePath } from "next/cache";
import { canAccessDepartment, canAssignDepartment } from "@/lib/access";
import { cloneBlocks, type Block } from "@/lib/email/blocks";
import { sanitizeDesign } from "@/lib/email/campaign";
import { assetRule } from "@/server/email-assets";
import { sanitizeBlocks } from "@/lib/email/sanitize";
import { sanitizeVariables, type VariableDef } from "@/lib/email/variables";
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

/** Where a new template goes: the requested department if the person may use it, else their default. */
async function departmentFor(ctx: Ctx, requested: unknown): Promise<string | null> {
  const fallback = ctx.access.allDepartments ? null : ctx.access.departmentIds[0] ?? null;
  const id = String(requested ?? "");
  if (!id || !UUID_RE.test(id) || !canAssignDepartment(ctx.access, id)) return fallback;
  const { data } = await ctx.db.from("departments").select("id").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  return data ? id : fallback;
}

/** A template of this workspace that the person may open (not another department's). */
async function loadTemplate(ctx: Ctx, id: string) {
  if (!UUID_RE.test(id)) return null;
  const { data } = await ctx.db.from("templates").select("id, name, description, subject, preview_text, blocks, variables, department_id, design").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  const t = data as { id: string; name: string; description: string | null; subject: string | null; preview_text: string | null; blocks: unknown; variables: unknown; department_id: string | null; design: unknown } | null;
  return t && canAccessDepartment(ctx.access, t.department_id) ? t : null;
}

async function insertTemplate(ctx: Ctx, t: { name: string; description?: string; subject?: string; preview_text?: string; blocks: Block[]; variables?: VariableDef[]; department_id?: string | null; design?: unknown }) {
  const { data, error } = await ctx.db.from("templates").insert({
    workspace_id: ctx.workspace.id, created_by: ctx.user.id,
    name: t.name.slice(0, 120) || "Untitled template", description: t.description ?? "", subject: t.subject ?? "", preview_text: t.preview_text ?? "",
    blocks: t.blocks, variables: t.variables ?? [], department_id: t.department_id ?? null, design: t.design ?? null,
  }).select("id").single();
  return error || !data ? null : (data as { id: string }).id;
}

/** “Use template”: makes a draft campaign from the template and opens it in the editor. */
export async function startFromTemplateAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, ["campaigns.manage", "templates.view"]);
  const tpl = await resolveTemplate(ctx.db, ctx.workspace.id, text(formData, "template", 60), ctx.access);
  if (!tpl) go(BACK, "err", "That template no longer exists.");
  const id = await createDraftFromTemplate(ctx, tpl, `${tpl.name} · ${shortDate()}`);
  if (!id) go(BACK, "err", "Couldn’t start the campaign. Try again.");
  revalidatePath("/app/campaigns");
  go(`/app/campaigns/${id}`, "ok", `Campaign created from “${tpl.name}”. Check the details, choose your audience, then send.`);
}

/**
 * “New template”: templates are built in the campaign editor, so this opens a blank draft there. Once the
 * layout is ready, “Save as template” in the Templates tab keeps it (the draft can then be deleted).
 */
export async function createTemplateAction() {
  const ctx = await requireWorkspace(BACK, ["templates.manage", "campaigns.manage"]);
  if ((await templateCount(ctx)) >= MAX_TEMPLATES) go(BACK, "err", `You can keep up to ${MAX_TEMPLATES} templates. Delete one you no longer use first.`);
  const tpl = await resolveTemplate(ctx.db, ctx.workspace.id, "blank", ctx.access);
  if (!tpl) go(BACK, "err", "Couldn’t start a new template. Try again.");
  const id = await createDraftFromTemplate(ctx, tpl, `New template · ${shortDate()}`);
  if (!id) go(BACK, "err", "Couldn’t start a new template. Try again.");
  revalidatePath("/app/campaigns");
  go(`/app/campaigns/${id}`, "info", "Build your layout, then open the Templates tab and choose “Save as template”.");
}

/** Reads and saves the template editor form. Never redirects. */
async function persistTemplate(ctx: Ctx, formData: FormData) {
  const id = text(formData, "id", 60);
  if (!UUID_RE.test(id)) go(BACK, "err", "Template not found.");
  let input: unknown = [];
  try { input = JSON.parse(String(formData.get("blocks") ?? "[]")); } catch { /* treated as empty */ }
  const existing = await loadTemplate(ctx, id);
  if (!existing) go(BACK, "err", "Template not found.");
  let variablesInput: unknown = [];
  try { variablesInput = JSON.parse(String(formData.get("variables") ?? "[]")); } catch { /* treated as empty */ }
  // Department only changes when the form sends one and the person may use it.
  const department_id = formData.has("departmentId") ? await departmentFor(ctx, text(formData, "departmentId", 60)) : existing.department_id;
  const row = {
    name: text(formData, "name", 120) || "Untitled template",
    description: text(formData, "description", 200),
    subject: text(formData, "subject", 200),
    preview_text: text(formData, "previewText", 200),
    blocks: sanitizeBlocks(input),
    // The block editor works on simple blocks, so saving from it makes them the template (a saved campaign design is replaced).
    design: null,
    variables: sanitizeVariables(variablesInput),
    department_id,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await ctx.db.from("templates").update(row).eq("id", id).eq("workspace_id", ctx.workspace.id).select("id").maybeSingle();
  if (error) go(editor(id), "err", "Couldn’t save the template. Try again.");
  if (!data) go(BACK, "err", "Template not found.");
  revalidatePath(BACK);
  return { id, name: row.name };
}

export async function saveTemplateAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "templates.manage");
  const t = await persistTemplate(ctx, formData);
  go(editor(t.id), "ok", "Template saved.");
}

/** Saves, then opens a new campaign made from the saved template. */
export async function saveAndUseTemplateAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, ["templates.manage", "campaigns.manage"]);
  const t = await persistTemplate(ctx, formData);
  const tpl = await resolveTemplate(ctx.db, ctx.workspace.id, t.id, ctx.access);
  if (!tpl) go(BACK, "err", "Template not found.");
  const id = await createDraftFromTemplate(ctx, tpl, `${tpl.name} · ${shortDate()}`);
  if (!id) go(editor(t.id), "err", "Saved, but couldn’t start the campaign. Try again from the Templates page.");
  revalidatePath("/app/campaigns");
  go(`/app/campaigns/${id}`, "ok", `Template saved. Campaign created from “${tpl.name}”.`);
}

export async function deleteTemplateAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "templates.manage");
  const t = await loadTemplate(ctx, text(formData, "id", 60));
  if (t) await ctx.db.from("templates").delete().eq("id", t.id).eq("workspace_id", ctx.workspace.id);
  revalidatePath(BACK);
  go(BACK, "ok", "Template deleted. Campaigns already made from it are not affected.");
}

/**
 * Makes an independent copy of a template (content, formatting and variables) that can be renamed
 * and edited without touching the original, and opens it.
 */
export async function duplicateTemplateAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "templates.manage");
  const t = await loadTemplate(ctx, text(formData, "id", 60));
  if (!t) go(BACK, "err", "Template not found.");
  if ((await templateCount(ctx)) >= MAX_TEMPLATES) go(BACK, "err", `You can keep up to ${MAX_TEMPLATES} templates. Delete one you no longer use first.`);
  const id = await insertTemplate(ctx, {
    name: `${t.name} (copy)`.slice(0, 120),
    description: t.description ?? "", subject: t.subject ?? "", preview_text: t.preview_text ?? "",
    blocks: cloneBlocks(sanitizeBlocks(t.blocks)), // fresh block ids: the copy shares nothing with the original
    variables: sanitizeVariables(t.variables),
    design: t.design ?? null, // a design is copied as is, so the duplicate looks identical
    department_id: t.department_id && canAssignDepartment(ctx.access, t.department_id) ? t.department_id : await departmentFor(ctx, null),
  });
  if (!id) go(BACK, "err", "Couldn’t duplicate the template. Try again.");
  revalidatePath(BACK);
  go(editor(id), "ok", `“${t.name}” duplicated. Rename the copy and edit it freely; the original is unchanged.`);
}

export type SaveTemplateResult = { ok: true; id: string; name: string } | { ok: false; error: string };

/**
 * From the campaign editor: keeps the current layout as a template, without leaving the editor.
 * The template takes the campaign's own title; nothing else is asked.
 */
export async function saveCampaignAsTemplateAction(input: { name: string; description?: string; subject: string; previewText: string; design: unknown; variables?: unknown; departmentId?: string | null }): Promise<SaveTemplateResult> {
  const ctx = await requireWorkspace("/app/campaigns", ["templates.manage", "campaigns.view"]);
  // The editor's own model, checked again here: only this workspace's pictures, valid links and colours.
  const design = sanitizeDesign(input?.design, assetRule(ctx.workspace.id));
  if (design.tpl === "custom" && design.blocks.length === 0) return { ok: false, error: "Add some content before saving it as a template." };
  if ((await templateCount(ctx)) >= MAX_TEMPLATES) return { ok: false, error: `You can keep up to ${MAX_TEMPLATES} templates. Delete one you no longer use first.` };
  const name = clean(input?.name, 120) || "Untitled template";
  const id = await insertTemplate(ctx, {
    // The design is the template; `blocks` stays empty (it belongs to the older block editor).
    name, description: clean(input?.description, 200), subject: clean(input?.subject, 200), preview_text: clean(input?.previewText, 200), blocks: [], design,
    variables: sanitizeVariables(input?.variables), department_id: await departmentFor(ctx, input?.departmentId),
  });
  if (!id) return { ok: false, error: "Couldn’t save the template. Try again." };
  revalidatePath(BACK);
  return { ok: true, id, name };
}
