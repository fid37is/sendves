/**
 * Read queries for the dashboard and admin console. Every value comes from the database.
 * Dashboard reads use the service-role client filtered by the signed-in user's workspace.
 * Admin reads re-verify the admin role (and 2FA) themselves, so they are safe even if a page forgets to.
 */
import type { ScopeCtx as Ctx } from "@/lib/workspace";
import { canAccessDepartment, CAMPAIGN_ROLES, DEFAULT_PERMISSIONS, sanitizePermissions, type CampaignRole, type MemberRole, type Permission } from "@/lib/access";
import { inScope } from "@/server/scope";
import { sanitizeVariables, type VariableDef } from "@/lib/email/variables";
import { requireAdminDb } from "@/lib/auth/admin";
import { dnsRecordsFor } from "@/server/sending/domains";
import { limitsFor } from "@/config/plan-limits";
import { DEFAULT_SETTINGS, type Settings } from "@/server/abuse";
import { getDailyActivity, getTopLinks, pct, ratio, sumDays, type RangeDays } from "@/lib/analytics";
import { sanitizeBlocks } from "@/lib/email/sanitize";
import type { Block } from "@/lib/email/blocks";
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
export type DomainFinding = { status: "ok" | "missing" | "incorrect" | "pending"; message: string; found: string[] };
export type DomainRow = {
  id: string; domain: string; status: string; dkimOk: boolean; spfOk: boolean; dmarcOk: boolean;
  /** Ready to send as: DKIM, SPF and DMARC have all passed. */
  ready: boolean;
  lastChecked: string | null;
  findings: { dkim?: DomainFinding; spf?: DomainFinding; dmarc?: DomainFinding };
  records: { purpose: string; type: string; host: string; value: string; status: string }[];
};

const EMPTY_WORKSPACE = { name: "My workspace", plan: "Free", contactsUsed: 0, contactsLimit: 500, sendsUsed: 0, sendsLimit: 2000, dailyLimit: 200 };

// ── Dashboard ─────────────────────────────────────────────────────

/** "All subscribers", a list's name, or "2 lists + 5 contacts". */
function audienceLabel(r: any): string {
  if (r.audience_mode !== "custom") return "All subscribers";
  const lists: string[] = (r.campaign_audience_lists ?? []).map((l: any) => l.lists?.name).filter(Boolean);
  const contacts = Number(r.campaign_audience_contacts?.[0]?.count ?? 0);
  const parts: string[] = [];
  if (lists.length === 1) parts.push(lists[0]);
  else if (lists.length > 1) parts.push(`${lists.length} lists`);
  if (contacts > 0) parts.push(`${contacts} ${contacts === 1 ? "contact" : "contacts"}`);
  return parts.length ? parts.join(" + ") : "No audience yet";
}

export async function getCampaigns(ctx: Ctx, limit = 200): Promise<CampaignRow[]> {
  if (!ctx.db || !ctx.workspace) return [];
  const base = ctx.db.from("campaigns").select("id, name, subject, status, review_status, audience_mode, scheduled_at, completed_at, created_at, department_id, campaign_audience_lists(lists(name)), campaign_audience_contacts(count)")
    .eq("workspace_id", ctx.workspace.id);
  const { data: rows } = await inScope(base, ctx.access).order("created_at", { ascending: false }).limit(limit);
  const ids = (rows ?? []).map((r: any) => r.id);
  const { data: stats } = ids.length ? await ctx.db.from("campaign_stats").select("*").in("campaign_id", ids) : { data: [] as any[] };
  const byId = new Map((stats ?? []).map((s: any) => [s.campaign_id, s]));
  return (rows ?? []).map((r: any) => {
    const s: any = byId.get(r.id);
    const sent = Number(s?.sent ?? 0);
    const clicks = Number(s?.clicks ?? 0);
    return {
      id: r.id, name: r.name, subject: r.subject || "(no subject)", status: r.status, reviewStatus: r.review_status,
      audience: audienceLabel(r),
      sent, delivered: Number(s?.delivered ?? 0), bounced: Number(s?.bounced ?? 0), unsubscribes: Number(s?.unsubscribes ?? 0),
      clicks, totalClicks: Number(s?.total_clicks ?? clicks),
      clickRate: pct(clicks, sent), clickRateValue: ratio(clicks, sent),
      date: fmt(r.completed_at ?? r.scheduled_at ?? r.created_at),
    };
  });
}

