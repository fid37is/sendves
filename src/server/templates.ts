import "server-only";
import { cloneBlocks, type Block } from "@/lib/email/blocks";
import { BUILT_IN_TEMPLATES, designFromLegacyBlocks, designFromRow, designFromStarter, renderCampaignHtml, type Design } from "@/lib/email/campaign";
import { assetRule, getEmailLogo } from "@/server/email-assets";
import { sanitizeBlocks } from "@/lib/email/sanitize";
import { sanitizeVariables, type VariableDef } from "@/lib/email/variables";
import { canAccessDepartment, type Access } from "@/lib/access";
import type { Db } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolvedTemplate = { id: string; name: string; description: string; subject: string; preview_text: string; blocks: Block[]; variables: VariableDef[]; departmentId: string | null;
  /** The editor design it starts with: set for built-in templates and templates saved from the editor. Older ones have `blocks` instead. */
  design: Design | null;
};

/** A built-in template (by slug) or one of this workspace's own templates (by id). Blocks come back with fresh ids. */
export async function resolveTemplate(db: Db, workspaceId: string, id: string, access?: Access | null): Promise<ResolvedTemplate | null> {
  const starter = BUILT_IN_TEMPLATES.find((t) => t.id === id);
  if (starter) {
    return { id: starter.id, name: starter.name, description: starter.description, subject: starter.subject, preview_text: starter.previewText, blocks: [], variables: [], departmentId: null, design: designFromStarter(starter.id) };
  }
  if (!UUID_RE.test(id)) return null;
  const { data } = await db.from("templates").select("id, name, description, subject, preview_text, blocks, variables, department_id, design").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!data) return null;
  const t = data as any;
  // A template of another department behaves as if it doesn't exist.
  if (access !== undefined && !canAccessDepartment(access, t.department_id)) return null;
  return { id: t.id, name: t.name, description: t.description ?? "", subject: t.subject ?? "", preview_text: t.preview_text ?? "", blocks: cloneBlocks(sanitizeBlocks(t.blocks)), variables: sanitizeVariables(t.variables), departmentId: t.department_id ?? null,
    // A template saved from the editor carries its design; an older one has blocks only.
    design: t.design ? designFromRow(t.design, [], assetRule(workspaceId)) : null };
}

type Owner = { db: Db; workspace: { id: string; name: string; timezone?: string | null }; user: { id: string } };

/** Creates a draft campaign from a template and returns its id, or null if it couldn't be saved. */
export async function createDraftFromTemplate(ctx: Owner & { access?: Access | null }, tpl: ResolvedTemplate, name: string): Promise<string | null> {
  // A draft starts in the template's department when the creator may use it, else in their own (or none).
  const a = ctx.access;
  const departmentId = tpl.departmentId && canAccessDepartment(a, tpl.departmentId) ? tpl.departmentId : a && !a.allDepartments ? a.departmentIds[0] ?? null : null;
  // A built-in template is one of the editor's layouts; a saved template of your own becomes a custom layout.
  const design = tpl.design ?? designFromLegacyBlocks(tpl.blocks);
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
