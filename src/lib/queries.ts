/**
 * Read queries for the dashboard and admin console. Every value comes from the database.
 * Dashboard reads use the service-role client filtered by the signed-in user's workspace.
 * Admin reads re-verify the admin role (and 2FA) themselves, so they are safe even if a page forgets to.
 */
import type { Ctx } from "@/lib/workspace";
import { requireAdminDb } from "@/lib/auth/admin";
import { dnsRecordsFor } from "@/server/sending/domains";
import { limitsFor } from "@/config/plan-limits";
import { getDailyActivity, getTopLinks, pct, ratio, sumDays, type RangeDays } from "@/lib/analytics";
import type { CampaignStatus, ContactStatus, WorkspaceStatus } from "@/types";

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export type CampaignRow = {
  id: string; name: string; subject: string; status: CampaignStatus; audience: string; date: string; reviewStatus?: string;
  sent: number; delivered: number; bounced: number; unsubscribes: number;
  /** Recipients who clicked at least once. */
  clicks: number;
  /** Every click, including repeats. */
  totalClicks: number;
  clickRate: string;
  /** Numeric click rate (percent) or null, for sorting and charts. */
  clickRateValue: number | null;
};
export type ContactRow = { id: string; email: string; name: string; status: ContactStatus; lists: { id: string; name: string }[]; added: string };
export type DomainRow = { id: string; domain: string; status: string; dkimOk: boolean; spfOk: boolean; dmarcOk: boolean; records: { purpose: string; type: string; host: string; value: string; status: string }[] };

const EMPTY_WORKSPACE = { name: "My workspace", plan: "Free", contactsUsed: 0, contactsLimit: 500, sendsUsed: 0, sendsLimit: 2000, dailyLimit: 200 };

// ── Dashboard ─────────────────────────────────────────────────────

export async function getCampaigns(ctx: Ctx, limit = 200): Promise<CampaignRow[]> {
  if (!ctx.db || !ctx.workspace) return [];
  const { data: rows } = await ctx.db.from("campaigns").select("id, name, subject, status, review_status, list_id, scheduled_at, completed_at, created_at, lists(name)")
    .eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(limit);
  const ids = (rows ?? []).map((r: any) => r.id);
  const { data: stats } = ids.length ? await ctx.db.from("campaign_stats").select("*").in("campaign_id", ids) : { data: [] as any[] };
  const byId = new Map((stats ?? []).map((s: any) => [s.campaign_id, s]));
  return (rows ?? []).map((r: any) => {
    const s: any = byId.get(r.id);
    const sent = Number(s?.sent ?? 0);
    const clicks = Number(s?.clicks ?? 0);
    return {
      id: r.id, name: r.name, subject: r.subject || "(no subject)", status: r.status, reviewStatus: r.review_status,
      audience: r.lists?.name ?? "All subscribers",
      sent, delivered: Number(s?.delivered ?? 0), bounced: Number(s?.bounced ?? 0), unsubscribes: Number(s?.unsubscribes ?? 0),
      clicks, totalClicks: Number(s?.total_clicks ?? clicks),
      clickRate: pct(clicks, sent), clickRateValue: ratio(clicks, sent),
      date: fmt(r.completed_at ?? r.scheduled_at ?? r.created_at),
    };
  });
}

