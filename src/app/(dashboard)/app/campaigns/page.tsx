import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmIconButton } from "@/components/ui/confirm";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { getCampaigns } from "@/lib/queries";
import { deleteCampaignAction } from "./actions";
import { getContext } from "@/lib/workspace";
import { can } from "@/lib/access";
import { NoAccess } from "@/components/dashboard/no-access";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const ctx = await getContext();
  if (!can(ctx?.access, "campaigns.view")) return <NoAccess title="Campaigns" what="campaigns" />;
  const manage = can(ctx?.access, "campaigns.manage");
  const campaigns = await getCampaigns(ctx!);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Create, schedule and review your email campaigns."
        action={
          manage ? (
            <ButtonLink href="/app/campaigns/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New campaign
            </ButtonLink>
          ) : undefined
        }
      />
      <Card>
        <Table>
          <thead>
            <tr><TH>Campaign</TH><TH>Status</TH><TH>Audience</TH><TH>Sent</TH><TH>Click rate</TH><TH>Date</TH><TH className="w-14"><span className="sr-only">Actions</span></TH></tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <TD className="font-semibold text-ink">
                  <Link href={`/app/campaigns/${c.id}`} className="hover:text-brand-800 hover:underline">{c.name}</Link>
                  <span className="block text-xs font-normal text-ink-muted">{c.subject}</span>
                </TD>
                <TD><StatusBadge status={c.status} /></TD>
                <TD>{c.audience}</TD>
                <TD>{formatNumber(c.sent)}</TD>
                <TD>{c.clickRate}</TD>
                <TD>{c.date}</TD>
                <TD className="text-right">
                  {/* Only drafts and cancelled campaigns can be deleted; anything that has sent keeps its results. */}
                  {manage && (c.status === "draft" || c.status === "cancelled") ? (
                    <ConfirmIconButton
                      label={`Delete ${c.name}`}
                      action={deleteCampaignAction}
                      fields={{ id: c.id }}
                      confirm={{
                        title: `Delete “${c.name}”?`,
                        description: c.status === "draft" ? "The draft and everything you’ve written in it are removed. This can’t be undone." : "The campaign and its results are removed. This can’t be undone.",
                        confirmLabel: c.status === "draft" ? "Delete draft" : "Delete campaign",
                        tone: "danger",
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </ConfirmIconButton>
                  ) : null}
                </TD>
              </tr>
            ))}
            {campaigns.length === 0 ? <EmptyRow cols={7} message="No campaigns yet. Create your first one to see it here." /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}