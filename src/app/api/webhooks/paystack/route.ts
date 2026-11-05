import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handlePaystackEvent, verifyPaystackSignature } from "@/server/billing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyPaystackSignature(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  try {
    await handlePaystackEvent(createAdminClient(), event);
  } catch (err) {
    // A 500 makes Paystack retry. Events are recorded once they succeed, so a retry can't apply anything twice.
    console.error("[paystack webhook] failed:", (err as Error).message);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