export async function getOverview(ctx: Ctx | null) {
  const empty = {
    workspace: EMPTY_WORKSPACE, checklist: [true, false, false, false, false],
    recent: [] as CampaignRow[], series: [] as Awaited<ReturnType<typeof getDailyActivity>>,
    totals: sumDays([]), links: [] as Awaited<ReturnType<typeof getTopLinks>>, avgClickRate: "-",
  };
  if (!ctx?.db || !ctx.workspace) return empty;
  const ws = ctx.workspace;
  const db = ctx.db;
  const limits = limitsFor(ws.plan);

  const [{ count: contacts }, { count: sends }, { count: domains }, { count: sentCampaigns }, campaigns, orgSeries, orgLinks] = await Promise.all([
    db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id),
    db.from("sends").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).gte("sent_at", monthStart()),
    db.from("sending_domains").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("status", "verified"),
    db.from("campaigns").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).in("status", ["sending", "sent"]),
    getCampaigns(ctx, 5),
    ctx.access?.allDepartments ? getDailyActivity(db, { days: 30, workspaceId: ws.id }) : Promise.resolve([] as Awaited<ReturnType<typeof getDailyActivity>>),
    ctx.access?.allDepartments ? getTopLinks(db, ws.id, { days: 30, limit: 5 }) : Promise.resolve([] as Awaited<ReturnType<typeof getTopLinks>>),
  ]);

  // Someone who can't see every department only sees activity of the campaigns they may open.
  let series = orgSeries;
  let links = orgLinks;
  if (!ctx.access?.allDepartments) {
    const mine = (await getCampaigns(ctx)).filter((c) => c.status === "sent" || c.status === "sending").map((c) => c.id);
    const scoped = await activityForCampaigns(ctx, mine, 30);
    series = scoped.series;
    links = scoped.links.slice(0, 5);
  }

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
    ? await ctx.db.from("list_members").select("contact_id, lists(id, name, department_id)").in("contact_id", ids)
    : { data: [] as any[] };
  const listsByContact = new Map<string, { id: string; name: string }[]>();
  for (const m of (memberships ?? []) as any[]) {
    if (!m.lists || !canAccessDepartment(ctx.access, m.lists.department_id)) continue;
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
  const { data } = await inScope(ctx.db.from("lists").select("id, name, list_members(count)").eq("workspace_id", ctx.workspace.id), ctx.access).order("name");
  return (data ?? []).map((l: any) => ({ id: l.id as string, name: l.name as string, count: Number(l.list_members?.[0]?.count ?? 0) }));
}

/**
 * What a campaign can be sent to, with the number of people who would actually receive it
 * (subscribed contacts only, the same rule the send itself uses).
 */
export type AudienceOption = { id: string; name: string; subscribed: number };
export async function getAudienceOptions(ctx: Ctx): Promise<{ lists: AudienceOption[]; totalSubscribed: number }> {
  if (!ctx.db || !ctx.workspace) return { lists: [], totalSubscribed: 0 };
  const db = ctx.db;
  const ws = ctx.workspace.id;
  const [{ data: lists }, { count: total }] = await Promise.all([
    inScope(db.from("lists").select("id, name").eq("workspace_id", ws), ctx.access).order("name"),
    db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "subscribed"),
  ]);
  const withCounts = await Promise.all(
    (lists ?? []).map(async (l: any) => {
      const { count } = await db.from("contacts").select("id, list_members!inner(list_id)", { count: "exact", head: true })
        .eq("workspace_id", ws).eq("status", "subscribed").eq("list_members.list_id", l.id);
      return { id: l.id as string, name: l.name as string, subscribed: count ?? 0 };
    }),
  );
  return { lists: withCounts, totalSubscribed: total ?? 0 };
}

export type TemplateRow = { id: string; name: string; description: string; subject: string; preview_text: string; blocks: Block[]; variables: VariableDef[]; departmentId: string | null; updated: string };
const TEMPLATE_COLUMNS = "id, name, description, subject, preview_text, blocks, variables, department_id, updated_at";
const toTemplate = (t: any): TemplateRow => ({
  id: t.id, name: t.name, description: t.description ?? "", subject: t.subject ?? "", preview_text: t.preview_text ?? "",
  blocks: sanitizeBlocks(t.blocks), variables: sanitizeVariables(t.variables), departmentId: t.department_id ?? null, updated: fmt(t.updated_at),
});

/** The workspace's own templates, most recently edited first. */
export async function getTemplates(ctx: Ctx): Promise<TemplateRow[]> {
  if (!ctx.db || !ctx.workspace) return [];
  const { data } = await inScope(ctx.db.from("templates").select(TEMPLATE_COLUMNS).eq("workspace_id", ctx.workspace.id), ctx.access)
    .order("updated_at", { ascending: false }).limit(200);
  return (data ?? []).map(toTemplate);
}

export async function getTemplate(ctx: Ctx, id: string): Promise<TemplateRow | null> {
  if (!ctx.db || !ctx.workspace || !UUID_RE.test(id)) return null;
  const { data } = await ctx.db.from("templates").select(TEMPLATE_COLUMNS).eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  return data && canAccessDepartment(ctx.access, (data as any).department_id) ? toTemplate(data) : null;
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
    ready: d.status === "verified" && d.dkim_ok && d.spf_ok && d.dmarc_ok,
    lastChecked: d.last_checked_at ?? null,
    findings: (d.findings && typeof d.findings === "object" ? d.findings : {}) as DomainRow["findings"],
    records: dnsRecordsFor(d.domain, d.dkim_tokens ?? []).map((r) => ({
      ...r, status: (r.purpose === "DKIM" ? d.dkim_ok : r.purpose === "SPF" ? d.spf_ok : d.dmarc_ok) ? "verified" : "pending",
    })),
  }));
}

