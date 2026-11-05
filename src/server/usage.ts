import "server-only";
import { normalizePlanId, resolveEntitlements, type BillingInterval, type Limits, type PlanId } from "@/config/plan-limits";
import { accessState, normalizeStatus, roomFor, usageWindow, type AccessState, type SubscriptionStatus, type Window } from "@/lib/subscription";
import type { Db } from "@/lib/supabase/admin";

/**
 * The ONE place account entitlements and usage are worked out. Every enforcement point (contacts, imports, signup forms,
 * campaigns, the send queue, the business limit, the billing screen, the admin console) calls getAccountUsage() so the
 * counting rules can't drift apart.
 *
 * What counts, exactly:
 *   - Contacts: every contact row of every business on the account, whatever its status. Not de-duplicated across
 *     businesses: the same address in two businesses is two contacts, because each business owns its own audience.
 *   - Emails: sends that were queued, are being sent, or that the provider accepted (sent, delivered, bounced,
 *     complained), created inside the usage window. Failed and skipped sends never count. A send is one row per
 *     recipient per campaign and retries update that row, so a retry can't be counted twice.
 *   - The window is the trial while trialing, otherwise the month-long slice of the subscription that contains today,
 *     counted from the billing period start (see usageWindow).
 */

export const COUNTED_SEND_STATUSES = ["queued", "sending", "sent", "delivered", "bounced", "complained"] as const;

const COLUMNS =
  "id, name, owner_id, plan, status, account_workspace_id, subscription_status, billing_interval, trial_started_at, trial_ends_at, billing_period_start, billing_period_end, cancel_at_period_end, pending_plan, billing_provider, billing_ref, provider_customer_id, provider_subscription_id, billing_price_id, entitlement_overrides, audience_contacts, pending_audience_contacts, contact_cap, send_cap, cap_mode";

export type Account = {
  /** The main business: the owner of the subscription. */
  mainId: string;
  ownerId: string;
  name: string;
  plan: PlanId;
  /** Review / active / suspended: the platform's own state, separate from billing. */
  workspaceStatus: string;
  status: SubscriptionStatus;
  interval: BillingInterval;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: PlanId | null;
  /** The audience size (contacts) the account bought, or null for accounts from before audience pricing. */
  audience: number | null;
  /** The audience size scheduled for the next period alongside pendingPlan. */
  pendingAudience: number | null;
  provider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  billingPriceId: string | null;
  /** Plan numbers with this account's overrides applied. */
  limits: Limits;
  overrides: Record<string, unknown>;
};

const asDate = (v: unknown): Date | null => (v ? new Date(String(v)) : null);

function toAccount(r: any): Account {
  const plan = normalizePlanId(r.plan);
  const overrides = r.entitlement_overrides && typeof r.entitlement_overrides === "object" ? (r.entitlement_overrides as Record<string, unknown>) : {};
  return {
    mainId: r.id, ownerId: r.owner_id, name: r.name, plan, workspaceStatus: r.status,
    status: normalizeStatus(r.subscription_status),
    interval: r.billing_interval === "year" ? "year" : "month",
    trialStartedAt: asDate(r.trial_started_at), trialEndsAt: asDate(r.trial_ends_at),
    periodStart: asDate(r.billing_period_start), periodEnd: asDate(r.billing_period_end),
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    pendingPlan: r.pending_plan ? normalizePlanId(r.pending_plan) : null,
    audience: r.audience_contacts ? Number(r.audience_contacts) : null,
    pendingAudience: r.pending_audience_contacts ? Number(r.pending_audience_contacts) : null,
    provider: r.billing_provider ?? null, providerCustomerId: r.provider_customer_id ?? null,
    providerSubscriptionId: r.provider_subscription_id ?? null, billingPriceId: r.billing_price_id ?? null,
    limits: resolveEntitlements(plan, overrides, r.audience_contacts ? Number(r.audience_contacts) : null), overrides,
  };
}

