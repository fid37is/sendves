import "server-only";
import { starterTemplates } from "@/config/starter-templates";
import { cloneBlocks, renderBlocks, type Block } from "@/lib/email/blocks";
import { sanitizeBlocks } from "@/lib/email/sanitize";
import type { Db } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolvedTemplate = { id: string; name: string; description: string; subject: string; preview_text: string; blocks: Block[] };

/** A built-in starter (by slug) or one of this workspace's own templates (by id). Blocks come back with fresh ids. */
export async function resolveTemplate(db: Db, workspaceId: string, id: string): Promise<ResolvedTemplate | null> {
  const starter = starterTemplates.find((t) => t.id === id);
  if (starter) {
    return { id: starter.id, name: starter.name, description: starter.description, subject: starter.subject ?? "", preview_text: starter.previewText ?? "", blocks: cloneBlocks(starter.blocks) };
  }
  if (!UUID_RE.test(id)) return null;
  const { data } = await db.from("templates").select("id, name, description, subject, preview_text, blocks").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!data) return null;
  const t = data as any;
  return { id: t.id, name: t.name, description: t.description ?? "", subject: t.subject ?? "", preview_text: t.preview_text ?? "", blocks: cloneBlocks(sanitizeBlocks(t.blocks)) };
}

type Owner = { db: Db; workspace: { id: string; name: string }; user: { id: string } };

/** Creates a draft campaign from a template and returns its id, or null if it couldn't be saved. */
export async function createDraftFromTemplate(ctx: Owner, tpl: ResolvedTemplate, name: string): Promise<string | null> {
  const { data, error } = await ctx.db.from("campaigns").insert({
    workspace_id: ctx.workspace.id, name, subject: tpl.subject, preview_text: tpl.preview_text,
    blocks: tpl.blocks, html: renderBlocks(tpl.blocks, { preview: tpl.preview_text }),
    created_by: ctx.user.id, from_name: ctx.workspace.name,
  }).select("id").single();
  return error || !data ? null : (data as { id: string }).id;
}