export async function getCampaignDetail(ctx: Ctx, id: string) {
  if (!ctx.db || !ctx.workspace) return null;
  const { data: c } = await ctx.db.from("campaigns").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!c || !canAccessDepartment(ctx.access, c.department_id)) return null;
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

export type RecipientRow = {
  id: string; email: string; status: string; error: string; sentAt: string | null;
  opened: boolean; clicked: number; unsubscribed: boolean;
};
export const RECIPIENT_FILTERS = ["all", "delivered", "opened", "clicked", "bounced", "failed", "complained", "queued"] as const;
export type RecipientFilter = (typeof RECIPIENT_FILTERS)[number];
export const RECIPIENT_PAGE = 25;

/**
 * What happened to each person a campaign was sent to, one page at a time. Open / click / unsubscribe
 * come from the events table; delivery state and the failure reason come from the send itself.
 * The caller must already have loaded the campaign through getCampaignDetail (which checks access).
 */
export async function getCampaignRecipients(ctx: Ctx, campaignId: string, opts: { filter?: string; q?: string; page?: number } = {}) {
  const empty = { rows: [] as RecipientRow[], total: 0, page: 1, pages: 1 };
  if (!ctx.db || !ctx.workspace) return empty;
  const filter = (RECIPIENT_FILTERS as readonly string[]).includes(opts.filter ?? "") ? (opts.filter as RecipientFilter) : "all";
  const page = Math.max(1, Math.floor(opts.page ?? 1) || 1);
  const term = (opts.q ?? "").replace(/[^\p{L}\p{N}@.+_\- ]/gu, "").trim().slice(0, 80);

  // Opened / clicked are about events, so resolve those filters to a list of send ids first.
  let restrictIds: string[] | null = null;
  if (filter === "opened" || filter === "clicked") {
    const { data } = await ctx.db.from("events").select("send_id").eq("campaign_id", campaignId).eq("type", filter === "opened" ? "open" : "click").limit(5000);
    restrictIds = Array.from(new Set<string>(((data ?? []) as any[]).map((e) => String(e.send_id ?? "")).filter(Boolean)));
    if (!restrictIds.length) return empty;
  }

  let query = ctx.db.from("sends").select("id, email, status, last_error, sent_at, created_at", { count: "exact" })
    .eq("campaign_id", campaignId).eq("workspace_id", ctx.workspace.id)
    .order("sent_at", { ascending: false, nullsFirst: false }).order("email").range((page - 1) * RECIPIENT_PAGE, page * RECIPIENT_PAGE - 1);
  if (restrictIds) query = query.in("id", restrictIds);
  else if (filter === "queued") query = query.in("status", ["queued", "sending"]);
  else if (filter !== "all") query = query.eq("status", filter);
  if (term) query = query.ilike("email", `%${term}%`);
  const { data, count } = await query;
  const sends = (data ?? []) as any[];
  const ids = sends.map((r) => r.id as string);
  const { data: ev } = ids.length ? await ctx.db.from("events").select("send_id, type").in("send_id", ids).in("type", ["open", "click", "unsubscribe"]) : { data: [] as any[] };
  const opened = new Set<string>(); const unsub = new Set<string>(); const clicks = new Map<string, number>();
  for (const e of (ev ?? []) as any[]) {
    if (e.type === "open") opened.add(e.send_id);
    else if (e.type === "unsubscribe") unsub.add(e.send_id);
    else clicks.set(e.send_id, (clicks.get(e.send_id) ?? 0) + 1);
  }
  const total = count ?? 0;
  return {
    rows: sends.map((r): RecipientRow => ({
      id: r.id, email: r.email, status: r.status, error: (r.last_error as string) ?? "", sentAt: r.sent_at ?? null,
      opened: opened.has(r.id), clicked: clicks.get(r.id) ?? 0, unsubscribed: unsub.has(r.id),
    })),
    total, page, pages: Math.max(1, Math.ceil(total / RECIPIENT_PAGE)),
  };
}

/** Where a campaign is in its send (queued / skipped) and why sends failed, grouped by reason. */
export async function getCampaignDelivery(ctx: Ctx, campaignId: string) {
  const none = { queued: 0, skipped: 0, total: 0, failures: [] as { reason: string; count: number }[] };
  if (!ctx.db || !ctx.workspace) return none;
  const count = async (statuses: string[]) => {
    const { count: n } = await ctx.db!.from("sends").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).in("status", statuses);
    return n ?? 0;
  };
  const [queued, skipped, total, { data: bad }] = await Promise.all([
    count(["queued", "sending"]), count(["skipped"]),
    ctx.db.from("sends").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).then((r) => r.count ?? 0),
    ctx.db.from("sends").select("last_error").eq("campaign_id", campaignId).in("status", ["failed", "bounced"]).not("last_error", "is", null).limit(2000),
  ]);
  const by = new Map<string, number>();
  for (const r of (bad ?? []) as any[]) {
    const reason = String(r.last_error).replace(/\s+/g, " ").trim().slice(0, 160);
    if (reason) by.set(reason, (by.get(reason) ?? 0) + 1);
  }
  return { queued, skipped, total, failures: [...by.entries()].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count).slice(0, 6) };
}

