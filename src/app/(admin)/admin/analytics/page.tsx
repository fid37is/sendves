import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { BarList, RangeTabs, TrendChart } from "@/components/charts/trend-chart";
import { parseRange, pct, ratio, sumDays } from "@/lib/analytics";
import { getAdminAnalytics, getPlatformSettings } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";
import type { SearchParams } from "@/types";

export const metadata: Metadata = { title: "Analytics" };

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseRange(searchParams.range);
  const [{ series, topWorkspaces }, settings] = await Promise.all([getAdminAnalytics(days), getPlatformSettings()]);
  const t = sumDays(series);
  const byComplaint = [...topWorkspaces].filter((w) => w.sent >= 50).sort((a, b) => (ratio(b.complaints, b.sent) ?? 0) - (ratio(a.complaints, a.sent) ?? 0)).slice(0, 6);
  const byClicks = [...topWorkspaces].filter((w) => w.sent > 0).sort((a, b) => (ratio(b.clicks, b.sent) ?? 0) - (ratio(a.clicks, a.sent) ?? 0)).slice(0, 6);
  const recent = [...series].reverse().slice(0, 14);

  return (
    <>
      <PageHeader title="Analytics" description="Deliverability and engagement across the platform." action={<RangeTabs basePath="/analytics" current={days} />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Sent" value={formatNumber(t.sent)} />
        <StatCard label="Delivered" value={pct(t.delivered, t.sent)} />
        <StatCard label="Click rate" value={pct(t.uniqueClicks, t.sent)} note={`${formatNumber(t.clicks)} total clicks`} />
        <StatCard label="Bounce rate" value={pct(t.bounced, t.sent)} note={`Pause at ${settings.pause_bounce_pct}%`} />
        <StatCard label="Complaint rate" value={pct(t.complaints, t.sent, 2)} note={`Pause at ${settings.pause_complaint_pct}%`} />
      </div>

      <Card className="mt-8">
        <CardHeader title="Daily activity" description={`Last ${days} days`} />
        <div className="p-6">
          <TrendChart
            height={300}
            ariaLabel={`Platform activity per day over the last ${days} days`}
            dates={series.map((d) => d.date)}
            series={[
              { key: "sent", label: "Sent", color: "#0B1233", values: series.map((d) => d.sent), area: true },
              { key: "clicks", label: "Clicks", color: "#FF0000", values: series.map((d) => d.clicks) },
              { key: "unsubs", label: "Unsubscribes", color: "#8B6FB8", values: series.map((d) => d.unsubscribes), dashed: true },
            ]}
          />
        </div>
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Highest complaint rates" description="Workspaces with at least 50 sends. Review these first." />
          <BarList barClass="bg-danger" format={(v) => `${v.toFixed(2)}%`} empty="No workspace has enough volume to rank yet." items={byComplaint.map((w) => ({ label: w.name, value: ratio(w.complaints, w.sent) ?? 0, sub: `${formatNumber(w.complaints)} complaints in ${formatNumber(w.sent)} sends` }))} />
        </Card>
        <Card>
          <CardHeader title="Best click rates" description="Who is getting real engagement" />
          <BarList format={(v) => `${v.toFixed(1)}%`} empty="No sending in this period." items={byClicks.map((w) => ({ label: w.name, value: ratio(w.clicks, w.sent) ?? 0, sub: `${formatNumber(w.clicks)} clickers from ${formatNumber(w.sent)} sends` }))} />
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader title="Senders by volume" description={`Last ${days} days, top 25`} />
        <Table>
          <thead><tr><TH>Workspace</TH><TH>Status</TH><TH>Sent</TH><TH>Clickers</TH><TH>Click rate</TH><TH>Bounce</TH><TH>Complaints</TH></tr></thead>
          <tbody>
            {topWorkspaces.map((w) => (
              <tr key={w.id}>
                <TD><p className="font-semibold text-ink">{w.name}</p><p className="text-xs capitalize text-ink-muted">{w.plan}</p></TD>
                <TD><StatusBadge status={w.status} /></TD>
                <TD>{formatNumber(w.sent)}</TD>
                <TD>{formatNumber(w.clicks)}</TD>
                <TD>{pct(w.clicks, w.sent)}</TD>
                <TD>{pct(w.bounced, w.sent)}</TD>
                <TD>{pct(w.complaints, w.sent, 2)}</TD>
              </tr>
            ))}
            {topWorkspaces.length === 0 ? <EmptyRow cols={7} message="No sending in this period." /> : null}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-8">
        <CardHeader title="Last 14 days, day by day" />
        <Table>
          <thead><tr><TH>Date</TH><TH>Sent</TH><TH>Delivered</TH><TH>Clicks</TH><TH>Unique</TH><TH>Bounced</TH><TH>Complaints</TH><TH>Unsubs</TH></tr></thead>
          <tbody>
            {recent.map((d) => (
              <tr key={d.date}>
                <TD className="font-semibold text-ink">{d.date}</TD>
                <TD>{formatNumber(d.sent)}</TD><TD>{formatNumber(d.delivered)}</TD><TD>{formatNumber(d.clicks)}</TD>
                <TD>{formatNumber(d.uniqueClicks)}</TD><TD>{formatNumber(d.bounced)}</TD><TD>{formatNumber(d.complaints)}</TD><TD>{formatNumber(d.unsubscribes)}</TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
