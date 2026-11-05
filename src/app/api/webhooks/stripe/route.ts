import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleStripeEvent, verifyStripeSignature } from "@/server/billing";

export const dynamic = "force-dynamic";

/**
 * Stripe sends subscription, invoice and checkout events here. The signature is verified on the raw body before anything
 * is read, and each event id is recorded once, so retries and duplicates change nothing.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  try {
    await handleStripeEvent(createAdminClient(), event);
  } catch (err) {
    console.error("[stripe webhook] failed:", (err as Error).message);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