/**
 * Sums activity over specific campaigns. Used for people who can't see every department, so their
 * numbers cover only campaigns they may access (never the organization-wide aggregate).
 */
async function activityForCampaigns(ctx: Ctx, campaignIds: string[], days: RangeDays) {
  const ids = campaignIds.slice(0, 40);
  const [seriesList, linkList] = await Promise.all([
    Promise.all(ids.map((id) => getDailyActivity(ctx.db!, { days, workspaceId: ctx.workspace!.id, campaignId: id }))),
    Promise.all(ids.map((id) => getTopLinks(ctx.db!, ctx.workspace!.id, { campaignId: id, days, limit: 20 }))),
  ]);
  const byDate = new Map<string, Awaited<ReturnType<typeof getDailyActivity>>[number]>();
  for (const series of seriesList) {
    for (const p of series) {
      const cur = byDate.get(p.date);
      if (!cur) { byDate.set(p.date, { ...p }); continue; }
      cur.sent += p.sent; cur.delivered += p.delivered; cur.bounced += p.bounced; cur.complaints += p.complaints;
      cur.opens += p.opens; cur.clicks += p.clicks; cur.uniqueClicks += p.uniqueClicks; cur.unsubscribes += p.unsubscribes;
    }
  }
  const byUrl = new Map<string, { url: string; clicks: number; uniqueClicks: number }>();
  for (const l of linkList.flat()) {
    const cur = byUrl.get(l.url) ?? { url: l.url, clicks: 0, uniqueClicks: 0 };
    cur.clicks += l.clicks; cur.uniqueClicks += l.uniqueClicks;
    byUrl.set(l.url, cur);
  }
  return {
    series: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    links: [...byUrl.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 10),
  };
}

export async function getReports(ctx: Ctx, days: RangeDays) {
  const empty = { totals: sumDays([]), series: [] as Awaited<ReturnType<typeof getDailyActivity>>, links: [] as Awaited<ReturnType<typeof getTopLinks>>, campaigns: [] as CampaignRow[] };
  if (!ctx.db || !ctx.workspace) return empty;
  const all = await getCampaigns(ctx); // already limited to the departments this person may see
  const campaigns = all.filter((c) => c.status === "sent" || c.status === "sending");
  if (ctx.access?.allDepartments) {
    const [series, links] = await Promise.all([
      getDailyActivity(ctx.db, { days, workspaceId: ctx.workspace.id }),
      getTopLinks(ctx.db, ctx.workspace.id, { days, limit: 10 }),
    ]);
    return { totals: sumDays(series), series, links, campaigns };
  }
  const { series, links } = await activityForCampaigns(ctx, campaigns.map((c) => c.id), days);
  return { totals: sumDays(series), series, links, campaigns };
}

// ── Organization: departments, team, invitations, permissions ─────

export type DepartmentRow = { id: string; name: string; description: string; members: number; resources: number };

export async function getDepartments(ctx: Ctx): Promise<DepartmentRow[]> {
  if (!ctx.db || !ctx.workspace) return [];
  const ws = ctx.workspace.id;
  const [{ data: depts }, { data: links }, { data: campaigns }, { data: lists }, { data: templates }] = await Promise.all([
    ctx.db.from("departments").select("id, name, description").eq("workspace_id", ws).order("name"),
    ctx.db.from("department_members").select("department_id").eq("workspace_id", ws),
    ctx.db.from("campaigns").select("department_id").eq("workspace_id", ws).not("department_id", "is", null),
    ctx.db.from("lists").select("department_id").eq("workspace_id", ws).not("department_id", "is", null),
    ctx.db.from("templates").select("department_id").eq("workspace_id", ws).not("department_id", "is", null),
  ]);
  const tally = (rows: any[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.department_id, (m.get(r.department_id) ?? 0) + 1);
    return m;
  };
  const members = tally(links);
  const resources = [tally(campaigns), tally(lists), tally(templates)];
  return (depts ?? []).map((d: any) => ({
    id: d.id as string, name: d.name as string, description: (d.description as string) ?? "",
    members: members.get(d.id) ?? 0, resources: resources.reduce((n, m) => n + (m.get(d.id) ?? 0), 0),
  }));
}

export type TeamMember = {
  userId: string; name: string; email: string; role: MemberRole; status: "active" | "deactivated"; departmentIds: string[]; joined: string;
  /** The person's work email on a verified company domain (jon@domain.com), or null until one is set. */
  workEmail: string | null; aliasCount: number;
  /** Where invitations and password-recovery links go. Not a sign-in email and never a sender. */
  recoveryEmail: string | null;
};

