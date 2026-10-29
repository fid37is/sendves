import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyPlan, downgradeToFree, verifyPaystackSignature } from "@/server/billing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyPaystackSignature(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(raw);
  const db = createAdminClient();

  if (event.event === "charge.success" && event.data?.status === "success") {
    const meta = event.data?.metadata ?? {};
    if (meta.workspace_id && (meta.plan_id === "starter" || meta.plan_id === "growth")) {
      await applyPlan(db, meta.workspace_id, meta.plan_id, "paystack", event.data?.reference ?? null);
    }
  } else if (event.event === "subscription.disable" || event.event === "subscription.not_renew") {
    // Match by the customer's account email (verify the exact payload in Paystack test mode).
    const email = String(event.data?.customer?.email ?? "").toLowerCase();
    if (email) {
      const { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
      if (profile) {
        const { data: ws } = await db.from("workspaces").select("id").eq("owner_id", profile.id).eq("billing_provider", "paystack").maybeSingle();
        if (ws) await downgradeToFree(db, ws.id);
      }
    }
  }
  return NextResponse.json({ received: true });
}
