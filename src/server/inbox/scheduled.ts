import type { Db } from "@/lib/supabase/admin";
import { toImportance } from "@/lib/inbox";
import { readAttachment, removeAttachments, type StoredAttachment } from "./attachments";
import { deliverInboxEmail, sentToday } from "./outbound";

/** A claim that was never finished (the process stopped mid-send) is not tried again on its own: the email may already have gone out. */
const STUCK_MINUTES = 15;

type Row = Record<string, any>;
type ContactRow = { id: string; email: string; first_name: string | null; last_name: string | null; status: string };
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Why a scheduled email could not be sent, or null when it was handled (sent, or put back to wait for tomorrow's limit). */
async function sendOne(db: Db, d: Row): Promise<string | null> {
  const { data: ws } = await db.from("workspaces").select("id, name, business_address, status, daily_send_limit").eq("id", d.workspace_id).maybeSingle();
  if (!ws) return "The organization no longer exists.";
  const { data: member } = await db.from("workspace_members").select("user_id").eq("workspace_id", ws.id).eq("user_id", d.user_id).eq("status", "active").maybeSingle();
  if (!member) return "The person who scheduled this is no longer in the organization.";
  // The main recipient is a contact, or (for anyone who isn't one) the first address in "To".
  let contact: ContactRow | null = null;
  let primary: string;
  let extraTo = asList(d.to_emails);
  if (d.contact_id) {
    const { data } = await db.from("contacts").select("id, email, first_name, last_name, status").eq("id", d.contact_id).eq("workspace_id", ws.id).maybeSingle();
    if (!data) return "The contact was removed, so there is no one to send this to.";
    contact = data as ContactRow;
    primary = String(data.email).toLowerCase();
  } else {
    if (extraTo.length === 0) return "There is no one to send this to.";
    primary = extraTo[0].toLowerCase();
    extraTo = extraTo.slice(1);
    // If they have become a contact since, their status still protects them.
    const { data } = await db.from("contacts").select("id, email, first_name, last_name, status").eq("workspace_id", ws.id).eq("email", primary).maybeSingle();
    if (data) contact = data as ContactRow;
  }
  if (contact && contact.status !== "subscribed") return "This contact isn’t subscribed any more, so the email wasn’t sent.";
  if (!d.identity_id) return "The address it was to be sent from was removed.";
  const { data: identity } = await db.from("sender_identities").select("id").eq("id", d.identity_id).eq("workspace_id", ws.id).eq("user_id", d.user_id).maybeSingle();
  if (!identity) return "The address it was to be sent from is no longer yours.";

  // Over today's limit: it is not an error. It waits and goes out once the limit resets.
  if ((await sentToday(db, ws.id)) >= ws.daily_send_limit) {
    await db.from("inbox_drafts").update({ status: "scheduled", updated_at: new Date().toISOString() }).eq("id", d.id);
    return null;
  }

  const files: { name: string; type: string; content: Buffer }[] = [];
  for (const a of (Array.isArray(d.attachments) ? d.attachments : []) as StoredAttachment[]) {
    const content = a.path ? await readAttachment(db, a.path) : null;
    if (!content) return `${a.name} is no longer available.`;
    files.push({ name: a.name, type: a.type, content });
  }

  const email = primary;
  const { data: conv, error } = await db.from("conversations").insert({
    workspace_id: ws.id, contact_id: contact?.id ?? null, contact_email: email,
    contact_name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "", subject: d.subject, kind: "direct",
    sender_identity_id: d.identity_id, owner_id: d.user_id, created_by: d.user_id, last_direction: "outbound",
  }).select("id").single();
  if (error || !conv) return "It couldn’t be sent. Try again.";

  const res = await deliverInboxEmail({
    db, workspace: ws, actorId: d.user_id, conversation: { id: conv.id, contact_id: contact?.id ?? null, contact_email: email },
    identityId: d.identity_id, subject: d.subject, text: d.body, outreach: true, attachments: files,
    extraTo, cc: asList(d.cc_emails), bcc: asList(d.bcc_emails), importance: toImportance(d.importance),
  });
  if (!res.ok && !res.messageId) {
    // Refused by a rule: nothing was recorded, so no empty conversation is left behind.
    await db.from("conversations").delete().eq("id", conv.id);
    return res.error;
  }
  // Sent, or refused by the email provider (it is then in the thread as "Not sent", ready to send again): either way the draft is used up.
  await removeAttachments(db, ((Array.isArray(d.attachments) ? d.attachments : []) as StoredAttachment[]).map((a) => a.path ?? null));
  await db.from("inbox_drafts").delete().eq("id", d.id);
  return null;
}

/** Sends the emails scheduled from the inbox whose time has come. Called on every pass of the sending engine. */
export async function sendDueEmails(db: Db, budgetMs = 10000): Promise<{ sent: number; failed: number }> {
  const started = Date.now();
  const now = new Date();

  await db.from("inbox_drafts")
    .update({ status: "failed", error: "Sending was interrupted. Check Sent before sending it again." })
    .eq("status", "sending").lt("updated_at", new Date(now.getTime() - STUCK_MINUTES * 60_000).toISOString());

  const { data: due } = await db.from("inbox_drafts").select("*").eq("status", "scheduled").lte("scheduled_at", now.toISOString()).order("scheduled_at", { ascending: true }).limit(25);
  let sent = 0;
  let failed = 0;
  for (const d of (due ?? []) as Row[]) {
    if (Date.now() - started >= budgetMs) break;
    // Claim it: two passes at once must not send the same email twice.
    const { data: claimed } = await db.from("inbox_drafts").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", d.id).eq("status", "scheduled").select("id");
    if (!claimed || claimed.length === 0) continue;
    let problem: string | null;
    try {
      problem = await sendOne(db, d);
    } catch (err) {
      console.error("[inbox scheduled]", (err as Error).message);
      problem = "It couldn’t be sent. Try again.";
    }
    if (problem) {
      failed++;
      await db.from("inbox_drafts").update({ status: "failed", error: problem, updated_at: new Date().toISOString() }).eq("id", d.id);
    } else sent++;
  }
  return { sent, failed };
}