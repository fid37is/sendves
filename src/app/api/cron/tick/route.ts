import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { safeEqual } from "@/lib/tokens";
import { runTick } from "@/server/sending/process";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Runs one pass of the sending engine. Use this instead of `npm run worker` on serverless hosting. */
async function handle(req: Request) {
  // Header only. A secret in the query string ends up in access logs and browser history.
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!serverEnv.cronSecret || serverEnv.cronSecret.length < 16 || !safeEqual(given, serverEnv.cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runTick({ budgetMs: 50000 });
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
