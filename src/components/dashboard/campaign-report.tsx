import Link from "next/link";
import { Search } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/page-header";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { FactList } from "@/components/ui/tabs";
import { Funnel, TrendChart } from "@/components/charts/trend-chart";
import { pct } from "@/lib/analytics";
import { formatNumber, cn } from "@/lib/utils";
import { RECIPIENT_FILTERS, RECIPIENT_PAGE, type RecipientRow } from "@/lib/queries";

type Stats = { sent: number; delivered: number; bounced: number; complained: number; failed: number; opens: number; clicks: number; totalClicks: number; unsubscribes: number };
type Delivery = { queued: number; skipped: number; total: number; failures: { reason: string; count: number }[] };

const when = (iso?: string | null, tz = "UTC") => {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }); }
  catch { return new Date(iso).toLocaleString("en-US"); }
};

/** The campaign as a sent email: who it came from, what it said, and the email itself. */
export function CampaignContent({ c, tz }: { c: any; tz: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <CardHeader title="The email" description="Exactly what recipients received. Names and other {{variables}} are filled in separately for each person; the unsubscribe footer is added when sending." />
        {c.html ? (
          <iframe title={`Email: ${c.name}`} srcDoc={c.html} sandbox="" className="h-[760px] w-full bg-mist-50" />
        ) : (
          <p className="p-6 text-sm text-ink-muted">No email content was stored for this campaign.</p>
        )}
      </Card>
      <Card className="h-fit">
        <CardHeader title="Details" />
        <FactList
          items={[
            { label: "Subject", value: c.subject },
            { label: "Preview text", value: c.preview_text },
            { label: "From", value: c.from_email ? `${c.from_name ? `${c.from_name} ` : ""}<${c.from_email}>` : "" },
            { label: "Recipients", value: formatNumber(Number(c.recipient_count ?? 0)) },
            { label: c.status === "scheduled" ? "Scheduled for" : "Started", value: when(c.status === "scheduled" ? c.scheduled_at : c.started_at ?? c.scheduled_at, tz) },
            { label: "Finished", value: c.completed_at ? when(c.completed_at, tz) : "" },
          ]}
        />
      </Card>
    </div>
  );
}

