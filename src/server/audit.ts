import { headers } from "next/headers";
import type { Db } from "@/lib/supabase/admin";

/** Request IP as seen behind the host's proxy. */
export function clientIp(): string | null {
  const h = headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
}

/**
 * Appends an entry to the admin audit log. The table is append-only (see migration 0003), so a
 * compromised admin account cannot erase its trail. Never throws: auditing must not break the action.
 */
export async function recordAudit(
  db: Db,
  actor: { id?: string | null; email?: string | null },
  action: string,
  target?: { type?: string; id?: string },
  meta?: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    actor_id: actor.id ?? null,
    actor_email: actor.email ?? null,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    meta: meta ?? {},
    ip: clientIp(),
  });
  if (error) console.error("[audit]", error.message);
}
