/**
 * Analytics helpers shared by the user dashboard and the admin console. All reads go through
 * SQL functions (0003 migration) that only the service role may call, so callers must always
 * pass a workspace id taken from the signed-in session, or be inside the admin console.
 */
import type { Db } from "@/lib/supabase/admin";

export type RangeDays = 7 | 30 | 90;
export const RANGES: RangeDays[] = [7, 30, 90];

export function parseRange(v: string | undefined, fallback: RangeDays = 30): RangeDays {
  const n = Number(v);
  return (RANGES as number[]).includes(n) ? (n as RangeDays) : fallback;
}

export type DayPoint = {
  date: string; // YYYY-MM-DD
  sent: number;
  delivered: number;
  bounced: number;
  complaints: number;
  opens: number;
  clicks: number; // every click event
  uniqueClicks: number; // distinct recipients who clicked
  unsubscribes: number;
};

export type Totals = Omit<DayPoint, "date">;

export type LinkRow = { url: string; clicks: number; uniqueClicks: number };

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function getDailyActivity(db: Db, opts: { days: number; workspaceId?: string; campaignId?: string }): Promise<DayPoint[]> {
  const { data } = await db.rpc("daily_activity", {
    p_days: opts.days,
    p_workspace: opts.workspaceId ?? null,
    p_campaign: opts.campaignId ?? null,
  });
  return ((data ?? []) as any[]).map((r) => ({
    date: String(r.bucket),
    sent: n(r.sent), delivered: n(r.delivered), bounced: n(r.bounced), complaints: n(r.complaints),
    opens: n(r.opens), clicks: n(r.clicks), uniqueClicks: n(r.unique_clicks), unsubscribes: n(r.unsubscribes),
  }));
}

export function sumDays(points: DayPoint[]): Totals {
  const t: Totals = { sent: 0, delivered: 0, bounced: 0, complaints: 0, opens: 0, clicks: 0, uniqueClicks: 0, unsubscribes: 0 };
  for (const p of points) {
    t.sent += p.sent; t.delivered += p.delivered; t.bounced += p.bounced; t.complaints += p.complaints;
    t.opens += p.opens; t.clicks += p.clicks; t.uniqueClicks += p.uniqueClicks; t.unsubscribes += p.unsubscribes;
  }
  return t;
}

export async function getTopLinks(db: Db, workspaceId: string, opts: { campaignId?: string; days?: number; limit?: number } = {}): Promise<LinkRow[]> {
  const { data } = await db.rpc("link_clicks", {
    p_workspace: workspaceId,
    p_campaign: opts.campaignId ?? null,
    p_days: opts.days ?? 30,
    p_limit: opts.limit ?? 10,
  });
  return ((data ?? []) as any[]).map((r) => ({ url: String(r.url), clicks: n(r.clicks), uniqueClicks: n(r.unique_clicks) }));
}

/** "12.4%" or "-" when there is nothing to divide by. */
export function pct(num: number, den: number, digits = 1): string {
  return den > 0 ? `${((num / den) * 100).toFixed(digits)}%` : "-";
}

/** Numeric percentage, or null. */
export function ratio(num: number, den: number): number | null {
  return den > 0 ? (num / den) * 100 : null;
}

/** Change versus a previous period, as text and direction. */
export function delta(current: number, previous: number): { text: string; dir: "up" | "down" | "flat" } | null {
  if (previous <= 0) return current > 0 ? { text: "new", dir: "up" } : null;
  const d = ((current - previous) / previous) * 100;
  if (Math.abs(d) < 0.5) return { text: "0%", dir: "flat" };
  return { text: `${d > 0 ? "+" : ""}${d.toFixed(0)}%`, dir: d > 0 ? "up" : "down" };
}
