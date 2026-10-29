import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { BarList, Funnel, RangeTabs, TrendChart } from "@/components/charts/trend-chart";
import { parseRange, pct } from "@/lib/analytics";
import { getReports } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { formatNumber } from "@/lib/utils";
import type { SearchParams } from "@/types";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseRange(searchParams.range);
  const ctx = await getContext();
  const { totals: t, series, links, campaigns } = await getReports(ctx!, days);
  const ranked = [...campaigns].filter((c) => c.clickRateValue !== null).sort((a, b) => (b.clickRateValue ?? 0) - (a.clickRateValue ?? 0)).slice(0, 6);

  return (
    <>
      <PageHeader
        title="Reports"
        description="How your campaigns performed. Clicks are the most reliable engagement signal."
        action={<RangeTabs basePath="/app/reports" current={days} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unique clicks" value={formatNumber(t.uniqueClicks)} note={`${formatNumber(t.clicks)} total clicks`} />
        <StatCard label="Click rate" value={pct(t.uniqueClicks, t.sent)} note="Unique clickers ÷ emails sent" />
        <StatCard label="Click-to-delivered" value={pct(t.uniqueClicks, t.delivered)} note="Unique clickers ÷ delivered" />
        <StatCard label="Emails sent" value={formatNumber(t.sent)} note={`${pct(t.delivered, t.sent)} delivered`} />
        <StatCard label="Bounced" value={pct(t.bounced, t.sent)} note={`${formatNumber(t.bounced)} emails`} />
        <StatCard label="Unsubscribed" value={pct(t.unsubscribes, t.sent)} note={`${formatNumber(t.unsubscribes)} people`} />
        <StatCard label="Complaints" value={pct(t.complaints, t.sent, 2)} note="Keep this under 0.1%" />
        <StatCard label="Opened" value={pct(t.opens, t.sent)} note="Unreliable: mail apps can hide opens" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Clicks over time" description={`Last ${days} days`} />
          <div className="p-6">
            <TrendChart
              ariaLabel={`Clicks and unique clickers per day over the last ${days} days`}
              dates={series.map((d) => d.date)}
              series={[
                { key: "clicks", label: "Clicks", color: "#FF0000", values: series.map((d) => d.clicks), area: true },
                { key: "unique", label: "Unique clickers", color: "#0B1233", values: series.map((d) => d.uniqueClicks), dashed: true },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Engagement funnel" description={`Last ${days} days`} />
          <Funnel
            stages={[
              { label: "Sent", value: t.sent },
              { label: "Delivered", value: t.delivered },
              { label: "Clicked", value: t.uniqueClicks, note: "Recipients who clicked at least once" },
            ]}
          />
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Emails sent per day" description="Volume and deliveries" />
          <div className="p-6">
            <TrendChart
              height={220}
              ariaLabel={`Emails sent and delivered per day over the last ${days} days`}
              dates={series.map((d) => d.date)}
              series={[
                { key: "sent", label: "Sent", color: "#0B1233", values: series.map((d) => d.sent), area: true },
                { key: "delivered", label: "Delivered", color: "#8B6FB8", values: series.map((d) => d.delivered) },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Top clicked links" description={`Last ${days} days, across all campaigns`} />
          <BarList
            empty="No clicks recorded in this period."
            items={links.map((l) => ({ label: l.url.replace(/^https?:\/\//, ""), title: l.url, value: l.clicks, sub: `${formatNumber(l.uniqueClicks)} unique` }))}
          />
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader title="Best by click rate" description="Sent campaigns, all time" />
          <BarList
            barClass="bg-navy"
            format={(v) => `${v.toFixed(1)}%`}
            empty="Your best campaigns appear here after your first send."
            items={ranked.map((c) => ({ label: c.name, value: c.clickRateValue ?? 0, href: `/app/campaigns/${c.id}`, sub: `${formatNumber(c.sent)} sent · ${formatNumber(c.clicks)} clicked` }))}
          />
        </Card>
        <Card>
          <CardHeader title="Sent campaigns" description="Select a campaign for per-link clicks." />
          <Table>
            <thead><tr><TH>Campaign</TH><TH>Sent</TH><TH>Clicks</TH><TH>Click rate</TH><TH>Bounced</TH><TH>Date</TH></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <TD><Link href={`/app/campaigns/${c.id}`} className="font-semibold text-ink hover:text-brand-800 hover:underline">{c.name}</Link></TD>
                  <TD>{formatNumber(c.sent)}</TD>
                  <TD>{formatNumber(c.clicks)}{c.totalClicks > c.clicks ? <span className="text-xs text-ink-muted"> ({formatNumber(c.totalClicks)} total)</span> : null}</TD>
                  <TD className="font-semibold text-ink">{c.clickRate}</TD>
                  <TD>{pct(c.bounced, c.sent)}</TD>
                  <TD>{c.date}</TD>
                </tr>
              ))}
              {campaigns.length === 0 ? <EmptyRow cols={6} message="No sent campaigns yet. Reports appear after your first send." /> : null}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
