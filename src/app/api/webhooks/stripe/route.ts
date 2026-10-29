import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyPlan, downgradeToFree, verifyStripeSignature } from "@/server/billing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(raw);
  const db = createAdminClient();

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const workspaceId = s.client_reference_id ?? s.metadata?.workspace_id;
    const plan = s.metadata?.plan_id;
    if (workspaceId && (plan === "starter" || plan === "growth")) {
      await applyPlan(db, workspaceId, plan, "stripe", s.subscription ?? null);
    }
  } else if (event.type === "customer.subscription.deleted") {
    const ref = event.data.object.id;
    const { data: ws } = await db.from("workspaces").select("id").eq("billing_provider", "stripe").eq("billing_ref", ref).maybeSingle();
    if (ws) await downgradeToFree(db, ws.id);
  }
  return NextResponse.json({ received: true });
}
