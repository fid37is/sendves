import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm";
import { Card, CardHeader } from "@/components/ui/card";
import { PageToasts, type ToastKind } from "@/components/ui/toast";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { Funnel, TrendChart } from "@/components/charts/trend-chart";
import { CampaignEditor } from "@/components/dashboard/campaign-editor";
import { pct } from "@/lib/analytics";
import { getAudienceOptions, getCampaignAudienceDetail, getCampaignDetail, getContactFieldKeys, getDomains, getSenderIdentities } from "@/lib/queries";
import { can } from "@/lib/access";
import { designFromRow } from "@/lib/email/campaign";
import { sanitizeBlocks } from "@/lib/email/sanitize";
import { sanitizeVariables } from "@/lib/email/variables";
import { assetRule, getEmailLogo } from "@/server/email-assets";
import { NoAccess } from "@/components/dashboard/no-access";
import { getContext } from "@/lib/workspace";
import { formatNumber } from "@/lib/utils";
import type { SearchParams } from "@/types";
import {
  cancelCampaignAction, deleteCampaignAction, pauseCampaignAction, resumeCampaignAction,
  autosaveCampaignAction, previewContactsAction, sendTestAction, submitCampaignAction,
} from "../actions";
import { audienceSizeAction, pasteAudienceAction } from "../audience-actions";
import { saveCampaignAsTemplateAction } from "../../templates/actions";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: { id: string }; searchParams: SearchParams }) {
  const ctx = await getContext();
  if (!can(ctx?.access, "campaigns.view")) return <NoAccess title="Campaign" what="campaigns" />;
  const access = ctx!.access!;
  const detail = await getCampaignDetail(ctx!, params.id);
  if (!detail || !ctx?.workspace) notFound();
  const { campaign: c, stats, links, series } = detail;

  if (c.status === "draft") {
    if (!can(access, "campaigns.manage")) {
      return (
        <>
          <PageHeader title={c.name} description="Draft" />
          <Card><p className="p-6 text-sm text-ink-soft">This campaign is still a draft. Your role can view it but not edit it.</p></Card>
        </>
      );
    }
    const [domains, audienceOptions, audience, senders, contactFieldKeys, logo] = await Promise.all([
      getDomains(ctx!), getAudienceOptions(ctx!), getCampaignAudienceDetail(ctx!, c.id), getSenderIdentities(ctx!, ctx!.user.id, c.sender_identity_id), getContactFieldKeys(ctx!),
      getEmailLogo(ctx!.db!, ctx!.workspace!.id),
    ]);
    const toasts: { id: string; kind: ToastKind; message: string }[] = [];
    if (!domains.some((d) => d.ready)) toasts.push({ id: "no-domain", kind: "warning", message: "No sending domain is ready yet. DKIM, SPF and DMARC must pass under Sending domains before you can send." });
    else if (senders.length === 0) toasts.push({ id: "no-sender", kind: "warning", message: "You don’t have a work email yet. Set one under Team (the owner can do this for you), then choose it as the sender." });
    return (
      <>
        <PageToasts toasts={toasts} />
        <CampaignEditor
          campaign={{
            id: c.id, name: c.name, subject: c.subject, preheader: c.preview_text,
            senderId: c.sender_identity_id ?? "",
            design: designFromRow(c.design, sanitizeBlocks(c.blocks), assetRule(ctx!.workspace!.id)),
            variables: sanitizeVariables(c.variables),
            audience: { mode: audience.mode, listIds: audience.listIds, contacts: audience.contacts },
          }}
          logo={logo}
          senders={senders}
          lists={audienceOptions.lists}
          totalSubscribed={audienceOptions.totalSubscribed}
          contactFieldKeys={contactFieldKeys}
          workspace={{ name: ctx!.workspace!.name, business_address: ctx!.workspace!.business_address, timezone: ctx!.workspace!.timezone || "UTC" }}
          canSend={can(access, "campaigns.send")}
          canAddContacts={can(access, "contacts.manage")}
          canSaveTemplate={can(access, "templates.manage")}
          actions={{ autosave: autosaveCampaignAction, test: sendTestAction, submit: submitCampaignAction, previewContacts: previewContactsAction, audienceSize: audienceSizeAction, pasteAudience: pasteAudienceAction, saveTemplate: saveCampaignAsTemplateAction }}
        />
      </>
    );
  }

  const mayControl = can(access, "campaigns.send");
  const canPause = mayControl && c.status === "sending";
  const canResume = mayControl && c.status === "paused";
  const canCancel = mayControl && ["scheduled", "sending", "paused"].includes(c.status);

  const toasts: { id: string; kind: ToastKind; message: string }[] = [];
  if (c.review_status === "pending") toasts.push({ id: `review-${c.id}`, kind: "info", message: "This campaign is waiting for review. New accounts have their first campaign checked before it sends." });
  if (c.review_status === "rejected") toasts.push({ id: `rejected-${c.id}`, kind: "error", message: "This campaign was not approved. Contact support if you think this is a mistake." });
  if (c.status === "paused") toasts.push({ id: `paused-${c.id}`, kind: "warning", message: c.pause_reason ? `Sending is paused: ${c.pause_reason}` : "Sending is paused. If this was automatic, a high bounce or complaint rate triggered it." });

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
            {canCancel ? (
              <ConfirmSubmitButton
                action={cancelCampaignAction}
                fields={{ id: c.id }}
                variant="danger"
                size="sm"
                confirm={{
                  title: "Cancel this campaign?",
                  description: "Sending stops and anything not yet sent is skipped. Emails already delivered can’t be recalled, and this can’t be undone.",
                  confirmLabel: "Cancel campaign",
                  cancelLabel: "Keep campaign",
                  tone: "danger",
                }}
              >
                Cancel
              </ConfirmSubmitButton>
            ) : null}
            {c.status === "cancelled" && can(access, "campaigns.manage") ? (
              <ConfirmSubmitButton
                action={deleteCampaignAction}
                fields={{ id: c.id }}
                variant="outline"
                size="sm"
                confirm={{
                  title: "Delete this campaign?",
                  description: "The campaign and its results are removed. This can’t be undone.",
                  confirmLabel: "Delete campaign",
                  tone: "danger",
                }}
              >
                Delete
              </ConfirmSubmitButton>
            ) : null}
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