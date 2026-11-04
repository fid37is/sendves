import "server-only";
import { limitsFor } from "@/config/plan-limits";
import type { Db } from "@/lib/supabase/admin";

export type BusinessQuota = {
  /** The person's main business: the first one they own. It carries the subscription. */
  main: { id: string; name: string; plan: string; status: string; timezone: string };
  used: number;
  cap: number;
};

/**
 * How many businesses a person has and how many their plan covers. Null when they own none
 * (people who were only invited into someone else's organization cannot add businesses).
 */
export async function getBusinessQuota(db: Db, userId: string): Promise<BusinessQuota | null> {
  const { data } = await db.from("workspaces").select("id, name, plan, status, timezone, account_workspace_id").eq("owner_id", userId).order("created_at", { ascending: true });
  const owned = (data ?? []) as { id: string; name: string; plan: string; status: string; timezone: string; account_workspace_id: string | null }[];
  const main = owned.find((w) => !w.account_workspace_id);
  if (!main) return null;
  const used = owned.filter((w) => w.id === main.id || w.account_workspace_id === main.id).length;
  return { main: { id: main.id, name: main.name, plan: main.plan, status: main.status, timezone: main.timezone }, used, cap: limitsFor(main.plan).businesses };
}
