import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm";
import { Card } from "@/components/ui/card";
import { PageToasts, type ToastKind } from "@/components/ui/toast";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { LinkTabs } from "@/components/ui/tabs";
import { CampaignContent, CampaignPerformance, CampaignRecipients } from "@/components/dashboard/campaign-report";
import { CampaignEditor } from "@/components/dashboard/campaign-editor";
import { getAudienceOptions, getCampaignAudienceDetail, getCampaignDelivery, getCampaignDetail, getCampaignRecipients, getContactFieldKeys, getDomains, getSenderIdentities } from "@/lib/queries";
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

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage({ params, searchParams }: { params: { id: string }; searchParams: SearchParams }) {
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
    if (!domains.some((d) => d.ready)) toasts.push({ id: "no-domain", kind: "warning", message: "No sending domain is ready yet. DKIM, SPF and DMARC must pass under Sending domains first." });
    else if (senders.length === 0) toasts.push({ id: "no-sender", kind: "warning", message: "You don’t have a work email yet. Set one under Team, then choose it as the sender." });
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
          actions={{ autosave: autosaveCampaignAction, test: sendTestAction, submit: submitCampaignAction, previewContacts: previewContactsAction, audienceSize: audienceSizeAction, pasteAudience: pasteAudienceAction }}
        />
      </>
    );
  }

  const mayControl = can(access, "campaigns.send");
  const canPause = mayControl && c.status === "sending";
  const canResume = mayControl && c.status === "paused";
  const canCancel = mayControl && ["scheduled", "sending", "paused"].includes(c.status);
  const tz = ctx!.workspace!.timezone || "UTC";
  const base = `/app/campaigns/${c.id}`;
  const tab = ["performance", "email", "recipients"].includes(searchParams.tab ?? "") ? (searchParams.tab as string) : "performance";

  // One toast per page, as one clear sentence, instead of several stacked cards.
  const toasts: { id: string; kind: ToastKind; message: string }[] = [];
  if (c.review_status === "rejected") toasts.push({ id: `rejected-${c.id}`, kind: "error", message: "This campaign wasn’t approved and was not sent. Contact support if this is a mistake." });
  else if (c.status === "paused") toasts.push({ id: `paused-${c.id}`, kind: "warning", message: c.pause_reason ? `Sending is paused: ${c.pause_reason}` : "Sending is paused. A high bounce or complaint rate may have triggered it." });
  else if (c.review_status === "pending") toasts.push({ id: `review-${c.id}`, kind: "info", message: "Waiting for review. New accounts have their first campaign checked before it sends." });

  const [delivery, recipients] = await Promise.all([
    getCampaignDelivery(ctx!, c.id),
    tab === "recipients"
      ? getCampaignRecipients(ctx!, c.id, { filter: searchParams.filter, q: searchParams.q, page: Number(searchParams.page) || 1 })
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageToasts toasts={toasts} />
      <PageHeader
        title={c.name}
        description={c.subject}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={c.status} />
            {canPause ? <form action={pauseCampaignAction}><input type="hidden" name="id" value={c.id} /><ActionButton variant="outline" size="sm">Pause</ActionButton></form> : null}
            {canResume ? <form action={resumeCampaignAction}><input type="hidden" name="id" value={c.id} /><ActionButton size="sm">Resume</ActionButton></form> : null}
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

      <LinkTabs
        active={tab}
        tabs={[
          { key: "performance", label: "Performance", href: base },
          { key: "email", label: "Email", href: `${base}?tab=email` },
          { key: "recipients", label: "Recipients", href: `${base}?tab=recipients`, count: formatNumber(Number(c.recipient_count ?? 0) || delivery.total) },
        ]}
      />

      {tab === "email" ? (
        <CampaignContent c={c} tz={tz} />
      ) : tab === "recipients" && recipients ? (
        <CampaignRecipients base={base} tz={tz} {...recipients} filter={searchParams.filter ?? "all"} q={searchParams.q ?? ""} />
      ) : (
        <CampaignPerformance c={c} stats={stats} delivery={delivery} links={links} series={series} />
      )}
    </>
  );
}