/** The account a business belongs to. Works from any business of the account. Null when it can't be read. */
export async function loadAccount(db: Db, workspaceId: string): Promise<Account | null> {
  const { data: row } = await db.from("workspaces").select(COLUMNS).eq("id", workspaceId).maybeSingle();
  if (!row) return null;
  let main: any = row;
  if (row.account_workspace_id) {
    const { data } = await db.from("workspaces").select(COLUMNS).eq("id", row.account_workspace_id).maybeSingle();
    if (!data) return null;
    main = data;
  }
  const account = toAccount(main);
  // A scheduled downgrade takes effect once the period it was scheduled in is over, even if the renewal webhook is late.
  if (account.pendingPlan && account.periodEnd && Date.now() >= account.periodEnd.getTime() && account.status === "active") {
    await applyPendingPlan(db, account.mainId);
    const { data } = await db.from("workspaces").select(COLUMNS).eq("id", account.mainId).maybeSingle();
    if (data) return toAccount(data);
  }
  return account;
}

/** Moves the account onto the plan it scheduled earlier (a downgrade). Nothing is deleted. */
export async function applyPendingPlan(db: Db, mainId: string): Promise<void> {
  const { data } = await db.from("workspaces").select("pending_plan, pending_audience_contacts").eq("id", mainId).maybeSingle();
  if (!data?.pending_plan) return;
  await db.from("workspaces").update({
    plan: normalizePlanId(data.pending_plan),
    ...(data.pending_audience_contacts ? { audience_contacts: data.pending_audience_contacts } : {}),
    pending_plan: null, pending_audience_contacts: null,
  }).eq("id", mainId);
  await syncEntitlements(db, mainId);
}

/**
 * Brings the account's stored snapshots in line with its plan and overrides. Call it after ANY change to the plan or
 * the overrides. It writes only account-level things (the pooled contact guard's limit) and the plan name that the
 * per-business limits (daily limit, domains) are read from. Pooled limits are never copied onto businesses.
 */
export async function syncEntitlements(db: Db, mainId: string): Promise<void> {
  const { data: main } = await db.from("workspaces").select("id, plan, entitlement_overrides, audience_contacts, daily_send_limit").eq("id", mainId).maybeSingle();
  if (!main) return;
  const limits = resolveEntitlements(main.plan, main.entitlement_overrides, main.audience_contacts);
  await db.from("workspaces").update({ contact_pool_limit: limits.contacts, daily_send_limit: Math.max(main.daily_send_limit, limits.startDaily) }).eq("id", mainId);
  const { data: rows } = await db.from("workspaces").select("id, daily_send_limit").eq("account_workspace_id", mainId);
  await Promise.all((rows ?? []).map((r: { id: string; daily_send_limit: number }) =>
    db.from("workspaces").update({ plan: main.plan, daily_send_limit: Math.max(r.daily_send_limit, limits.startDaily) }).eq("id", r.id),
  ));
}

export type BusinessUsage = {
  id: string;
  name: string;
  isMain: boolean;
  contacts: number;
  emails: number;
  contactCap: number | null;
  emailCap: number | null;
  capMode: "soft" | "hard";
  /** Over its own allocation. Only blocks when the cap is hard. */
  overContactCap: boolean;
  overEmailCap: boolean;
};

export type AccountUsage = {
  account: Account;
  access: AccessState;
  window: Window;
  contactsUsed: number;
  emailsSent: number;
  businessCount: number;
  /** The pooled limits in force. During a trial the email limit is the trial cap. */
  limits: { contacts: number; emails: number; businesses: number };
  remaining: { contacts: number; emails: number; businessSlots: number };
  perBusiness: BusinessUsage[];
  /** The business the question was asked from. */
  self: BusinessUsage;
  /** What that business may still add, after the shared pool and its own hard allocation. */
  room: { contacts: number; emails: number };
};

