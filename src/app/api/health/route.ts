import { NextResponse } from "next/server";

/** Liveness only. It deliberately reveals nothing about configuration. */
export function GET() {
  return NextResponse.json({ ok: true });
}
