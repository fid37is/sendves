import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyClickSig } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/** Records a click and redirects. Links are signed, so this cannot be used as an open redirect. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sendId = url.searchParams.get("s") ?? "";
  const encoded = url.searchParams.get("u") ?? "";
  const sig = url.searchParams.get("g") ?? "";

  let target = "";
  try {
    target = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return new NextResponse("Bad link", { status: 400 });
  }
  if (!/^https?:\/\//i.test(target) || !sendId || !verifyClickSig(sendId, target, sig)) {
    return new NextResponse("Bad link", { status: 400 });
  }

  try {
    const db = createAdminClient();
    const { data: send } = await db.from("sends").select("id, workspace_id, campaign_id, contact_id").eq("id", sendId).maybeSingle();
    if (send) {
      await db.from("events").insert({ workspace_id: send.workspace_id, campaign_id: send.campaign_id, send_id: send.id, contact_id: send.contact_id, type: "click", url: target.slice(0, 2000) });
    }
  } catch {
    // Redirect anyway.
  }
  return NextResponse.redirect(target, 302);
}
