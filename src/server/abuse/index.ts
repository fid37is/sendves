import type { Db } from "@/lib/supabase/admin";
import { limitsFor } from "@/config/plan-limits";

export type Settings = {
  pause_bounce_pct: number;
  pause_complaint_pct: number;
  suspend_complaint_pct: number;
  new_workspace_daily_limit: number;
  new_workspace_max_contacts: number;
  /** New workspaces start in review: their first campaign waits for an admin. */
  review_new_workspaces: boolean;
  /** Global kill switch: nothing is sent, anywhere, while this is on. */
  sending_paused: boolean;
  signups_open: boolean;
  /** A campaign needs at least this many sends before its rates mean anything. */
  health_min_sample: number;
  /** Finished campaigns are still judged for this long, because complaints and bounces arrive after delivery. */
  health_window_hours: number;
};

export const DEFAULT_SETTINGS: Settings = {
  pause_bounce_pct: 5, pause_complaint_pct: 0.3, suspend_complaint_pct: 0.5,
  new_workspace_daily_limit: 200, new_workspace_max_contacts: 500,
  review_new_workspaces: true, sending_paused: false, signups_open: true,
  health_min_sample: 50, health_window_hours: 72,
};

export async function loadSettings(db: Db): Promise<Settings> {
  const { data } = await db.from("platform_settings").select("*").eq("id", 1).maybeSingle();
  return data ? ({ ...DEFAULT_SETTINGS, ...data } as Settings) : DEFAULT_SETTINGS;
}

export type Verdict = "ok" | "pause" | "suspend";

/**
 * Decides what a campaign's numbers call for. Pure, so the rules can be tested without a database.
 *  - suspend: complaint rate at or above the suspension threshold
 *  - pause:   bounce or complaint rate at or above its pause threshold
 *  - ok:      anything else, including too few sends to judge
 */
export function judge(stats: { sent: number; bounced: number; complained: number }, s: Pick<Settings, "pause_bounce_pct" | "pause_complaint_pct" | "suspend_complaint_pct" | "health_min_sample">): { verdict: Verdict; bounce: number; complaint: number } {
  const sent = Number(stats.sent);
  if (!Number.isFinite(sent) || sent < s.health_min_sample) return { verdict: "ok", bounce: 0, complaint: 0 };
  const bounce = (Number(stats.bounced) / sent) * 100;
  const complaint = (Number(stats.complained) / sent) * 100;
  if (complaint >= s.suspend_complaint_pct) return { verdict: "suspend", bounce, complaint };
  if (bounce >= s.pause_bounce_pct || complaint >= s.pause_complaint_pct) return { verdict: "pause", bounce, complaint };
  return { verdict: "ok", bounce, complaint };
}

const AUTO = "Automatic enforcement";
const LEVEL: Record<string, number> = { "": 0, ok: 0, pause: 1, suspend: 2 };

/** Records what the system did, in both the abuse queue (needs a human look) and the audit log (permanent trail). */
async function record(db: Db, workspaceId: string, action: string, reason: string, meta: Record<string, unknown>) {
  await db.from("abuse_reports").insert({ workspace_id: workspaceId, reporter: AUTO, reason });
  const { error } = await db.from("audit_log").insert({ actor_id: null, actor_email: AUTO, action, target_type: "workspace", target_id: workspaceId, meta });
  if (error) console.error("[audit]", error.message);
}

/**
 * Applies the platform thresholds. Runs after every worker pass.
 *
 * Campaigns that are still sending can be paused. Campaigns that finished inside the window are judged too,
 * because most complaints and bounces are reported after the mail has gone out: a check that only looked at
 * "sending" campaigns would almost never see them. A finished campaign cannot be paused, so its consequence
 * lands on the workspace: suspended at the complaint threshold, or moved back to review at a pause threshold.
 * Every action happens once: the update is conditional on the previous state, and the report is only written
 * when that update really changed something.
 */
export async function evaluateHealth(db: Db, settings: Settings): Promise<void> {
  const since = new Date(Date.now() - settings.health_window_hours * 3600_000).toISOString();
  const cols = "id, workspace_id, name, status, health_action";
  const [{ data: sending }, { data: finished }] = await Promise.all([
    db.from("campaigns").select(cols).eq("status", "sending"),
    db.from("campaigns").select(cols).eq("status", "sent").gte("completed_at", since),
  ]);

  type Row = { id: string; workspace_id: string; name: string; status: string; health_action: "pause" | "suspend" | null };
  for (const c of [...(sending ?? []), ...(finished ?? [])] as Row[]) {
    const { data: s } = await db.from("campaign_stats").select("sent, bounced, complained").eq("campaign_id", c.id).maybeSingle();
    if (!s) continue;
    const { verdict, bounce, complaint } = judge(s as { sent: number; bounced: number; complained: number }, settings);
    if (verdict === "ok") continue;
    // Act once per campaign and level. Without this, an admin who reinstates a workspace (or resumes a campaign)
    // would be overruled on the very next pass by the same numbers. It still escalates: pause, then suspend.
    if (LEVEL[c.health_action ?? ""] >= LEVEL[verdict]) continue;
    const rates = `bounce ${bounce.toFixed(1)}%, complaints ${complaint.toFixed(2)}%`;

    if (c.status === "sending") {
      const { data: paused } = await db.from("campaigns").update({ status: "paused", pause_reason: `Paused automatically: ${rates}` }).eq("id", c.id).eq("status", "sending").select("id");
      if (paused?.length && verdict === "pause") await record(db, c.workspace_id, "auto.pause_campaign", `Campaign “${c.name}” paused: ${rates}`, { campaign: c.id, bounce, complaint });
    }

    if (verdict === "suspend") {
      const { data: suspended } = await db.from("workspaces").update({ status: "suspended" }).eq("id", c.workspace_id).neq("status", "suspended").select("id");
      if (suspended?.length) await record(db, c.workspace_id, "auto.suspend_workspace", `Workspace suspended: complaint rate ${complaint.toFixed(2)}% on “${c.name}”`, { campaign: c.id, bounce, complaint });
    } else if (c.status === "sent") {
      const { data: review } = await db.from("workspaces").update({ status: "review" }).eq("id", c.workspace_id).eq("status", "active").select("id");
      if (review?.length) await record(db, c.workspace_id, "auto.review_workspace", `Workspace moved to review: “${c.name}” finished with ${rates}`, { campaign: c.id, bounce, complaint });
    }
    await db.from("campaigns").update({ health_action: verdict }).eq("id", c.id);
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
