import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageToasts, type ToastKind } from "@/components/ui/toast";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { Funnel, TrendChart } from "@/components/charts/trend-chart";
import { CampaignEditor } from "@/components/dashboard/campaign-editor";
import { pct } from "@/lib/analytics";
import { getCampaignDetail, getDomains, getLists } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { formatNumber } from "@/lib/utils";
import type { SearchParams } from "@/types";
import {
  cancelCampaignAction, deleteCampaignAction, pauseCampaignAction, resumeCampaignAction,
  saveCampaignAction, sendTestAction, submitCampaignAction,
} from "../actions";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: { id: string }; searchParams: SearchParams }) {
  const ctx = await getContext();
  const detail = await getCampaignDetail(ctx!, params.id);
  if (!detail || !ctx?.workspace) notFound();
  const { campaign: c, stats, links, series } = detail;

  if (c.status === "draft") {
    const [domains, lists] = await Promise.all([getDomains(ctx), getLists(ctx)]);
    const toasts: { id: string; kind: ToastKind; message: string }[] = [];
    if (domains.length === 0) toasts.push({ id: "no-domain", kind: "warning", message: "You haven’t added a sending domain yet. Add and verify one under Sending domains before you send." });
    return (
      <>
        <PageToasts toasts={toasts} />
        <PageHeader title={c.name} description="Draft. Nothing is sent until you select Send or Schedule." />
        <CampaignEditor
          campaign={{ id: c.id, name: c.name, subject: c.subject, preview_text: c.preview_text, from_name: c.from_name, from_email: c.from_email, list_id: c.list_id, blocks: c.blocks ?? [] }}
          domains={domains.map((d) => ({ id: d.id, domain: d.domain, status: d.status }))}
          lists={lists.map((l) => ({ id: l.id, name: l.name }))}
          workspace={{ name: ctx.workspace.name, business_address: ctx.workspace.business_address }}
          actions={{ save: saveCampaignAction, test: sendTestAction, submit: submitCampaignAction, remove: deleteCampaignAction }}
        />
      </>
    );
  }

  const canPause = c.status === "sending";
  const canResume = c.status === "paused";
  const canCancel = ["scheduled", "sending", "paused"].includes(c.status);

  const toasts: { id: string; kind: ToastKind; message: string }[] = [];
  if (c.review_status === "pending") toasts.push({ id: `review-${c.id}`, kind: "info", message: "This campaign is waiting for review. New accounts have their first campaign checked before it sends." });
  if (c.review_status === "rejected") toasts.push({ id: `rejected-${c.id}`, kind: "error", message: "This campaign was not approved. Contact support if you think this is a mistake." });
  if (c.status === "paused") toasts.push({ id: `paused-${c.id}`, kind: "warning", message: "Sending is paused. If this was automatic, a high bounce or complaint rate triggered it." });

  const maxLinkClicks = Math.max(1, ...links.map((l) => l.clicks));

  return (
    <>
      <PageToasts toasts={toasts} />
      <PageHeader
        title={c.name}
        description={c.subject}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={c.status} />
            {canPause ? <form action={pauseCampaignAction}><input type="hidden" name="id" value={c.id} /><Button type="submit" variant="outline" size="sm">Pause</Button></form> : null}
            {canResume ? <form action={resumeCampaignAction}><input type="hidden" name="id" value={c.id} /><Button type="submit" size="sm">Resume</Button></form> : null}
            {canCancel ? <form action={cancelCampaignAction}><input type="hidden" name="id" value={c.id} /><Button type="submit" variant="danger" size="sm">Cancel</Button></form> : null}
            {c.status === "cancelled" ? <form action={deleteCampaignAction}><input type="hidden" name="id" value={c.id} /><Button type="submit" variant="outline" size="sm">Delete</Button></form> : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clicked" value={pct(stats.clicks, stats.sent)} note={`${formatNumber(stats.clicks)} people · ${formatNumber(stats.totalClicks)} total clicks`} />
        <StatCard label="Click-to-delivered" value={pct(stats.clicks, stats.delivered)} note="Unique clickers ÷ delivered" />
        <StatCard label="Sent" value={formatNumber(stats.sent)} note={stats.failed ? `${stats.failed} failed · ${formatNumber(c.recipient_count)} recipients` : `${formatNumber(c.recipient_count)} recipients`} />
        <StatCard label="Delivered" value={pct(stats.delivered, stats.sent)} />
        <StatCard label="Opened" value={pct(stats.opens, stats.sent)} note="Unreliable: mail apps can hide opens" />
        <StatCard label="Bounced" value={pct(stats.bounced, stats.sent)} />
        <StatCard label="Unsubscribed" value={pct(stats.unsubscribes, stats.sent)} />
        <StatCard label="Complaints" value={pct(stats.complained, stats.sent, 2)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Clicks over time" description="Since this campaign started sending" />
          <div className="p-6">
            <TrendChart
              ariaLabel="Clicks and unique clickers per day for this campaign"
              dates={series.map((d) => d.date)}
              series={[
                { key: "clicks", label: "Clicks", tone: "brand", values: series.map((d) => d.clicks), area: true },
                { key: "unique", label: "Unique clickers", tone: "accent", values: series.map((d) => d.uniqueClicks), dashed: true },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Engagement funnel" />
          <Funnel
            stages={[
              { label: "Sent", value: stats.sent },
              { label: "Delivered", value: stats.delivered },
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
