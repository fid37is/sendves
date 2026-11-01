import "server-only";
import { starterTemplates } from "@/config/starter-templates";
import { cloneBlocks, type Block } from "@/lib/email/blocks";
import { designFromLegacyBlocks, designFromStarter, renderCampaignHtml } from "@/lib/email/campaign";
import { getEmailLogo } from "@/server/email-assets";
import { sanitizeBlocks } from "@/lib/email/sanitize";
import { sanitizeVariables, type VariableDef } from "@/lib/email/variables";
import { canAccessDepartment, type Access } from "@/lib/access";
import type { Db } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolvedTemplate = { id: string; name: string; description: string; subject: string; preview_text: string; blocks: Block[]; variables: VariableDef[]; departmentId: string | null };

/** A built-in starter (by slug) or one of this workspace's own templates (by id). Blocks come back with fresh ids. */
export async function resolveTemplate(db: Db, workspaceId: string, id: string, access?: Access | null): Promise<ResolvedTemplate | null> {
  const starter = starterTemplates.find((t) => t.id === id);
  if (starter) {
    return { id: starter.id, name: starter.name, description: starter.description, subject: starter.subject ?? "", preview_text: starter.previewText ?? "", blocks: cloneBlocks(starter.blocks), variables: [], departmentId: null };
  }
  if (!UUID_RE.test(id)) return null;
  const { data } = await db.from("templates").select("id, name, description, subject, preview_text, blocks, variables, department_id").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!data) return null;
  const t = data as any;
  // A template of another department behaves as if it doesn't exist.
  if (access !== undefined && !canAccessDepartment(access, t.department_id)) return null;
  return { id: t.id, name: t.name, description: t.description ?? "", subject: t.subject ?? "", preview_text: t.preview_text ?? "", blocks: cloneBlocks(sanitizeBlocks(t.blocks)), variables: sanitizeVariables(t.variables), departmentId: t.department_id ?? null };
}

type Owner = { db: Db; workspace: { id: string; name: string; timezone?: string | null }; user: { id: string } };

/** Creates a draft campaign from a template and returns its id, or null if it couldn't be saved. */
export async function createDraftFromTemplate(ctx: Owner & { access?: Access | null }, tpl: ResolvedTemplate, name: string): Promise<string | null> {
  // A draft starts in the template's department when the creator may use it, else in their own (or none).
  const a = ctx.access;
  const departmentId = tpl.departmentId && canAccessDepartment(a, tpl.departmentId) ? tpl.departmentId : a && !a.allDepartments ? a.departmentIds[0] ?? null : null;
  // The built-in starters become one of the editor's layouts; anything else (a saved template) becomes a custom layout.
  const design = designFromStarter(tpl.id) ?? designFromLegacyBlocks(tpl.blocks);
  const logo = await getEmailLogo(ctx.db, ctx.workspace.id);
  const { data, error } = await ctx.db.from("campaigns").insert({
    workspace_id: ctx.workspace.id, name, subject: tpl.subject, preview_text: tpl.preview_text,
    design, html: renderCampaignHtml(design, { logo, tz: ctx.workspace.timezone || "UTC" }, tpl.preview_text),
    // The audience starts empty: choosing who receives it is a deliberate step in the editor.
    audience_mode: "custom",
    created_by: ctx.user.id, from_name: ctx.workspace.name, variables: tpl.variables, department_id: departmentId,
  }).select("id").single();
  return error || !data ? null : (data as { id: string }).id;
}
