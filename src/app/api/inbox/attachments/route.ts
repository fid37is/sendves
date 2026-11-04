import { NextResponse } from "next/server";
import { can } from "@/lib/access";
import { canSeeConversation } from "@/lib/inbox";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContext } from "@/lib/workspace";
import { INBOX_ATTACHMENT_BUCKET } from "@/server/inbox/attachments";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const gone = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Opens one attachment: /api/inbox/attachments?m=<message id>&a=<attachment id>.
 * The person must be signed in and allowed to see the conversation it belongs to, and the file is always
 * downloaded (never opened in the page), so a received file can't run in Sendves' own origin.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const messageId = url.searchParams.get("m") ?? "";
  const attachmentId = url.searchParams.get("a") ?? "";
  if (!UUID_RE.test(messageId) || !UUID_RE.test(attachmentId)) return gone();

  const ctx = await getContext();
  if (!ctx?.workspace || !ctx.db || !can(ctx.access, "inbox.view")) return gone();

  const db = createAdminClient();
  const { data: m } = await db.from("inbox_messages").select("conversation_id, attachments").eq("id", messageId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!m) return gone();
  const { data: c } = await db.from("conversations").select("owner_id, assigned_to").eq("id", m.conversation_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!c || !canSeeConversation(ctx.access, ctx.user.id, { ownerId: c.owner_id ?? null, assignedTo: c.assigned_to ?? null })) return gone();

  const file = (Array.isArray(m.attachments) ? m.attachments : []).find((a: any) => a?.id === attachmentId);
  if (!file || file.blocked || !file.path) return gone();

  const { data } = await db.storage.from(INBOX_ATTACHMENT_BUCKET).createSignedUrl(file.path, 60, { download: String(file.name || "attachment") });
  if (!data?.signedUrl) return gone();
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
