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


/**
 * An unsubscribe link carries either a campaign send id or "m:<id>" for a single email written in the inbox.
 * One door for both, so the page, the form and the one-click endpoint can't drift apart.
 */
export const INBOX_UNSUBSCRIBE_PREFIX = "m:";

/** The workspace's name for the confirmation page, or null when the reference matches nothing. */
export async function unsubscribeTarget(db: Db, ref: string): Promise<string | null> {
  if (ref.startsWith(INBOX_UNSUBSCRIBE_PREFIX)) {
    const { data } = await db.from("inbox_messages").select("workspaces(name)").eq("id", ref.slice(INBOX_UNSUBSCRIBE_PREFIX.length)).maybeSingle();
    return data ? ((data as any).workspaces?.name ?? "") || "this sender" : null;
  }
  const { data } = await db.from("sends").select("workspaces(name)").eq("id", ref).maybeSingle();
  return data ? ((data as any).workspaces?.name ?? "") || "this sender" : null;
}

/**
 * Unsubscribes one contact: status, suppression list and one event. Used by the link in a single email and by a
 * reply that asks to unsubscribe. Safe to call twice.
 */
export async function unsubscribeContact(
  db: Db,
  a: { workspaceId: string; contactId: string | null; email: string; campaignId?: string | null; sendId?: string | null; meta: Record<string, unknown> },
): Promise<void> {
  const email = a.email.toLowerCase();
  if (a.contactId) await db.from("contacts").update({ status: "unsubscribed" }).eq("id", a.contactId).eq("workspace_id", a.workspaceId).eq("status", "subscribed");
  else await db.from("contacts").update({ status: "unsubscribed" }).eq("workspace_id", a.workspaceId).eq("email", email).eq("status", "subscribed");
  await db.from("suppression_entries").upsert({ workspace_id: a.workspaceId, email, reason: "Unsubscribed" }, { ignoreDuplicates: true });

  let q = db.from("events").select("id", { count: "exact", head: true }).eq("workspace_id", a.workspaceId).eq("type", "unsubscribe");
  q = a.contactId ? q.eq("contact_id", a.contactId) : q.is("contact_id", null);
  const { count } = await q.eq("meta->>via", String(a.meta.via ?? ""));
  if (!count) {
    await db.from("events").insert({ workspace_id: a.workspaceId, campaign_id: a.campaignId ?? null, send_id: a.sendId ?? null, contact_id: a.contactId, type: "unsubscribe", meta: a.meta });
  }
}

export async function unsubscribeByRef(db: Db, ref: string): Promise<{ workspaceName: string } | null> {
  if (!ref.startsWith(INBOX_UNSUBSCRIBE_PREFIX)) return unsubscribeBySend(db, ref);

  const { data: msg } = await db.from("inbox_messages").select("id, workspace_id, conversation_id, to_email").eq("id", ref.slice(INBOX_UNSUBSCRIBE_PREFIX.length)).maybeSingle();
  if (!msg) return null;
  const { data: conv } = await db.from("conversations").select("contact_id").eq("id", msg.conversation_id).maybeSingle();
  await unsubscribeContact(db, { workspaceId: msg.workspace_id, contactId: conv?.contact_id ?? null, email: String(msg.to_email), meta: { via: "link", message_id: msg.id } });

  const { data: ws } = await db.from("workspaces").select("name").eq("id", msg.workspace_id).maybeSingle();
  return { workspaceName: ws?.name ?? "this sender" };
}