export async function getTeam(ctx: Ctx): Promise<TeamMember[]> {
  if (!ctx.db || !ctx.workspace) return [];
  const ws = ctx.workspace.id;
  const [{ data: members }, { data: links }, { data: idents }] = await Promise.all([
    ctx.db.from("workspace_members").select("user_id, role, status, created_at").eq("workspace_id", ws).order("created_at"),
    ctx.db.from("department_members").select("department_id, user_id").eq("workspace_id", ws),
    ctx.db.from("sender_identities").select("user_id, kind, email").eq("workspace_id", ws),
  ]);
  const work = new Map<string, string>();
  const aliases = new Map<string, number>();
  for (const i of (idents ?? []) as any[]) {
    if (!i.user_id) continue;
    if (i.kind === "primary") work.set(i.user_id, i.email);
    else aliases.set(i.user_id, (aliases.get(i.user_id) ?? 0) + 1);
  }
  const ids = (members ?? []).map((m: any) => m.user_id as string);
  const { data: profiles } = ids.length ? await ctx.db.from("profiles").select("id, full_name, email, recovery_email").in("id", ids) : { data: [] as any[] };
  const byId = new Map((profiles ?? []).map((p: any) => [p.id as string, p]));
  const depts = new Map<string, string[]>();
  for (const l of (links ?? []) as any[]) depts.set(l.user_id, [...(depts.get(l.user_id) ?? []), l.department_id]);
  return (members ?? []).map((m: any) => {
    const p: any = byId.get(m.user_id);
    return {
      userId: m.user_id as string, name: (p?.full_name as string) || "", email: (p?.email as string) || "",
      role: m.role as MemberRole, status: m.status as "active" | "deactivated", departmentIds: depts.get(m.user_id) ?? [], joined: fmt(m.created_at),
      workEmail: work.get(m.user_id) ?? null, aliasCount: aliases.get(m.user_id) ?? 0, recoveryEmail: (p?.recovery_email as string) || null,
    };
  });
}

/** `email` is the company email they will sign in with; `contactEmail` is the personal address the invitation was sent to. */
export type InviteRow = { id: string; email: string; contactEmail: string; fullName: string; role: MemberRole; departmentIds: string[]; expires: string; expired: boolean; invitedBy: string };

export async function getPendingInvites(ctx: Ctx): Promise<InviteRow[]> {
  if (!ctx.db || !ctx.workspace) return [];
  const { data } = await ctx.db.from("workspace_invites").select("id, email, contact_email, full_name, role, department_ids, expires_at, invited_by")
    .eq("workspace_id", ctx.workspace.id).eq("status", "pending").order("created_at", { ascending: false });
  const inviterIds = [...new Set((data ?? []).map((i: any) => i.invited_by).filter(Boolean))] as string[];
  const { data: inviters } = inviterIds.length ? await ctx.db.from("profiles").select("id, full_name, email").in("id", inviterIds) : { data: [] as any[] };
  const who = new Map((inviters ?? []).map((p: any) => [p.id as string, (p.full_name as string) || (p.email as string) || ""]));
  return (data ?? []).map((i: any) => ({
    id: i.id as string, email: i.email as string, contactEmail: (i.contact_email as string) ?? "", fullName: (i.full_name as string) ?? "", role: i.role as MemberRole, departmentIds: (i.department_ids ?? []) as string[],
    expires: fmt(i.expires_at), expired: new Date(i.expires_at).getTime() < Date.now(), invitedBy: (who.get(i.invited_by) as string) ?? "",
  }));
}

/** What each configurable role may do in this organization: saved choices, or the defaults. */
export async function getRolePermissionMap(ctx: Ctx): Promise<Record<CampaignRole, Permission[]>> {
  const out: Record<string, Permission[]> = {};
  for (const r of CAMPAIGN_ROLES) out[r] = sanitizePermissions(DEFAULT_PERMISSIONS[r], r);
  if (ctx.db && ctx.workspace) {
    const { data } = await ctx.db.from("role_permissions").select("role, permissions").eq("workspace_id", ctx.workspace.id);
    for (const r of (data ?? []) as any[]) if (r.role in out) out[r.role] = sanitizePermissions(r.permissions, r.role);
  }
  return out as Record<CampaignRole, Permission[]>;
}

// ── Sender identities ─────────────────────────────────────────────

export type SenderRow = {
  id: string; email: string; localPart: string; fromName: string; status: "active" | "inactive";
  domainId: string; domain: string; domainReady: boolean;
  kind: "primary" | "alias"; userId: string | null;
};

const toSenderRow = (r: any): SenderRow => {
  const d = r.sending_domains ?? {};
  return {
    id: r.id as string, email: r.email as string, localPart: r.local_part as string, fromName: r.from_name as string, status: r.status as "active" | "inactive",
    domainId: r.domain_id as string, domain: (d.domain as string) ?? "", domainReady: d.status === "verified" && d.dkim_ok === true && d.spf_ok === true && d.dmarc_ok === true,
    kind: r.kind === "primary" ? "primary" : "alias", userId: (r.user_id as string) ?? null,
  };
};

const SENDER_COLUMNS = "id, email, local_part, from_name, status, domain_id, user_id, kind, sending_domains(domain, status, dkim_ok, spf_ok, dmarc_ok)";

/**
 * What the signed-in person can send as: their own work email first, then their aliases. Nobody sees
 * anyone else's addresses here. `keepId` adds the address a draft already uses, even if it is someone
 * else's, so opening a colleague's draft doesn't silently drop its sender.
 */
