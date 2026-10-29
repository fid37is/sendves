import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOpenSig } from "@/lib/tokens";

export const dynamic = "force-dynamic";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const headers = { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate", "Content-Length": String(GIF.length) };

/** Open-tracking pixel. Opens are unreliable (mail privacy features), so clicks are the primary signal. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sendId = url.searchParams.get("s") ?? "";
  const sig = url.searchParams.get("g") ?? "";
  try {
    if (sendId && verifyOpenSig(sendId, sig)) {
      const db = createAdminClient();
      const { data: send } = await db.from("sends").select("id, workspace_id, campaign_id, contact_id").eq("id", sendId).maybeSingle();
      if (send) {
        const { count } = await db.from("events").select("id", { count: "exact", head: true }).eq("send_id", send.id).eq("type", "open");
        if (!count) {
          await db.from("events").insert({ workspace_id: send.workspace_id, campaign_id: send.campaign_id, send_id: send.id, contact_id: send.contact_id, type: "open" });
        }
      }
    }
  } catch {
    // Never break an email because tracking failed.
  }
  return new Response(GIF, { headers });
}
