import type { Db } from "@/lib/supabase/admin";
import { limitsFor } from "@/config/plan-limits";

export type Settings = {
  pause_bounce_pct: number;
  pause_complaint_pct: number;
  suspend_complaint_pct: number;
  new_workspace_daily_limit: number;
  new_workspace_max_contacts: number;
  /** Fewest sends before a rate counts, so one bounce in ten emails can't trip enforcement. */
  health_min_sample: number;
  /** Days of history used for a workspace's rolling bounce and complaint rates. */
  window_days: number;
  /** Platform-wide kill switch: nothing is sent while true. */
  sending_paused: boolean;
  registrations_open: boolean;
  require_review: boolean;
  blocked_email_domains: string[];
};

const DEFAULTS: Settings = {
  pause_bounce_pct: 5, pause_complaint_pct: 0.3, suspend_complaint_pct: 0.5,
  new_workspace_daily_limit: 200, new_workspace_max_contacts: 500,
  health_min_sample: 50, window_days: 7, sending_paused: false, registrations_open: true, require_review: true, blocked_email_domains: [],
};

export async function loadSettings(db: Db): Promise<Settings> {
  const { data } = await db.from("platform_settings").select("*").eq("id", 1).maybeSingle();
  return data ? ({ ...DEFAULTS, ...data } as Settings) : DEFAULTS;
}

export type Verdict = "ok" | "pause" | "suspend";
export type Thresholds = Pick<Settings, "pause_bounce_pct" | "pause_complaint_pct" | "suspend_complaint_pct" | "health_min_sample">;

/**
 * The one rule for judging sending health, used for campaigns and for workspaces.
 *
 *  - Fewer than `health_min_sample` sends: never judged ("ok").
 *  - Complaint rate at or over the suspend threshold: "suspend" (wins over everything).
 *  - Bounce rate at or over the bounce threshold, or complaint rate at or over the complaint threshold: "pause".
 *
 * Rates are compared by cross-multiplying (complaints × 100 ≥ percent × sends) so a rate sitting exactly on
 * a threshold, like 3 complaints in 1,000 against 0.3%, is not missed by floating-point rounding.
 */
export function judge(stats: { sent: number; bounced: number; complained: number }, settings: Thresholds): { verdict: Verdict; bounce: number; complaint: number } {
  const sent = Number(stats.sent) || 0;
  const bounced = Number(stats.bounced) || 0;
  const complained = Number(stats.complained) || 0;
  const bounce = sent > 0 ? (bounced / sent) * 100 : 0;
  const complaint = sent > 0 ? (complained / sent) * 100 : 0;
  if (sent < Math.max(1, settings.health_min_sample)) return { verdict: "ok", bounce, complaint };
  const over = (count: number, pct: number) => count * 100 >= pct * sent;
  if (over(complained, settings.suspend_complaint_pct)) return { verdict: "suspend", bounce, complaint };
  if (over(bounced, settings.pause_bounce_pct) || over(complained, settings.pause_complaint_pct)) return { verdict: "pause", bounce, complaint };
  return { verdict: "ok", bounce, complaint };
}

async function report(db: Db, workspaceId: string, reason: string) {
  await db.from("abuse_reports").insert({ workspace_id: workspaceId, reporter: "Automatic enforcement", reason });
}

/**
 * Automatic enforcement, in two layers (both use judge() above):
 *
 *  1. Per campaign, while it is sending: judged on its own numbers.
 *  2. Per workspace, over a rolling window (default 7 days) and regardless of campaign state. Bounces
 *     and complaints usually arrive minutes or hours after a campaign has finished, so judging only
 *     campaigns that are still sending would miss most of them.
 *
 * "pause" pauses what is sending; "suspend" also suspends the workspace. Every automatic action records
 * its reason on the campaign (shown to the customer) and in the abuse log (shown to admins).
 */
