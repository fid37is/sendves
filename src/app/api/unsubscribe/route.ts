import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUnsubscribeToken } from "@/lib/tokens";
import { unsubscribeBySend } from "@/server/compliance";

export const dynamic = "force-dynamic";

/** RFC 8058 one-click unsubscribe: mailbox providers POST here. */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const sendId = parseUnsubscribeToken(token);
  if (!sendId) return new NextResponse("Invalid link", { status: 400 });
  const result = await unsubscribeBySend(createAdminClient(), sendId);
  return new NextResponse(result ? "You have been unsubscribed." : "Not found", { status: result ? 200 : 404 });
}

/** A GET could be a link scanner, so it only shows the confirmation page. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  // Use the configured site URL: behind a proxy, req.url can carry an internal host.
  return NextResponse.redirect(new URL(`/u/${encodeURIComponent(token)}`, env.siteUrl));
}
