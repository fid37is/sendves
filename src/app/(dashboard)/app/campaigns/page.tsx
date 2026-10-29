import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SearchParams } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { getCampaigns } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  const campaigns = await getCampaigns(ctx!);
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Create, schedule and review every email you send."
        action={<ButtonLink href="/app/campaigns/new"><Plus className="h-4 w-4" aria-hidden="true" />New campaign</ButtonLink>}
      />
      <Card>
        <Table>
          <thead><tr><TH>Campaign</TH><TH>Audience</TH><TH>Status</TH><TH>Sent</TH><TH>Clicks</TH><TH>Click rate</TH><TH>Date</TH></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <TD><Link href={`/app/campaigns/${c.id}`} className="font-semibold text-ink hover:text-brand-800 hover:underline">{c.name}</Link><p className="text-xs text-ink-muted">{c.subject}</p></TD>
                <TD>{c.audience}</TD>
                <TD><StatusBadge status={c.status} />{c.reviewStatus === "pending" ? <span className="ml-2 text-xs text-warning">In review</span> : null}</TD>
                <TD>{formatNumber(c.sent)}</TD>
                <TD>{formatNumber(c.clicks)}</TD>
                <TD className="font-semibold text-ink">{c.clickRate}</TD>
                <TD>{c.date}</TD>
              </tr>
            ))}
            {campaigns.length === 0 ? <EmptyRow cols={7} message="No campaigns yet. Select New campaign to create one." /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
