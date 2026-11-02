import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageToasts, type ToastKind } from "@/components/ui/toast";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { BarList, RangeTabs, TrendChart } from "@/components/charts/trend-chart";
import { delta, parseRange, pct, ratio } from "@/lib/analytics";
import { getAdminOverview } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";
import type { SearchParams } from "@/types";

export const metadata: Metadata = { title: "Platform overview" };

/** Colours a rate against its enforcement threshold: bad at/above it, warn from 60% of it. */
function health(value: number | null, threshold: number): "good" | "warn" | "bad" | undefined {
  if (value === null) return undefined;
  return value >= threshold ? "bad" : value >= threshold * 0.6 ? "warn" : "good";
}

export default async function AdminOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseRange(searchParams.range);
  const o = await getAdminOverview(days);
  const s = o.summary;

  const bounceRate = ratio(s.bounced, s.sent);
  const complaintRate = ratio(s.complaints, s.sent);
  // One toast for everything waiting on an admin, instead of several stacked cards.
  const toasts: { id: string; kind: ToastKind; message: string }[] = [];
  const waiting = [
    o.alert ? `Open abuse case: ${o.alert}.` : "",
    s.pendingReview > 0 ? `${s.pendingReview} campaign${s.pendingReview === 1 ? " is" : "s are"} waiting for review.` : "",
  ].filter(Boolean);
  if (waiting.length) toasts.push({ id: `attention-${o.alert}-${s.pendingReview}`, kind: o.alert ? "warning" : "info", message: waiting.join(" ") });

  const plans = Object.entries(s.plans).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageToasts toasts={toasts} />
      <PageHeader
        title="Platform overview"
        description={`Health of sending across every workspace. Changes compare with the previous ${days} days.`}
        action={<RangeTabs basePath="/" current={days} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Workspaces" value={formatNumber(s.workspaces)} delta={delta(s.newWorkspaces, s.newWorkspacesPrev)} note={`+${formatNumber(s.newWorkspaces)} new · ${formatNumber(s.paidWorkspaces)} paid`} />
        <StatCard label="Active senders" value={formatNumber(s.activeSenders)} note={`${formatNumber(s.users)} users · ${formatNumber(s.contacts)} contacts`} />
        <StatCard label={`Emails sent (${days}d)`} value={formatNumber(s.sent)} delta={delta(s.sent, s.sentPrev)} note={`${pct(s.delivered, s.sent)} delivered`} />
        <StatCard label="Click rate" value={pct(s.clicks, s.sent)} delta={delta(s.clicks, s.clicksPrev)} note={`${formatNumber(s.clicks)} unique · ${formatNumber(s.totalClicks)} total clicks`} />
        <StatCard label="Bounce rate" value={pct(s.bounced, s.sent)} delta={delta(s.bounced, s.bouncedPrev)} higherIsBetter={false} status={health(bounceRate, o.settings.pause_bounce_pct)} note={`Campaigns pause at ${o.settings.pause_bounce_pct}%`} />
        <StatCard label="Complaint rate" value={pct(s.complaints, s.sent, 2)} delta={delta(s.complaints, s.complaintsPrev)} higherIsBetter={false} status={health(complaintRate, o.settings.pause_complaint_pct)} note={`Pause at ${o.settings.pause_complaint_pct}% · suspend at ${o.settings.suspend_complaint_pct}%`} />
        <StatCard label="Unsubscribe rate" value={pct(s.unsubscribes, s.sent, 2)} note={`${formatNumber(s.unsubscribes)} people`} />
        <StatCard label="Delivery queue" value={formatNumber(s.queued)} status={s.failed > 0 ? "warn" : undefined} note={`${formatNumber(s.failed)} failed in period`} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Send volume" description={`Last ${days} days, all workspaces`} />
          <div className="p-6">
            <TrendChart
              ariaLabel={`Emails sent and delivered per day over the last ${days} days`}
              dates={o.series.map((d) => d.date)}
              series={[
                { key: "sent", label: "Sent", tone: "ink", values: o.series.map((d) => d.sent), area: true },
                { key: "delivered", label: "Delivered", tone: "accent", values: o.series.map((d) => d.delivered) },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Engagement and risk" description="Clicks against bounces and complaints" />
          <div className="p-6">
            <TrendChart
              ariaLabel={`Clicks, bounces and complaints per day over the last ${days} days`}
              dates={o.series.map((d) => d.date)}
              series={[
                { key: "clicks", label: "Clicks", tone: "brand", values: o.series.map((d) => d.clicks), area: true },
                { key: "bounced", label: "Bounces", tone: "warning", values: o.series.map((d) => d.bounced) },
                { key: "complaints", label: "Complaints", tone: "danger", values: o.series.map((d) => d.complaints), dashed: true },
              ]}
            />
          </div>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Top senders" description={`By volume, last ${days} days`} action={<Link href="/analytics" className="text-sm font-semibold text-brand-800 hover:underline">Full analytics</Link>} />
          <Table>
            <thead><tr><TH>Workspace</TH><TH>Sent</TH><TH>Click rate</TH><TH>Bounce</TH><TH>Complaints</TH></tr></thead>
            <tbody>
              {o.topWorkspaces.map((w) => (
                <tr key={w.id}>
                  <TD><p className="font-semibold text-ink">{w.name}</p><p className="text-xs capitalize text-ink-muted">{w.plan}</p></TD>
                  <TD>{formatNumber(w.sent)}</TD>
                  <TD>{pct(w.clicks, w.sent)}</TD>
                  <TD className={health(ratio(w.bounced, w.sent), o.settings.pause_bounce_pct) === "bad" ? "font-semibold text-danger" : ""}>{pct(w.bounced, w.sent)}</TD>
                  <TD className={health(ratio(w.complaints, w.sent), o.settings.pause_complaint_pct) === "bad" ? "font-semibold text-danger" : ""}>{pct(w.complaints, w.sent, 2)}</TD>
                </tr>
              ))}
              {o.topWorkspaces.length === 0 ? <EmptyRow cols={5} message="No sending in this period." /> : null}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Plan mix" description="Workspaces by plan" />
          <BarList empty="No workspaces yet." barClass="bg-brand-600" items={plans.map(([plan, count]) => ({ label: plan.charAt(0).toUpperCase() + plan.slice(1), value: count, sub: `${((count / Math.max(s.workspaces, 1)) * 100).toFixed(0)}% of workspaces` }))} />
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Waiting for review" action={<Link href="/review" className="text-sm font-semibold text-brand-800 hover:underline">Open queue</Link>} />
          <ul className="divide-y divide-mist">
            {o.queue.map((r) => (
              <li key={r.id} className="px-6 py-4 text-sm">
                <Link href={`/review/${r.id}`} className="font-semibold text-ink hover:text-brand-800 hover:underline">{r.workspace}: {r.campaign}</Link>
                <p className="text-ink-muted">{formatNumber(r.recipients)} recipients, submitted {r.submitted}</p>
              </li>
            ))}
            {o.queue.length === 0 ? <li className="px-6 py-4 text-sm text-ink-muted">Nothing is waiting for review.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Workspaces needing attention" description={`${s.suspended} suspended · ${s.openAbuse} open abuse cases`} action={<Link href="/abuse" className="text-sm font-semibold text-brand-800 hover:underline">Abuse reports</Link>} />
          <Table>
            <thead><tr><TH>Workspace</TH><TH>Plan</TH><TH>Status</TH></tr></thead>
            <tbody>
              {o.attention.map((w) => (
                <tr key={w.id}><TD className="font-semibold text-ink">{w.name}</TD><TD><Badge>{w.plan}</Badge></TD><TD><StatusBadge status={w.status} /></TD></tr>
              ))}
              {o.attention.length === 0 ? <EmptyRow cols={3} message="No workspaces need attention." /> : null}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