export async function getOverview(ctx: Ctx) {
  const empty = {
    workspace: EMPTY_WORKSPACE, checklist: [true, false, false, false, false],
    recent: [] as CampaignRow[], series: [] as Awaited<ReturnType<typeof getDailyActivity>>,
    totals: sumDays([]), links: [] as Awaited<ReturnType<typeof getTopLinks>>, avgClickRate: "-",
  };
  if (!ctx.db || !ctx.workspace) return empty;
  const ws = ctx.workspace;
  const db = ctx.db;
  const limits = limitsFor(ws.plan);

  const [{ count: contacts }, { count: sends }, { count: domains }, { count: sentCampaigns }, campaigns, series, links] = await Promise.all([
    db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id),
    db.from("sends").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).gte("sent_at", monthStart()),
    db.from("sending_domains").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("status", "verified"),
    db.from("campaigns").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).in("status", ["sending", "sent"]),
    getCampaigns(ctx, 5),
    getDailyActivity(db, { days: 30, workspaceId: ws.id }),
    getTopLinks(db, ws.id, { days: 30, limit: 5 }),
  ]);

  const totals = sumDays(series);
  return {
    workspace: { name: ws.name, plan: ws.plan.charAt(0).toUpperCase() + ws.plan.slice(1), contactsUsed: contacts ?? 0, contactsLimit: ws.max_contacts, sendsUsed: sends ?? 0, sendsLimit: limits.monthlySends, dailyLimit: ws.daily_send_limit },
    checklist: [true, Boolean(ws.business_address), (domains ?? 0) > 0, (contacts ?? 0) > 0, (sentCampaigns ?? 0) > 0],
    recent: campaigns,
    series, totals, links,
    avgClickRate: pct(totals.uniqueClicks, totals.sent),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One page of contacts. `list` is a list id, or "none" for contacts that aren't in any list.
 * Memberships are loaded in a second query so a contact always shows ALL of its lists, even
 * when the page is filtered to one of them.
 */
export async function getContacts(ctx: Ctx, opts: { q?: string; status?: string; page?: number; list?: string }) {
  const pageSize = 25;
  const page = Math.max(1, opts.page ?? 1);
  if (!ctx.db || !ctx.workspace) return { rows: [] as ContactRow[], total: 0, page, pageSize };

  const listFilter = opts.list === "none" ? "none" : opts.list && UUID_RE.test(opts.list) ? opts.list : null;
  const embed = listFilter === "none" ? ", list_members!left(contact_id)" : listFilter ? ", list_members!inner(list_id)" : "";

  let q: any = ctx.db.from("contacts").select(`id, email, first_name, last_name, status, created_at${embed}`, { count: "exact" }).eq("workspace_id", ctx.workspace.id);
  if (listFilter === "none") q = q.is("list_members", null);
  else if (listFilter) q = q.eq("list_members.list_id", listFilter);
  // Keep only characters that are safe inside a PostgREST filter expression.
  const term = (opts.q ?? "").replace(/[^\p{L}\p{N}@.+_\- ]/gu, "").trim().slice(0, 80);
  if (term) q = q.or(`email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  if (opts.status && ["subscribed", "unsubscribed", "bounced", "complained", "cleaned"].includes(opts.status)) q = q.eq("status", opts.status);
  const { data, count } = await q.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

  const ids: string[] = (data ?? []).map((c: any) => c.id);
  const { data: memberships } = ids.length
    ? await ctx.db.from("list_members").select("contact_id, lists(id, name)").in("contact_id", ids)
    : { data: [] as any[] };
  const listsByContact = new Map<string, { id: string; name: string }[]>();
  for (const m of (memberships ?? []) as any[]) {
    if (!m.lists) continue;
    const arr = listsByContact.get(m.contact_id) ?? [];
    arr.push({ id: m.lists.id, name: m.lists.name });
    listsByContact.set(m.contact_id, arr);
  }

  return {
    rows: (data ?? []).map((c: any) => ({
      id: c.id, email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "-", status: c.status,
      lists: (listsByContact.get(c.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)), added: fmt(c.created_at),
    })) as ContactRow[],
    total: count ?? 0, page, pageSize,
  };
}

export async function getLists(ctx: Ctx) {
  if (!ctx.db || !ctx.workspace) return [] as { id: string; name: string; count: number }[];
  const { data } = await ctx.db.from("lists").select("id, name, list_members(count)").eq("workspace_id", ctx.workspace.id).order("name");
  return (data ?? []).map((l: any) => ({ id: l.id as string, name: l.name as string, count: Number(l.list_members?.[0]?.count ?? 0) }));
}

/** Lists with member counts, plus the total number of contacts (for the "All contacts" row). */
export async function getListsOverview(ctx: Ctx) {
  if (!ctx.db || !ctx.workspace) return { lists: [] as { id: string; name: string; count: number }[], total: 0 };
  const [lists, { count }] = await Promise.all([
    getLists(ctx),
    ctx.db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id),
  ]);
  return { lists, total: count ?? 0 };
}

export async function getDomains(ctx: Ctx): Promise<DomainRow[]> {
  if (!ctx.db || !ctx.workspace) return [];
  const { data } = await ctx.db.from("sending_domains").select("*").eq("workspace_id", ctx.workspace.id).order("created_at");
  return (data ?? []).map((d: any) => ({
    id: d.id, domain: d.domain, status: d.status, dkimOk: d.dkim_ok, spfOk: d.spf_ok, dmarcOk: d.dmarc_ok,
    records: dnsRecordsFor(d.domain, d.dkim_tokens ?? []).map((r) => ({
      ...r, status: (r.purpose === "DKIM" ? d.dkim_ok : r.purpose === "SPF" ? d.spf_ok : d.dmarc_ok) ? "verified" : "pending",
    })),
  }));
}

export async function getCampaignDetail(ctx: Ctx, id: string) {
  if (!ctx.db || !ctx.workspace) return null;
  const { data: c } = await ctx.db.from("campaigns").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!c) return null;
  const { data: stats } = await ctx.db.from("campaign_stats").select("*").eq("campaign_id", id).maybeSingle();

  const started = c.started_at ? new Date(c.started_at).getTime() : Date.now();
  const ageDays = Math.ceil((Date.now() - started) / 86400000) + 1;
  const span = Math.min(90, Math.max(7, ageDays));
  const [links, series] = await Promise.all([
    getTopLinks(ctx.db, ctx.workspace.id, { campaignId: id, limit: 20 }),
    getDailyActivity(ctx.db, { days: span, workspaceId: ctx.workspace.id, campaignId: id }),
  ]);
  const clicks = Number(stats?.clicks ?? 0);
  return {
    campaign: c as any,
    stats: {
      sent: Number(stats?.sent ?? 0), delivered: Number(stats?.delivered ?? 0), bounced: Number(stats?.bounced ?? 0),
      complained: Number(stats?.complained ?? 0), failed: Number(stats?.failed ?? 0), opens: Number(stats?.opens ?? 0),
      clicks, totalClicks: Number(stats?.total_clicks ?? clicks), unsubscribes: Number(stats?.unsubscribes ?? 0),
    },
    links, series,
  };
}

export async function getReports(ctx: Ctx, days: RangeDays) {
  const empty = { totals: sumDays([]), series: [] as Awaited<ReturnType<typeof getDailyActivity>>, links: [] as Awaited<ReturnType<typeof getTopLinks>>, campaigns: [] as CampaignRow[] };
  if (!ctx.db || !ctx.workspace) return empty;
  const [series, links, all] = await Promise.all([
    getDailyActivity(ctx.db, { days, workspaceId: ctx.workspace.id }),
    getTopLinks(ctx.db, ctx.workspace.id, { days, limit: 10 }),
    getCampaigns(ctx),
  ]);
  return { totals: sumDays(series), series, links, campaigns: all.filter((c) => c.status === "sent" || c.status === "sending") };
}

// ── Admin (every loader re-checks the admin role) ─────────────────

export async function getAdminOverview(days: RangeDays) {
  const { db } = await requireAdminDb();
  const [{ data: summary }, series, { data: top }, queue, { data: attention }, { data: abuse }, settings] = await Promise.all([
    db.rpc("platform_summary", { p_days: days }),
    getDailyActivity(db, { days }),
    db.rpc("top_workspaces", { p_days: days, p_limit: 8 }),
    getReviewQueue(),
    db.from("workspaces").select("id, name, status, plan").neq("status", "active").order("created_at", { ascending: false }).limit(10),
    db.from("abuse_reports").select("reason").eq("status", "open").order("created_at", { ascending: false }).limit(1),
    getPlatformSettings(),
  ]);
  const s = (summary ?? {}) as Record<string, any>;
  const num = (k: string) => Number(s[k] ?? 0) || 0;
  return {
    summary: {
      workspaces: num("workspaces"), newWorkspaces: num("new_workspaces"), newWorkspacesPrev: num("new_workspaces_prev"),
      users: num("users"), newUsers: num("new_users"), paidWorkspaces: num("paid_workspaces"), activeSenders: num("active_senders"),
      contacts: num("contacts"), sent: num("sent"), sentPrev: num("sent_prev"), delivered: num("delivered"),
      bounced: num("bounced"), bouncedPrev: num("bounced_prev"), complaints: num("complaints"), complaintsPrev: num("complaints_prev"),
      clicks: num("clicks"), clicksPrev: num("clicks_prev"), totalClicks: num("total_clicks"), unsubscribes: num("unsubscribes"),
      queued: num("queued"), failed: num("failed"), openAbuse: num("open_abuse"), pendingReview: num("pending_review"), suspended: num("suspended"),
      plans: (s.plans ?? {}) as Record<string, number>,
    },
    series,
    topWorkspaces: ((top ?? []) as any[]).map((t) => ({
      id: t.workspace_id as string, name: t.name as string, plan: String(t.plan), status: t.status as WorkspaceStatus,
      sent: Number(t.sent), bounced: Number(t.bounced), complaints: Number(t.complaints), clicks: Number(t.clicks),
    })),
    queue,
    attention: (attention ?? []).map((w: any) => ({ id: w.id as string, name: w.name as string, status: w.status as WorkspaceStatus, plan: w.plan as string })),
    alert: (abuse?.[0]?.reason as string | undefined) ?? "",
    settings,
  };
}

export async function getAdminWorkspaces(opts: { q?: string; status?: string } = {}) {
  const { db } = await requireAdminDb();
  let query = db.from("workspaces").select("id, name, owner_id, plan, status, created_at, daily_send_limit").order("created_at", { ascending: false }).limit(200);
  if (opts.status && ["active", "review", "suspended"].includes(opts.status)) query = query.eq("status", opts.status);
  const term = (opts.q ?? "").replace(/[^\p{L}\p{N}@.+_\- ]/gu, "").trim().slice(0, 80);
  if (term) query = query.ilike("name", `%${term}%`);
  const { data: ws } = await query;
  const owners = [...new Set((ws ?? []).map((w: any) => w.owner_id))];
  const { data: profiles } = owners.length ? await db.from("profiles").select("id, email").in("id", owners) : { data: [] as any[] };
  const { data: stats } = await db.from("workspace_stats_30d").select("*");
  const email = new Map((profiles ?? []).map((p: any) => [p.id, p.email]));
  const st = new Map((stats ?? []).map((s: any) => [s.workspace_id, s]));
  return (ws ?? []).map((w: any) => {
    const s: any = st.get(w.id);
    const sent = Number(s?.sent_30d ?? 0);
    return {
      id: w.id as string, name: w.name as string, owner: (email.get(w.owner_id) as string) ?? "-",
      plan: w.plan.charAt(0).toUpperCase() + w.plan.slice(1), status: w.status as WorkspaceStatus, created: fmt(w.created_at),
      dailyLimit: Number(w.daily_send_limit), sent30d: sent, complaints30d: Number(s?.complaints_30d ?? 0),
      complaintRate: sent ? `${((Number(s.complaints_30d) / sent) * 100).toFixed(2)}%` : "-",
    };
  });
}

export async function getAdminAnalytics(days: RangeDays) {
  const { db } = await requireAdminDb();
  const [series, { data: top }, { data: summary }] = await Promise.all([
    getDailyActivity(db, { days }),
    db.rpc("top_workspaces", { p_days: days, p_limit: 25 }),
    db.rpc("platform_summary", { p_days: days }),
  ]);
  return {
    series,
    summary: (summary ?? {}) as Record<string, any>,
    topWorkspaces: ((top ?? []) as any[]).map((t) => ({
      id: t.workspace_id as string, name: t.name as string, plan: String(t.plan), status: t.status as WorkspaceStatus,
      sent: Number(t.sent), bounced: Number(t.bounced), complaints: Number(t.complaints), clicks: Number(t.clicks),
    })),
  };
}

export async function getAdminUsers() {
  const { db } = await requireAdminDb();
  const { data } = await db.from("profiles").select("id, full_name, email, role, created_at").order("created_at", { ascending: false }).limit(200);
  return (data ?? []).map((u: any) => ({ id: u.id as string, name: (u.full_name as string) || "-", email: (u.email as string) || "-", role: u.role as string, joined: fmt(u.created_at) }));
}

export async function getReviewQueue() {
  const { db } = await requireAdminDb();
  const { data } = await db.from("campaigns").select("id, name, subject, recipient_count, created_at, workspace_id, workspaces(name)").eq("review_status", "pending").order("created_at");
  return (data ?? []).map((c: any) => ({ id: c.id as string, workspace: (c.workspaces?.name as string) ?? "-", campaign: c.name as string, recipients: Number(c.recipient_count), subject: c.subject as string, submitted: fmt(c.created_at) }));
}

export async function getAbuseReports() {
  const { db } = await requireAdminDb();
  const { data } = await db.from("abuse_reports").select("id, reporter, reason, status, created_at, workspaces(name)").order("created_at", { ascending: false }).limit(200);
  return (data ?? []).map((a: any) => ({ id: a.id as string, reporter: a.reporter as string, workspace: (a.workspaces?.name as string) ?? "-", reason: a.reason as string, status: a.status as string, received: fmt(a.created_at) }));
}

export async function getSuppression() {
  const { db } = await requireAdminDb();
  const { data } = await db.from("suppression_entries").select("email, reason, workspace_id, created_at").order("created_at", { ascending: false }).limit(200);
  return (data ?? []).map((s: any) => ({ email: s.email as string, reason: s.reason as string, scope: s.workspace_id ? "Workspace" : "Global", added: fmt(s.created_at) }));
}

export async function getAuditLog() {
  const { db } = await requireAdminDb();
  const { data } = await db.from("audit_log").select("id, actor_email, action, target_type, target_id, meta, ip, created_at").order("created_at", { ascending: false }).limit(200);
  return (data ?? []).map((a: any) => ({
    id: Number(a.id), actor: (a.actor_email as string) || "-", action: a.action as string,
    target: [a.target_type, a.target_id].filter(Boolean).join(" ") || "-", ip: (a.ip as string) || "-",
    detail: a.meta && Object.keys(a.meta).length ? JSON.stringify(a.meta) : "",
    when: new Date(a.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
  }));
}

export async function getPlatformSettings() {
  const { db } = await requireAdminDb();
  const fallback = { pause_bounce_pct: 5, pause_complaint_pct: 0.3, suspend_complaint_pct: 0.5, new_workspace_daily_limit: 200, new_workspace_max_contacts: 500 };
  const { data } = await db.from("platform_settings").select("*").eq("id", 1).maybeSingle();
  return { ...fallback, ...(data ?? {}) };
}