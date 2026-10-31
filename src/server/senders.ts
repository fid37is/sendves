import "server-only";
import type { Db } from "@/lib/supabase/admin";

export type SenderCheck =
  | { ok: true; identity: { id: string; email: string; from_name: string; department_id: string | null } }
  | { ok: false; reason: string };

/**
 * THE check that decides whether a campaign may send as an address. A sender identity (a person's
 * work email or one of their aliases) must
 *  - belong to the SAME workspace as the campaign (so nobody can use another company's address),
 *  - be active, and belong to someone who is still an active member of the organization,
 *  - sit on a domain that passed DKIM, SPF and DMARC.
 * Used when a draft is saved, when a test is sent, when a campaign is submitted or resumed, and by
 * the delivery engine for every send.
 */
export async function checkSender(db: Db, workspaceId: string, identityId: string | null | undefined): Promise<SenderCheck> {
  if (!identityId) return { ok: false, reason: "Choose a sender for this campaign." };
  const { data } = await db.from("sender_identities")
    .select("id, email, from_name, status, department_id, user_id, sending_domains(status, dkim_ok, spf_ok, dmarc_ok)")
    .eq("id", identityId).eq("workspace_id", workspaceId).maybeSingle();
  const row = data as any;
  if (!row) return { ok: false, reason: "That sender no longer exists." };
  if (row.status !== "active") return { ok: false, reason: `The sender ${row.email} is deactivated.` };
  if (row.user_id) {
    const { data: member } = await db.from("workspace_members").select("status").eq("workspace_id", workspaceId).eq("user_id", row.user_id).maybeSingle();
    if (!member || member.status !== "active") return { ok: false, reason: `The owner of ${row.email} no longer has access to this organization.` };
  }
  const d = row.sending_domains;
  if (!d || d.status !== "verified" || !d.dkim_ok || !d.spf_ok || !d.dmarc_ok) {
    return { ok: false, reason: `The domain of ${row.email} isn’t verified (DKIM, SPF and DMARC must all pass).` };
  }
  return { ok: true, identity: { id: row.id, email: row.email, from_name: row.from_name, department_id: row.department_id ?? null } };
}