async function countContacts(db: Db, ids: string[]): Promise<number> {
  const { count } = await db.from("contacts").select("id", { count: "exact", head: true }).in("workspace_id", ids);
  return count ?? 0;
}

async function countEmails(db: Db, ids: string[], w: Window): Promise<number> {
  const { count } = await db.from("sends").select("id", { count: "exact", head: true })
    .in("workspace_id", ids).in("status", [...COUNTED_SEND_STATUSES]).gte("created_at", w.start.toISOString()).lt("created_at", w.end.toISOString());
  return count ?? 0;
}

/**
 * Account totals, per-business breakdown and what is left, for the account that `workspaceId` belongs to.
 * The window comes from the stored subscription, never from the caller. Null means it couldn't be worked out,
 * and callers must treat that as "don't allow" rather than "no limit".
 */
export async function getAccountUsage(db: Db, workspaceId: string): Promise<AccountUsage | null> {
  const account = await loadAccount(db, workspaceId);
  if (!account) return null;
  const now = new Date();
  const facts = { status: account.status, trialStartedAt: account.trialStartedAt, trialEndsAt: account.trialEndsAt, periodStart: account.periodStart, periodEnd: account.periodEnd };
  const window = usageWindow(facts, now);

  const { data: rows } = await db.from("workspaces").select("id, name, account_workspace_id, contact_cap, send_cap, cap_mode, created_at")
    .or(`id.eq.${account.mainId},account_workspace_id.eq.${account.mainId}`).order("created_at", { ascending: true });
  const list = (rows ?? []) as any[];
  if (!list.some((r) => r.id === workspaceId)) return null;

  const counts = await Promise.all(list.map(async (r) => ({ id: r.id as string, contacts: await countContacts(db, [r.id]), emails: await countEmails(db, [r.id], window) })));
  const byId = new Map(counts.map((c) => [c.id, c]));

  const perBusiness: BusinessUsage[] = list.map((r) => {
    const c = byId.get(r.id)!;
    const mode = r.cap_mode === "soft" ? "soft" : "hard";
    const contactCap = r.contact_cap === null || r.contact_cap === undefined ? null : Number(r.contact_cap);
    const emailCap = r.send_cap === null || r.send_cap === undefined ? null : Number(r.send_cap);
    return {
      id: r.id, name: r.name, isMain: r.id === account.mainId, contacts: c.contacts, emails: c.emails,
      contactCap, emailCap, capMode: mode,
      overContactCap: contactCap !== null && c.contacts > contactCap, overEmailCap: emailCap !== null && c.emails > emailCap,
    };
  });

  const contactsUsed = perBusiness.reduce((n, b) => n + b.contacts, 0);
  const emailsSent = perBusiness.reduce((n, b) => n + b.emails, 0);
  const emailLimit = account.status === "trialing" ? Math.min(account.limits.monthlySends, account.limits.trialSends) : account.limits.monthlySends;
  const self = perBusiness.find((b) => b.id === workspaceId)!;
  const hard = self.capMode === "hard";

  return {
    account, access: accessState(facts, now), window,
    contactsUsed, emailsSent, businessCount: perBusiness.length,
    limits: { contacts: account.limits.contacts, emails: emailLimit, businesses: account.limits.businesses },
    remaining: {
      contacts: Math.max(0, account.limits.contacts - contactsUsed),
      emails: Math.max(0, emailLimit - emailsSent),
      businessSlots: Math.max(0, account.limits.businesses - perBusiness.length),
    },
    perBusiness, self,
    room: {
      contacts: roomFor({ poolUsed: contactsUsed, poolLimit: account.limits.contacts, businessUsed: self.contacts, businessCap: hard ? self.contactCap : null }),
      emails: roomFor({ poolUsed: emailsSent, poolLimit: emailLimit, businessUsed: self.emails, businessCap: hard ? self.emailCap : null }),
    },
  };
}
