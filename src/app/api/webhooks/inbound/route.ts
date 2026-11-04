import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/tokens";
import { ingestInbound } from "@/server/inbox/inbound";
import { MAX_RAW_BYTES, readStoredMessage } from "@/server/inbox/storage";
import { verifySnsMessage } from "@/server/sending/sns";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** SES can put the message in the notification as text, or as base64 when that option is chosen. */
function rawFromContent(content: string): Buffer {
  const head = content.slice(0, 300);
  const looksBase64 = !head.includes(":") && /^[A-Za-z0-9+/=\r\n]+$/.test(content.slice(0, 2000));
  return looksBase64 ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
}

async function handleReceived(msg: any) {
  const receipt = msg.receipt ?? {};
  const recipients: string[] = Array.isArray(receipt.recipients) ? receipt.recipients : Array.isArray(msg.mail?.destination) ? msg.mail.destination : [];
  const providerMessageId = String(msg.mail?.messageId ?? "");

  let raw: Buffer | null = null;
  if (typeof msg.content === "string" && msg.content) raw = rawFromContent(msg.content);
  else if (receipt.action?.type === "S3" && receipt.action.bucketName && receipt.action.objectKey) {
    raw = await readStoredMessage(String(receipt.action.bucketName), String(receipt.action.objectKey));
  }
  if (!raw || raw.length === 0 || raw.length > MAX_RAW_BYTES) return;

  await ingestInbound(createAdminClient(), {
    raw,
    recipients,
    providerMessageId,
    spam: receipt.spamVerdict?.status === "FAIL",
    virus: receipt.virusVerdict?.status === "FAIL",
  });
}

/**
 * Receives mail SES accepted for the inbound domain, through SNS. Subscribe the SNS topic of your SES
 * receipt rule to:
 *   https://YOUR-DOMAIN/api/webhooks/inbound?secret=INBOUND_WEBHOOK_SECRET
 * Same two checks as the events endpoint: the shared secret, and the SNS message signature.
 */
export async function POST(req: Request) {
  const secret = serverEnv.inbound.webhookSecret;
  const given = new URL(req.url).searchParams.get("secret") ?? "";
  if (!serverEnv.inbound.domain || !secret || !safeEqual(given, secret)) {
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
  const expectedTopic = serverEnv.inbound.snsTopicArn;
  if (expectedTopic && body.TopicArn !== expectedTopic) {
    return NextResponse.json({ error: "Unexpected topic" }, { status: 403 });
  }

  if (body.Type === "SubscriptionConfirmation") {
    const link = body.SubscribeURL;
    if (typeof link === "string" && /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//.test(link)) await fetch(link);
    return NextResponse.json({ ok: true });
  }

  if (body.Type === "Notification") {
    try {
      const msg = JSON.parse(body.Message);
      if ((msg.notificationType ?? msg.eventType) === "Received") await handleReceived(msg);
    } catch (err) {
      console.error("[inbound webhook]", (err as Error).message);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // SNS will retry
    }
  }
  return NextResponse.json({ ok: true });
}
