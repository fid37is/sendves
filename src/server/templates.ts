import "server-only";
import { cloneBlocks, type Block } from "@/lib/email/blocks";
import { BUILT_IN_TEMPLATES, cloneJson, DEFAULT_BRAND_COLOR, DEFAULT_FOOTER_TEXT, designFromLegacyBlocks, designFromRow, designFromStarter, renderCampaignHtml, type Design } from "@/lib/email/campaign";
import { companyVariables, HEX_COLOR_RE } from "@/lib/company";
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

/** The company details a new campaign starts with (Settings → Company). Every field is optional. */
type CompanyDefaults = {
  name: string; business_address?: string | null; company_phone?: string | null; company_email?: string | null; company_website?: string | null;
  brand_color?: string | null; email_footer_text?: string | null;
};

/**
 * Fills a new campaign from the company profile: the brand colour, the footer line and the company details as
 * {{company_name}}-style variables. Only things the person has not chosen are touched: a colour or footer that
 * differs from the built-in default came from the template and is kept, and a variable the template already
 * defines keeps its own value.
 */
export function applyCompanyDefaults(design: Design, variables: VariableDef[], ws: CompanyDefaults): { design: Design; variables: VariableDef[] } {
  const next = cloneJson(design);
  const color = ws.brand_color?.trim();
  if (color && HEX_COLOR_RE.test(color) && next.color.toLowerCase() === DEFAULT_BRAND_COLOR) next.color = color.toLowerCase();
  const footer = ws.email_footer_text?.trim();
  if (footer) {
    if (next.C.foot === DEFAULT_FOOTER_TEXT) next.C.foot = footer;
    for (const list of [next.blocks, next.tray]) for (const b of list) if (b.t === "footer" && b.x === DEFAULT_FOOTER_TEXT) b.x = footer;
  }
  const have = new Set(variables.map((v) => v.key));
  const extra = companyVariables({ name: ws.name, address: ws.business_address, phone: ws.company_phone, email: ws.company_email, website: ws.company_website })
    .filter((v) => !have.has(v.key));
  return { design: next, variables: sanitizeVariables([...variables, ...extra]) };
}

type Owner = { db: Db; workspace: { id: string; name: string; timezone?: string | null } & Partial<CompanyDefaults>; user: { id: string } };

/** Creates a draft campaign from a template and returns its id, or null if it couldn't be saved. */
export async function createDraftFromTemplate(ctx: Owner & { access?: Access | null }, tpl: ResolvedTemplate, name: string): Promise<string | null> {
  // A draft starts in the template's department when the creator may use it, else in their own (or none).
  const a = ctx.access;
  const departmentId = tpl.departmentId && canAccessDepartment(a, tpl.departmentId) ? tpl.departmentId : a && !a.allDepartments ? a.departmentIds[0] ?? null : null;
  // A built-in template is one of the editor's layouts; a saved template of your own becomes a custom layout.
  const base = applyCompanyDefaults(tpl.design ?? designFromLegacyBlocks(tpl.blocks), tpl.variables, ctx.workspace);
  const design = base.design;
  const logo = await getEmailLogo(ctx.db, ctx.workspace.id);
  const { data, error } = await ctx.db.from("campaigns").insert({
    workspace_id: ctx.workspace.id, name, subject: tpl.subject, preview_text: tpl.preview_text,
    design, html: renderCampaignHtml(design, { logo, tz: ctx.workspace.timezone || "UTC" }, tpl.preview_text),
    // The audience starts empty: choosing who receives it is a deliberate step in the editor.
    audience_mode: "custom",
    created_by: ctx.user.id, from_name: ctx.workspace.name, variables: base.variables, department_id: departmentId,
  }).select("id").single();
  return error || !data ? null : (data as { id: string }).id;
}
