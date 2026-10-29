import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient, type Db } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/tokens";
import { verifySnsMessage } from "@/server/sending/sns";

export const dynamic = "force-dynamic";

async function suppressGlobal(db: Db, email: string, reason: string) {
  // Unique-violation errors are expected when the address is already suppressed.
  await db.from("suppression_entries").insert({ workspace_id: null, email: email.toLowerCase(), reason });
}

async function handleEvent(db: Db, msg: any) {
  const type: string = msg.eventType ?? msg.notificationType ?? "";
  const messageId: string | undefined = msg.mail?.messageId;
  if (!messageId) return;

  const { data: send } = await db.from("sends").select("id, workspace_id, campaign_id, contact_id, email, status").eq("provider_message_id", messageId).maybeSingle();
  if (!send) return;
  const base = { workspace_id: send.workspace_id, campaign_id: send.campaign_id, send_id: send.id, contact_id: send.contact_id };

  if (type === "Delivery") {
    await db.from("sends").update({ status: "delivered" }).eq("id", send.id).eq("status", "sent");
    await db.from("events").insert({ ...base, type: "delivered" });
  } else if (type === "Bounce") {
    if (msg.bounce?.bounceType !== "Permanent") return; // soft bounces are retried by the mailbox provider
    await db.from("sends").update({ status: "bounced" }).eq("id", send.id);
    await db.from("contacts").update({ status: "bounced" }).eq("id", send.contact_id);
    await suppressGlobal(db, send.email, "Hard bounce");
    await db.from("events").insert({ ...base, type: "bounce", meta: { subType: msg.bounce?.bounceSubType ?? null } });
  } else if (type === "Complaint") {
    await db.from("sends").update({ status: "complained" }).eq("id", send.id);
    await db.from("contacts").update({ status: "complained" }).eq("id", send.contact_id);
    await suppressGlobal(db, send.email, "Spam complaint");
    await db.from("events").insert({ ...base, type: "complaint" });
  }
}

/**
 * Receives SES events through SNS. Subscribe your SNS topic to:
 *   https://YOUR-DOMAIN/api/webhooks/ses?secret=SES_WEBHOOK_SECRET
 * Two independent checks: the shared secret in the URL, and the SNS message signature
 * (so a leaked URL alone cannot be used to forge bounce or complaint events).
 */
export async function POST(req: Request) {
  const secret = serverEnv.aws.sesWebhookSecret;
  const given = new URL(req.url).searchParams.get("secret") ?? "";
  if (!secret || !safeEqual(given, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !(await verifySnsMessage(body))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }
  const expectedTopic = serverEnv.aws.snsTopicArn;
  if (expectedTopic && body.TopicArn !== expectedTopic) {
    return NextResponse.json({ error: "Unexpected topic" }, { status: 403 });
  }

  const type = body.Type;
  if (type === "SubscriptionConfirmation") {
    const link = body.SubscribeURL;
    if (typeof link === "string" && /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//.test(link)) await fetch(link);
    return NextResponse.json({ ok: true });
  }

  if (type === "Notification") {
    try {
      await handleEvent(createAdminClient(), JSON.parse(body.Message));
    } catch (err) {
      console.error("[ses webhook]", (err as Error).message);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // SNS will retry
    }
  }
  return NextResponse.json({ ok: true });
}
