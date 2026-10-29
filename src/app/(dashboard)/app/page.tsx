import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageToasts, type ToastKind } from "@/components/ui/toast";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { BarList, TrendChart } from "@/components/charts/trend-chart";
import { getOverview } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { formatNumber } from "@/lib/utils";
import type { SearchParams } from "@/types";

export const metadata: Metadata = { title: "Overview" };

const checklistItems = [
  { label: "Verify your account email", href: "/app/settings" },
  { label: "Add your business address", href: "/app/settings" },
  { label: "Verify a sending domain", href: "/app/domains" },
  { label: "Import your contacts", href: "/app/contacts/import" },
  { label: "Send your first campaign", href: "/app/campaigns/new" },
];

export default async function OverviewPage(_props: { searchParams: SearchParams }) {
  const ctx = await getContext();
  const o = await getOverview(ctx!);
  const w = o.workspace;
  const t = o.totals;
  const status = ctx?.workspace?.status;

  const toasts: { id: string; kind: ToastKind; message: string }[] = [];
  if (status === "review") toasts.push({ id: "ws-review", kind: "info", message: "Your account is new, so your first campaign is checked before it sends. This keeps every sender’s reputation healthy." });
  if (status === "suspended") toasts.push({ id: "ws-suspended", kind: "error", message: "Your account is suspended and sending is paused. Contact support to resolve it." });
  if (ctx && !ctx.workspace) toasts.push({ id: "ws-missing", kind: "warning", message: "We couldn’t load your workspace. Refresh the page, or contact support if this continues." });

  return (
    <>
      <PageToasts toasts={toasts} />
      <PageHeader
        title="Overview"
        description="Where your audience and campaigns stand today."
        action={<ButtonLink href="/app/campaigns/new"><Plus className="h-4 w-4" aria-hidden="true" />New campaign</ButtonLink>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clicks (30 days)" value={formatNumber(t.uniqueClicks)} note={`${formatNumber(t.clicks)} total clicks, including repeats`} />
        <StatCard label="Click rate" value={o.avgClickRate} note="Recipients who clicked, out of emails sent" />
        <StatCard label="Emails this month" value={formatNumber(w.sendsUsed)} note={`of ${formatNumber(w.sendsLimit)} included · ${formatNumber(w.dailyLimit)} per day`} progress={w.sendsLimit ? w.sendsUsed / w.sendsLimit : 0} />
        <StatCard label="Contacts" value={formatNumber(w.contactsUsed)} note={`of ${formatNumber(w.contactsLimit)} on the ${w.plan} plan`} progress={w.contactsLimit ? w.contactsUsed / w.contactsLimit : 0} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Clicks over time" description="Last 30 days. Unique clickers count each recipient once." action={<Link href="/app/reports" className="text-sm font-semibold text-brand-800 hover:underline">Full report</Link>} />
          <div className="p-6">
            <TrendChart
              ariaLabel="Clicks and unique clickers per day over the last 30 days"
              dates={o.series.map((d) => d.date)}
              series={[
                { key: "clicks", label: "Clicks", color: "#FF0000", values: o.series.map((d) => d.clicks), area: true },
                { key: "unique", label: "Unique clickers", color: "#0B1233", values: o.series.map((d) => d.uniqueClicks), dashed: true },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Top clicked links" description="Last 30 days" />
          <BarList
            empty="No clicks yet. Links in your campaigns are tracked automatically."
            items={o.links.map((l) => ({ label: l.url.replace(/^https?:\/\//, ""), title: l.url, value: l.clicks, sub: `${formatNumber(l.uniqueClicks)} unique` }))}
          />
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Recent campaigns" action={<Link href="/app/campaigns" className="text-sm font-semibold text-brand-800 hover:underline">View all</Link>} />
          <Table>
            <thead><tr><TH>Campaign</TH><TH>Status</TH><TH>Sent</TH><TH>Clicks</TH><TH>Click rate</TH></tr></thead>
            <tbody>
              {o.recent.map((c) => (
                <tr key={c.id}>
                  <TD className="font-semibold text-ink"><Link href={`/app/campaigns/${c.id}`} className="hover:text-brand-800 hover:underline">{c.name}</Link></TD>
                  <TD><StatusBadge status={c.status} /></TD>
                  <TD>{formatNumber(c.sent)}</TD>
                  <TD>{formatNumber(c.clicks)}</TD>
                  <TD className="font-semibold text-ink">{c.clickRate}</TD>
                </tr>
              ))}
              {o.recent.length === 0 ? <EmptyRow cols={5} message="No campaigns yet. Create your first one to see it here." /> : null}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Get ready to send" description="Finish these to unlock your first campaign." />
          <ul className="divide-y divide-mist">
            {checklistItems.map((item, i) => {
              const done = o.checklist[i];
              return (
                <li key={item.label}>
                  <Link href={item.href} className="flex items-center gap-3 px-6 py-3.5 text-sm hover:bg-mist-50">
                    {done ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" /> : <Circle className="h-5 w-5 text-lavender-300" aria-hidden="true" />}
                    <span className={done ? "text-ink-muted line-through" : "font-semibold text-ink"}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
