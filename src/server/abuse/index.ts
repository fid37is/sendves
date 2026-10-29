import type { Db } from "@/lib/supabase/admin";
import { limitsFor } from "@/config/plan-limits";

export type Settings = {
  pause_bounce_pct: number;
  pause_complaint_pct: number;
  suspend_complaint_pct: number;
  new_workspace_daily_limit: number;
  new_workspace_max_contacts: number;
};

const DEFAULTS: Settings = {
  pause_bounce_pct: 5, pause_complaint_pct: 0.3, suspend_complaint_pct: 0.5,
  new_workspace_daily_limit: 200, new_workspace_max_contacts: 500,
};

export async function loadSettings(db: Db): Promise<Settings> {
  const { data } = await db.from("platform_settings").select("*").eq("id", 1).maybeSingle();
  return data ? ({ ...DEFAULTS, ...data } as Settings) : DEFAULTS;
}

const MIN_SAMPLE = 50;

/**
 * Pauses risky campaigns and suspends workspaces with serious complaint rates.
 * Only looks at campaigns that are currently sending.
 */
export async function evaluateHealth(db: Db, settings: Settings): Promise<void> {
  const { data: sending } = await db.from("campaigns").select("id, workspace_id, name").eq("status", "sending");
  for (const c of sending ?? []) {
    const { data: s } = await db.from("campaign_stats").select("sent, bounced, complained").eq("campaign_id", c.id).maybeSingle();
    if (!s || Number(s.sent) < MIN_SAMPLE) continue;

    const bounce = (Number(s.bounced) / Number(s.sent)) * 100;
    const complaint = (Number(s.complained) / Number(s.sent)) * 100;

    if (complaint >= settings.suspend_complaint_pct) {
      await db.from("campaigns").update({ status: "paused" }).eq("id", c.id);
      await db.from("workspaces").update({ status: "suspended" }).eq("id", c.workspace_id).neq("status", "suspended");
      await db.from("abuse_reports").insert({
        workspace_id: c.workspace_id, reporter: "Automatic enforcement",
        reason: `Workspace suspended: complaint rate ${complaint.toFixed(2)}% on “${c.name}”`,
      });
    } else if (bounce >= settings.pause_bounce_pct || complaint >= settings.pause_complaint_pct) {
      await db.from("campaigns").update({ status: "paused" }).eq("id", c.id);
      await db.from("abuse_reports").insert({
        workspace_id: c.workspace_id, reporter: "Automatic enforcement",
        reason: `Campaign “${c.name}” paused: bounce ${bounce.toFixed(1)}%, complaints ${complaint.toFixed(2)}%`,
      });
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