/** Delivery, engagement and failures for a campaign that has been sent (or is sending). */
export function CampaignPerformance({
  c, stats, delivery, links, series,
}: {
  c: any; stats: Stats; delivery: Delivery;
  links: { url: string; clicks: number; uniqueClicks: number }[];
  series: { date: string; clicks: number; uniqueClicks: number; opens: number }[];
}) {
  const recipients = Number(c.recipient_count ?? 0) || delivery.total;
  const attempted = Math.max(0, delivery.total - delivery.queued - delivery.skipped);
  const done = delivery.total > 0 ? attempted / delivery.total : 0;
  const failedTotal = stats.failed + stats.bounced;
  const maxLinkClicks = Math.max(1, ...links.map((l) => l.clicks));

  return (
    <>
      {c.status === "sending" || c.status === "scheduled" || delivery.queued > 0 ? (
        <Card className="mb-6 p-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-ink">{c.status === "scheduled" ? "Waiting to send" : "Sending progress"}</span>
            <span className="text-ink-muted">{formatNumber(attempted)} of {formatNumber(delivery.total || recipients)} processed{delivery.queued ? ` · ${formatNumber(delivery.queued)} waiting` : ""}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-accent-100"><div className="h-2 rounded-full bg-brand-700 transition-all" style={{ width: `${Math.round(done * 100)}%` }} /></div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Delivered" value={pct(stats.delivered, stats.sent)} note={`${formatNumber(stats.delivered)} of ${formatNumber(stats.sent)} sent`} status={stats.sent && stats.delivered / stats.sent < 0.9 ? "warn" : undefined} />
        <StatCard label="Opened" value={pct(stats.opens, stats.delivered || stats.sent)} note={`${formatNumber(stats.opens)} people · unreliable, mail apps can hide opens`} />
        <StatCard label="Clicked" value={pct(stats.clicks, stats.delivered || stats.sent)} note={`${formatNumber(stats.clicks)} people · ${formatNumber(stats.totalClicks)} total clicks`} />
        <StatCard label="Failed" value={formatNumber(failedTotal)} note={failedTotal ? `${formatNumber(stats.failed)} not sent · ${formatNumber(stats.bounced)} bounced` : "Nothing failed"} status={failedTotal ? "bad" : undefined} />
        <StatCard label="Bounced" value={pct(stats.bounced, stats.sent)} note={`${formatNumber(stats.bounced)} addresses`} status={stats.sent && stats.bounced / stats.sent > 0.05 ? "bad" : undefined} />
        <StatCard label="Unsubscribed" value={pct(stats.unsubscribes, stats.delivered || stats.sent)} note={`${formatNumber(stats.unsubscribes)} people`} />
        <StatCard label="Complaints" value={pct(stats.complained, stats.sent, 2)} note={`${formatNumber(stats.complained)} marked as spam`} status={stats.complained ? "bad" : undefined} />
        <StatCard label="Recipients" value={formatNumber(recipients)} note={delivery.skipped ? `${formatNumber(delivery.skipped)} skipped (unsubscribed or suppressed)` : "Everyone in the audience"} />
      </div>

      {failedTotal > 0 || delivery.failures.length > 0 ? (
        <Card className="mt-8">
          <CardHeader title="Why emails failed" description="Reasons reported by the mail provider, most common first." />
          <Table>
            <thead><tr><TH>Reason</TH><TH className="w-28">Emails</TH></tr></thead>
            <tbody>
              {delivery.failures.map((f) => (<tr key={f.reason}><TD className="break-words">{f.reason}</TD><TD className="font-semibold text-ink">{formatNumber(f.count)}</TD></tr>))}
              {delivery.failures.length === 0 ? <EmptyRow cols={2} message="The provider didn’t report a reason. Open the Recipients tab and filter by Failed or Bounced." /> : null}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Engagement over time" description="Since this campaign started sending" />
          <div className="p-6">
            <TrendChart
              ariaLabel="Opens, clicks and unique clickers per day for this campaign"
              dates={series.map((d) => d.date)}
              series={[
                { key: "opens", label: "Opens", tone: "ink", values: series.map((d) => d.opens) },
                { key: "clicks", label: "Clicks", tone: "brand", values: series.map((d) => d.clicks), area: true },
                { key: "unique", label: "Unique clickers", tone: "accent", values: series.map((d) => d.uniqueClicks), dashed: true },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Delivery funnel" />
          <Funnel
            stages={[
              { label: "Recipients", value: recipients },
              { label: "Sent", value: stats.sent },
              { label: "Delivered", value: stats.delivered },
              { label: "Opened", value: stats.opens, note: "Mail apps can hide opens, so treat this as a floor" },
              { label: "Clicked", value: stats.clicks, note: "Recipients who clicked at least once" },
            ]}
          />
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader title="Clicks by link" description="Which links people actually clicked." />
        <Table>
          <thead><tr><TH>Link</TH><TH>Share of clicks</TH><TH>Clicks</TH><TH>Unique</TH></tr></thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.url}>
                <TD className="max-w-[360px] break-all">{l.url}</TD>
                <TD className="w-48"><div className="h-2 rounded-full bg-accent-100"><div className="h-2 rounded-full bg-brand-700" style={{ width: `${(l.clicks / maxLinkClicks) * 100}%` }} /></div></TD>
                <TD className="font-semibold text-ink">{formatNumber(l.clicks)}</TD>
                <TD>{formatNumber(l.uniqueClicks)}</TD>
              </tr>
            ))}
            {links.length === 0 ? <EmptyRow cols={4} message="No clicks recorded yet." /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

const FILTER_LABEL: Record<string, string> = { all: "All", delivered: "Delivered", opened: "Opened", clicked: "Clicked", bounced: "Bounced", failed: "Failed", complained: "Complaints", queued: "Waiting" };
const sendTone = (s: string) => (s === "delivered" ? "success" : s === "bounced" || s === "queued" || s === "sending" ? "warning" : s === "failed" || s === "complained" ? "danger" : "neutral") as "success" | "warning" | "danger" | "neutral";

/** One row per recipient: delivery state, failure reason, and whether they opened or clicked. */
export function CampaignRecipients({
  base, tz, rows, total, page, pages, filter, q,
}: { base: string; tz: string; rows: RecipientRow[]; total: number; page: number; pages: number; filter: string; q: string }) {
  const href = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams({ tab: "recipients" });
    const next = { filter: filter === "all" ? undefined : filter, q: q || undefined, page: page > 1 ? page : undefined, ...over };
    for (const [k, v] of Object.entries(next)) if (v !== undefined && v !== "") p.set(k, String(v));
    return `${base}?${p.toString()}`;
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-mist p-4">
        {RECIPIENT_FILTERS.map((f) => (
          <Link key={f} href={href({ filter: f === "all" ? undefined : f, page: undefined })} scroll={false}
            className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", f === filter ? "bg-brand-700 text-white" : "bg-mist-100 text-ink-soft hover:bg-mist")}>
            {FILTER_LABEL[f]}
          </Link>
        ))}
        <form action={base} className="ml-auto flex items-center gap-2">
          <input type="hidden" name="tab" value="recipients" />
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <Input name="q" defaultValue={q} type="search" placeholder="Search by email" aria-label="Search recipients" className="w-56" />
          <Button type="submit" variant="outline" size="sm" aria-label="Search"><Search className="h-4 w-4" aria-hidden="true" /></Button>
        </form>
      </div>
      <Table>
        <thead><tr><TH>Recipient</TH><TH>Status</TH><TH>Opened</TH><TH>Clicks</TH><TH>Sent</TH><TH>Detail</TH></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <TD className="font-semibold text-ink">{r.email}</TD>
              <TD><div className="flex flex-wrap gap-1"><Badge tone={sendTone(r.status)}>{r.status === "queued" || r.status === "sending" ? "Waiting" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Badge>{r.unsubscribed ? <Badge>Unsubscribed</Badge> : null}</div></TD>
              <TD>{r.opened ? <Badge tone="brand">Opened</Badge> : <span className="text-ink-muted">-</span>}</TD>
              <TD>{r.clicked ? <span className="font-semibold text-ink">{r.clicked}</span> : <span className="text-ink-muted">-</span>}</TD>
              <TD className="whitespace-nowrap">{when(r.sentAt, tz)}</TD>
              <TD className="max-w-[320px] break-words text-xs text-ink-muted">{r.error || ""}</TD>
            </tr>
          ))}
          {rows.length === 0 ? <EmptyRow cols={6} message={q || filter !== "all" ? "No recipients match." : "Nobody has been sent this campaign yet."} /> : null}
        </tbody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm text-ink-muted">
        <span>{total ? `${formatNumber((page - 1) * RECIPIENT_PAGE + 1)}–${formatNumber(Math.min(total, page * RECIPIENT_PAGE))} of ${formatNumber(total)}` : "0 recipients"}</span>
        <div className="flex gap-2">
          {page > 1 ? <Link href={href({ page: page - 1 })} scroll={false} className="rounded-full border border-mist px-4 py-1.5 font-semibold text-ink hover:bg-mist-100">Previous</Link> : null}
          {page < pages ? <Link href={href({ page: page + 1 })} scroll={false} className="rounded-full border border-mist px-4 py-1.5 font-semibold text-ink hover:bg-mist-100">Next</Link> : null}
        </div>
      </div>
    </Card>
  );
}
