import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInviteToken } from "@/lib/tokens";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type InviteRow = {
  id: string; workspace_id: string; email: string; contact_email: string; full_name: string; role: string;
  department_ids: string[] | null; status: string; expires_at: string; invited_by: string | null;
};

/** The pending invitation behind a link, or the reason it can't be used. */
export async function loadInvite(token: string): Promise<{ ok: true; invite: InviteRow; workspaceName: string } | { ok: false; reason: string }> {
  const id = parseInviteToken(decodeURIComponent(token));
  if (!id || !UUID_RE.test(id)) return { ok: false, reason: "This link isn’t valid. Ask the person who invited you to send it again." };
  const db = createAdminClient();
  const { data } = await db.from("workspace_invites")
    .select("id, workspace_id, email, contact_email, full_name, role, department_ids, status, expires_at, invited_by, workspaces(name, status)").eq("id", id).maybeSingle();
  const row = data as (InviteRow & { workspaces: { name: string; status: string } | null }) | null;
  if (!row || row.status !== "pending") return { ok: false, reason: "This invitation was already used or cancelled." };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "This invitation has expired. Ask for a new one." };
  if (!row.workspaces || row.workspaces.status === "suspended") return { ok: false, reason: "That organization isn’t available right now." };
  return { ok: true, invite: row, workspaceName: row.workspaces.name };
}