export async function getSenderIdentities(ctx: Ctx, userId: string, keepId?: string | null): Promise<SenderRow[]> {
  if (!ctx.db || !ctx.workspace) return [];
  const mine = ctx.db.from("sender_identities").select(SENDER_COLUMNS).eq("workspace_id", ctx.workspace.id).eq("user_id", userId);
  const { data } = await mine;
  const rows = (data ?? []) as any[];
  if (keepId && UUID_RE.test(keepId) && !rows.some((r) => r.id === keepId)) {
    const { data: extra } = await ctx.db.from("sender_identities").select(SENDER_COLUMNS).eq("workspace_id", ctx.workspace.id).eq("id", keepId).maybeSingle();
    if (extra) rows.push(extra);
  }
  return rows.map(toSenderRow).sort((a, b) => (a.kind === b.kind ? a.email.localeCompare(b.email) : a.kind === "primary" ? -1 : 1));
}

/** One team member's work email and aliases (for the team details page). */
export async function getMemberSenders(ctx: Ctx, userId: string): Promise<{ primary: SenderRow | null; aliases: SenderRow[] }> {
  if (!ctx.db || !ctx.workspace || !UUID_RE.test(userId)) return { primary: null, aliases: [] };
  const { data } = await ctx.db.from("sender_identities").select(SENDER_COLUMNS).eq("workspace_id", ctx.workspace.id).eq("user_id", userId).order("email");
  const rows = ((data ?? []) as any[]).map(toSenderRow);
  return { primary: rows.find((r) => r.kind === "primary") ?? null, aliases: rows.filter((r) => r.kind === "alias") };
}

/** Custom contact fields in use in this workspace (extra columns of imported files). */
export async function getContactFieldKeys(ctx: Ctx): Promise<string[]> {
  if (!ctx.db || !ctx.workspace) return [];
  const { data } = await ctx.db.rpc("contact_field_keys", { p_workspace: ctx.workspace.id });
  return Array.isArray(data) ? (data as string[]) : [];
}

// ── Campaign audience ─────────────────────────────────────────────

export type SelectedContact = { id: string; email: string; name: string };
export type CampaignAudienceDetail = { mode: "all" | "custom"; listIds: string[]; contacts: SelectedContact[] };

