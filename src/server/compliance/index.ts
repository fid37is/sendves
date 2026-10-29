import type { Db } from "@/lib/supabase/admin";

/** Marks the recipient of a send as unsubscribed and suppresses the address in that workspace. */
export async function unsubscribeBySend(db: Db, sendId: string): Promise<{ workspaceName: string } | null> {
  const { data: send } = await db.from("sends").select("id, email, contact_id, campaign_id, workspace_id").eq("id", sendId).maybeSingle();
  if (!send) return null;

  await db.from("contacts").update({ status: "unsubscribed" }).eq("id", send.contact_id).eq("status", "subscribed");
  await db
    .from("suppression_entries")
    .upsert({ workspace_id: send.workspace_id, email: send.email.toLowerCase(), reason: "Unsubscribed" }, { ignoreDuplicates: true });

  const { count } = await db
    .from("events").select("id", { count: "exact", head: true }).eq("send_id", send.id).eq("type", "unsubscribe");
  if (!count) {
    await db.from("events").insert({
      workspace_id: send.workspace_id, campaign_id: send.campaign_id, send_id: send.id, contact_id: send.contact_id, type: "unsubscribe",
    });
  }

  const { data: ws } = await db.from("workspaces").select("name").eq("id", send.workspace_id).maybeSingle();
  return { workspaceName: ws?.name ?? "this sender" };
}
