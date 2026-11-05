import "server-only";
import { nextPlanForBusinesses, type PlanId } from "@/config/plan-limits";
import { accessState, type AccessState } from "@/lib/subscription";
import type { Db } from "@/lib/supabase/admin";
import { loadAccount, type Account } from "@/server/usage";

export type BusinessQuota = {
  /** The person's main business: the first one they own. It carries the subscription. */
  main: { id: string; name: string; plan: string; status: string; timezone: string };
  used: number;
  /** Business slots the subscription covers (plan plus any overrides). */
  cap: number;
  account: Account;
  /** Whether the subscription currently allows sending and new paid actions (trial running, paid up). */
  access: AccessState;
  /** The plan to move to for one more business. Null while a slot is free. "custom" means talk to sales. */
  nextPlan: PlanId | null;
};

/**
 * How many businesses a person has and how many their subscription covers. Null when they own none
 * (people who were only invited into someone else's organization cannot add businesses).
 */
export async function getBusinessQuota(db: Db, userId: string): Promise<BusinessQuota | null> {
  const { data } = await db.from("workspaces").select("id, name, plan, status, timezone, account_workspace_id").eq("owner_id", userId).order("created_at", { ascending: true });
  const owned = (data ?? []) as { id: string; name: string; plan: string; status: string; timezone: string; account_workspace_id: string | null }[];
  const main = owned.find((w) => !w.account_workspace_id);
  if (!main) return null;
  const account = await loadAccount(db, main.id);
  if (!account) return null;
  const used = owned.filter((w) => w.id === main.id || w.account_workspace_id === main.id).length;
  const cap = account.limits.businesses;
  const access = accessState({ status: account.status, trialStartedAt: account.trialStartedAt, trialEndsAt: account.trialEndsAt, periodStart: account.periodStart, periodEnd: account.periodEnd });
  return {
    main: { id: main.id, name: main.name, plan: account.plan, status: main.status, timezone: main.timezone },
    used, cap, account, access,
    nextPlan: used >= cap ? nextPlanForBusinesses(account.plan, used + 1) : null,
  };
}