export async function getCampaignAudienceDetail(ctx: Ctx, campaignId: string): Promise<CampaignAudienceDetail> {
  const empty: CampaignAudienceDetail = { mode: "all", listIds: [], contacts: [] };
  if (!ctx.db || !ctx.workspace || !UUID_RE.test(campaignId)) return empty;
  const [{ data: c }, { data: lists }, { data: contacts }] = await Promise.all([
    ctx.db.from("campaigns").select("audience_mode").eq("id", campaignId).eq("workspace_id", ctx.workspace.id).maybeSingle(),
    ctx.db.from("campaign_audience_lists").select("list_id").eq("campaign_id", campaignId),
    ctx.db.from("campaign_audience_contacts").select("contacts(id, email, first_name, last_name, workspace_id)").eq("campaign_id", campaignId).limit(5000),
  ]);
  if (!c) return empty;
  return {
    mode: (c as any).audience_mode === "custom" ? "custom" : "all",
    listIds: ((lists ?? []) as any[]).map((l) => l.list_id as string),
    contacts: ((contacts ?? []) as any[])
      .map((r) => r.contacts).filter((x: any) => x && x.workspace_id === ctx.workspace!.id)
      .map((x: any) => ({ id: x.id as string, email: x.email as string, name: [x.first_name, x.last_name].filter(Boolean).join(" ") })),
  };
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
  const wsIds = (ws ?? []).map((w: any) => w.id as string);
  const { data: memberRows } = wsIds.length ? await db.from("workspace_members").select("workspace_id").in("workspace_id", wsIds) : { data: [] as any[] };
  const memberCount = new Map<string, number>();
  for (const m of (memberRows ?? []) as any[]) memberCount.set(m.workspace_id, (memberCount.get(m.workspace_id) ?? 0) + 1);
  const email = new Map((profiles ?? []).map((p: any) => [p.id, p.email]));
  const st = new Map((stats ?? []).map((s: any) => [s.workspace_id, s]));
  return (ws ?? []).map((w: any) => {
    const s: any = st.get(w.id);
    const sent = Number(s?.sent_30d ?? 0);
    return {
      id: w.id as string, name: w.name as string, owner: (email.get(w.owner_id) as string) ?? "-",
      plan: w.plan.charAt(0).toUpperCase() + w.plan.slice(1), status: w.status as WorkspaceStatus, created: fmt(w.created_at),
      members: memberCount.get(w.id) ?? 0, dailyLimit: Number(w.daily_send_limit), sent30d: sent, complaints30d: Number(s?.complaints_30d ?? 0),
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

const sinceText = (iso?: string | null) => {
  if (!iso) return "Never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} hr ago`;
  if (mins < 60 * 24 * 30) return `${Math.floor(mins / 1440)} d ago`;
  return fmt(iso);
};

export type AdminUserRow = {
  id: string; name: string; email: string; role: string; joined: string; lastSeen: string; confirmed: boolean;
  workspaces: { id: string; name: string; role: string; status: WorkspaceStatus }[];
};

/** Sign-in details live in the auth schema, not in profiles. Best effort: the list still works without them. */
async function authInfo(db: Awaited<ReturnType<typeof requireAdminDb>>["db"], ids: Set<string>) {
  const out = new Map<string, { lastSignIn: string | null; confirmed: boolean }>();
  try {
    for (let page = 1; page <= 5 && out.size < ids.size; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
      const users = data?.users ?? [];
      for (const u of users) out.set(u.id, { lastSignIn: u.last_sign_in_at ?? null, confirmed: Boolean(u.email_confirmed_at) });
      if (users.length < 200) break;
    }
  } catch { /* leave the sign-in columns empty */ }
  return out;
}

export async function getAdminUsers(opts: { q?: string; role?: string } = {}) {
  const { db } = await requireAdminDb();
  let query = db.from("profiles").select("id, full_name, email, role, created_at").order("created_at", { ascending: false }).limit(200);
  if (opts.role === "admin" || opts.role === "user") query = query.eq("role", opts.role);
  const term = (opts.q ?? "").replace(/[^\p{L}\p{N}@.+_\- ]/gu, "").trim().slice(0, 80);
  if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  const { data } = await query;
  const profiles = (data ?? []) as any[];
  const ids = profiles.map((u) => u.id as string);
  const [{ data: members }, auth, { count: total }, { count: admins }] = await Promise.all([
    ids.length ? db.from("workspace_members").select("user_id, role, workspaces(id, name, status)").in("user_id", ids) : Promise.resolve({ data: [] as any[] }),
    authInfo(db, new Set(ids)),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin"),
  ]);
  const byUser = new Map<string, AdminUserRow["workspaces"]>();
  for (const m of (members ?? []) as any[]) {
    if (!m.workspaces) continue;
    const list = byUser.get(m.user_id) ?? [];
    list.push({ id: m.workspaces.id, name: m.workspaces.name, role: m.role, status: m.workspaces.status });
    byUser.set(m.user_id, list);
  }
  const users: AdminUserRow[] = profiles.map((u) => ({
    id: u.id, name: (u.full_name as string) || "-", email: (u.email as string) || "-", role: u.role as string,
    joined: fmt(u.created_at), lastSeen: sinceText(auth.get(u.id)?.lastSignIn), confirmed: auth.get(u.id)?.confirmed ?? true,
    workspaces: byUser.get(u.id) ?? [],
  }));
  return { users, total: total ?? users.length, admins: admins ?? 0, noWorkspace: users.filter((u) => u.role !== "admin" && u.workspaces.length === 0).length };
}

export async function getAdminUserDetail(id: string) {
  const { db } = await requireAdminDb();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: p } = await db.from("profiles").select("id, full_name, email, role, created_at").eq("id", id).maybeSingle();
  if (!p) return null;
  const [{ data: members }, auth, { data: audit }] = await Promise.all([
    db.from("workspace_members").select("role, workspaces(id, name, status, plan, owner_id)").eq("user_id", id),
    authInfo(db, new Set([id])),
    db.from("audit_log").select("action, target_type, target_id, created_at").eq("actor_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  const info = auth.get(id);
  let disabled = false;
  try {
    const { data: authUser } = await db.auth.admin.getUserById(id);
    const until = (authUser?.user as { banned_until?: string | null } | undefined)?.banned_until;
    disabled = Boolean(until && new Date(until).getTime() > Date.now());
  } catch { /* leave as enabled */ }
  return {
    id: p.id as string, name: (p.full_name as string) || "-", email: (p.email as string) || "-", role: p.role as string,
    disabled,
    joined: fmt(p.created_at), lastSeen: sinceText(info?.lastSignIn), confirmed: info?.confirmed ?? true,
    workspaces: ((members ?? []) as any[]).filter((m) => m.workspaces).map((m) => ({
      id: m.workspaces.id as string, name: m.workspaces.name as string, status: m.workspaces.status as WorkspaceStatus,
      plan: String(m.workspaces.plan), role: m.role as string, owns: m.workspaces.owner_id === id,
    })),
    activity: ((audit ?? []) as any[]).map((a) => ({ action: a.action as string, target: [a.target_type, a.target_id].filter(Boolean).join(" "), when: new Date(a.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) })),
  };
}

/** Everything an admin needs to look after one customer organization. */
export async function getAdminWorkspaceDetail(id: string) {
  const { db } = await requireAdminDb();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: w } = await db.from("workspaces").select("*").eq("id", id).maybeSingle();
  if (!w) return null;
  const head = (table: string, f: (q: any) => any = (q) => q) => f(db.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", id)).then((r: any) => (r.count ?? 0) as number);
  const [
    { data: members }, { data: owner }, { data: domains }, { data: senders }, { data: campaigns }, { data: stats }, { data: abuse }, { data: audit },
    contacts, subscribed, lists, invites, series,
  ] = await Promise.all([
    db.from("workspace_members").select("user_id, role").eq("workspace_id", id),
    db.from("profiles").select("id, full_name, email").eq("id", w.owner_id).maybeSingle(),
    db.from("sending_domains").select("id, domain, status, dkim_ok, spf_ok, dmarc_ok, created_at").eq("workspace_id", id).order("created_at"),
    db.from("sender_identities").select("id, email, status").eq("workspace_id", id),
    db.from("campaigns").select("id, name, subject, status, review_status, recipient_count, created_at, started_at, completed_at").eq("workspace_id", id).neq("status", "draft").order("created_at", { ascending: false }).limit(10),
    db.from("workspace_stats_30d").select("*").eq("workspace_id", id).maybeSingle(),
    db.from("abuse_reports").select("id, reporter, reason, status, created_at").eq("workspace_id", id).order("created_at", { ascending: false }).limit(10),
    db.from("audit_log").select("actor_email, action, meta, created_at").eq("target_id", id).order("created_at", { ascending: false }).limit(15),
    head("contacts"), head("contacts", (q) => q.eq("status", "subscribed")), head("lists"), head("workspace_invites", (q) => q.eq("status", "pending")),
    getDailyActivity(db, { days: 30, workspaceId: id }),
  ]);
  const userIds = (members ?? []).map((m: any) => m.user_id as string);
  const { data: profs } = userIds.length ? await db.from("profiles").select("id, full_name, email").in("id", userIds) : { data: [] as any[] };
  const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const campaignIds = (campaigns ?? []).map((c: any) => c.id as string);
  const { data: cstats } = campaignIds.length ? await db.from("campaign_stats").select("campaign_id, sent, delivered, bounced, complained, clicks").in("campaign_id", campaignIds) : { data: [] as any[] };
  const cs = new Map((cstats ?? []).map((r: any) => [r.campaign_id, r]));
  const sent30 = Number(stats?.sent_30d ?? 0);
  const complaints30 = Number(stats?.complaints_30d ?? 0);
  const totals = series.reduce((t, d) => ({ delivered: t.delivered + d.delivered, bounced: t.bounced + d.bounced, opens: t.opens + d.opens, clicks: t.clicks + d.uniqueClicks }), { delivered: 0, bounced: 0, opens: 0, clicks: 0 });
  return {
    id: w.id as string, name: w.name as string, plan: String(w.plan), status: w.status as WorkspaceStatus, created: fmt(w.created_at),
    timezone: (w.timezone as string) || "UTC", address: (w.business_address as string) || "", dailyLimit: Number(w.daily_send_limit), maxContacts: Number(w.max_contacts),
    planLimits: limitsFor(String(w.plan)),
    billing: { provider: (w.billing_provider as string | null) ?? null, ref: (w.billing_ref as string | null) ?? null },
    owner: owner ? { id: owner.id as string, name: (owner.full_name as string) || "-", email: (owner.email as string) || "-" } : null,
    members: ((members ?? []) as any[]).map((m) => {
      const p: any = pmap.get(m.user_id);
      return { id: m.user_id as string, name: (p?.full_name as string) || "-", email: (p?.email as string) || "-", role: m.role as string, owner: m.user_id === w.owner_id };
    }).sort((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name)),
    counts: { contacts, subscribed, lists, invites, senders: (senders ?? []).filter((x: any) => x.status === "active").length },
    domains: ((domains ?? []) as any[]).map((d) => ({ id: d.id as string, domain: d.domain as string, status: d.status as string, dkim: !!d.dkim_ok, spf: !!d.spf_ok, dmarc: !!d.dmarc_ok, added: fmt(d.created_at) })),
    campaigns: ((campaigns ?? []) as any[]).map((c) => {
      const r: any = cs.get(c.id);
      const sent = Number(r?.sent ?? 0);
      return {
        id: c.id as string, name: c.name as string, subject: c.subject as string, status: c.status as string, review: c.review_status as string,
        recipients: Number(c.recipient_count ?? 0), sent, delivered: Number(r?.delivered ?? 0), bounced: Number(r?.bounced ?? 0), complained: Number(r?.complained ?? 0),
        clickRate: pct(Number(r?.clicks ?? 0), sent), date: fmt(c.completed_at ?? c.started_at ?? c.created_at),
      };
    }),
    activity: { sent30, complaints30, complaintRate: pct(complaints30, sent30, 2), bounceRate: pct(totals.bounced, sent30), deliveredRate: pct(totals.delivered, sent30), series, ...totals },
    abuse: ((abuse ?? []) as any[]).map((a) => ({ id: a.id as string, reporter: a.reporter as string, reason: a.reason as string, status: a.status as string, received: fmt(a.created_at) })),
    audit: ((audit ?? []) as any[]).map((a) => ({
      actor: (a.actor_email as string) || "-", action: a.action as string, detail: a.meta && Object.keys(a.meta).length ? JSON.stringify(a.meta) : "",
      when: new Date(a.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    })),
  };
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
  const { data } = await db.from("platform_settings").select("*").eq("id", 1).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as Settings;
}