export async function evaluateHealth(db: Db, settings: Settings): Promise<void> {
  // 1. Campaigns that are sending right now.
  const { data: sending } = await db.from("campaigns").select("id, workspace_id, name").eq("status", "sending");
  for (const c of sending ?? []) {
    const { data: s } = await db.from("campaign_stats").select("sent, bounced, complained").eq("campaign_id", c.id).maybeSingle();
    if (!s) continue;
    const { verdict, bounce, complaint } = judge(s as any, settings);
    if (verdict === "ok") continue;
    if (verdict === "suspend") {
      const reason = `Workspace suspended automatically: ${complaint.toFixed(2)}% of this campaign’s emails drew complaints (limit ${settings.suspend_complaint_pct}%).`;
      await db.from("campaigns").update({ status: "paused", pause_reason: reason }).eq("id", c.id).eq("status", "sending");
      await db.from("workspaces").update({ status: "suspended" }).eq("id", c.workspace_id).neq("status", "suspended");
      await report(db, c.workspace_id, `Workspace suspended: complaint rate ${complaint.toFixed(2)}% on “${c.name}”`);
    } else {
      const reason = `Paused automatically: ${bounce.toFixed(1)}% bounced and ${complaint.toFixed(2)}% complained (limits ${settings.pause_bounce_pct}% and ${settings.pause_complaint_pct}%).`;
      await db.from("campaigns").update({ status: "paused", pause_reason: reason }).eq("id", c.id).eq("status", "sending");
      await report(db, c.workspace_id, `Campaign “${c.name}” paused: bounce ${bounce.toFixed(1)}%, complaints ${complaint.toFixed(2)}%`);
    }
  }

  // 2. Workspaces, over the rolling window.
  const { data: rows } = await db.rpc("workspace_health", { p_days: settings.window_days });
  const judged = ((rows ?? []) as { workspace_id: string; sent: number; bounced: number; complained: number }[])
    .map((r) => ({ r, ...judge(r, settings) })).filter((x) => x.verdict !== "ok");
  if (judged.length === 0) return;
  const { data: workspaces } = await db.from("workspaces").select("id, status").in("id", judged.map((x) => x.r.workspace_id));
  const status = new Map((workspaces ?? []).map((w: any) => [w.id as string, w.status as string]));

  for (const { r, verdict, bounce, complaint } of judged) {
    if (!status.has(r.workspace_id) || status.get(r.workspace_id) === "suspended") continue;
    const span = `${Number(r.sent)} sends in ${settings.window_days} days`;
    if (verdict === "suspend") {
      const reason = `Workspace suspended automatically: ${complaint.toFixed(2)}% of emails drew complaints (limit ${settings.suspend_complaint_pct}%).`;
      await db.from("workspaces").update({ status: "suspended" }).eq("id", r.workspace_id);
      await db.from("campaigns").update({ status: "paused", pause_reason: reason }).eq("workspace_id", r.workspace_id).eq("status", "sending");
      await report(db, r.workspace_id, `Workspace suspended: complaint rate ${complaint.toFixed(2)}% over ${span}`);
    } else {
      const reason = `Paused automatically: over the last ${settings.window_days} days ${bounce.toFixed(1)}% of emails bounced and ${complaint.toFixed(2)}% drew complaints (limits ${settings.pause_bounce_pct}% and ${settings.pause_complaint_pct}%). Clean your list, then contact support.`;
      const { data: paused } = await db.from("campaigns").update({ status: "paused", pause_reason: reason }).eq("workspace_id", r.workspace_id).eq("status", "sending").select("id");
      if (paused?.length) await report(db, r.workspace_id, `Sending paused for ${paused.length} campaign${paused.length === 1 ? "" : "s"}: bounce ${bounce.toFixed(1)}%, complaints ${complaint.toFixed(2)}% over ${span}`);
    }
  }
}

/** Healthy completed campaigns earn a higher daily sending limit (warm-up). */
export async function maybeRaiseLimit(db: Db, workspaceId: string, campaignId: string): Promise<void> {
  const { data: s } = await db.from("campaign_stats").select("sent, bounced, complained").eq("campaign_id", campaignId).maybeSingle();
  if (!s || Number(s.sent) < 100) return;
  const bounce = (Number(s.bounced) / Number(s.sent)) * 100;
  const complaint = (Number(s.complained) / Number(s.sent)) * 100;
  if (bounce > 2 || complaint > 0.1) return;

  const { data: ws } = await db.from("workspaces").select("plan, daily_send_limit").eq("id", workspaceId).maybeSingle();
  if (!ws) return;
  const next = Math.min(limitsFor(ws.plan).maxDaily, Math.ceil(ws.daily_send_limit * 2));
  if (next > ws.daily_send_limit) await db.from("workspaces").update({ daily_send_limit: next }).eq("id", workspaceId);
}

export default judge;
