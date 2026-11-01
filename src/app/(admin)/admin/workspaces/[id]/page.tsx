import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/ui/confirm";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/submit-button";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { FactList, LinkTabs } from "@/components/ui/tabs";
import { PageToasts, type ToastKind } from "@/components/ui/toast";
import { TrendChart } from "@/components/charts/trend-chart";
import { plans } from "@/config/plans";
import { pct, ratio } from "@/lib/analytics";
import { getAdminWorkspaceDetail, getPlatformSettings } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";
import type { SearchParams } from "@/types";
import { setWorkspaceStatusAction, updateWorkspaceLimitsAction } from "../../actions";

export const metadata: Metadata = { title: "Workspace" };

const TABS = ["overview", "people", "campaigns", "sending", "activity", "limits"] as const;

/** Colours a rate against its enforcement threshold: bad at/above it, warn from 60% of it. */
function health(value: number | null, threshold: number): "good" | "warn" | "bad" | undefined {
  if (value === null) return undefined;
  return value >= threshold ? "bad" : value >= threshold * 0.6 ? "warn" : "good";
}

export default async function AdminWorkspacePage({ params, searchParams }: { params: { id: string }; searchParams: SearchParams }) {
  const [w, settings] = await Promise.all([getAdminWorkspaceDetail(params.id), getPlatformSettings()]);
  if (!w) notFound();
  const base = `/workspaces/${w.id}`;
  const tab = (TABS as readonly string[]).includes(searchParams.tab ?? "") ? (searchParams.tab as string) : "overview";
  const planName = plans.find((p) => p.id === w.plan)?.name ?? w.plan;
  const a = w.activity;
  const openAbuse = w.abuse.filter((r) => r.status === "open").length;
  const pendingCampaigns = w.campaigns.filter((c) => c.review === "pending").length;

  // One toast for everything that needs attention, with the specifics in its detail line.
  const issues = [
    w.status === "suspended" ? "The workspace is suspended, so nothing is sending." : "",
    w.status === "review" ? "The workspace is in review: campaigns wait for approval." : "",
    openAbuse ? `${openAbuse} open abuse report${openAbuse === 1 ? "" : "s"}.` : "",
    pendingCampaigns ? `${pendingCampaigns} campaign${pendingCampaigns === 1 ? "" : "s"} waiting for review.` : "",
  ].filter(Boolean);
  const toasts: { id: string; kind: ToastKind; message: string }[] = issues.length
    ? [{ id: `ws-${w.id}-${issues.join("|").length}`, kind: w.status === "suspended" || openAbuse ? "warning" : "info", message: issues.join(" ") }]
    : [];

  const statusAction = (status: "active" | "suspended" | "review") => ({ id: w.id, status, back: "detail" });

  return (
    <>
      <PageToasts toasts={toasts} />
      <PageHeader
        title={w.name}
        description={`${w.owner?.email ?? "No owner"} · ${planName} plan · created ${w.created}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={w.status} />
            {w.status === "active" ? (
              <ConfirmSubmitButton action={setWorkspaceStatusAction} fields={statusAction("review")} variant="outline" size="sm"
                confirm={{ title: "Move to review?", description: "New campaigns from this workspace will wait for your approval before they send.", confirmLabel: "Move to review" }}>
                Move to review
              </ConfirmSubmitButton>
            ) : null}
            {w.status === "suspended" ? (
              <ConfirmSubmitButton action={setWorkspaceStatusAction} fields={statusAction("active")} variant="outline" size="sm"
                confirm={{ title: "Reinstate this workspace?", description: "Sending is allowed again straight away.", confirmLabel: "Reinstate" }}>
                Reinstate
              </ConfirmSubmitButton>
            ) : (
              <ConfirmSubmitButton action={setWorkspaceStatusAction} fields={statusAction("suspended")} variant="danger" size="sm"
                confirm={{ title: `Suspend ${w.name}?`, description: "Sending stops immediately for everyone in this workspace. Their data is kept and you can reinstate it at any time.", confirmLabel: "Suspend workspace", tone: "danger" }}>
                Suspend
              </ConfirmSubmitButton>
            )}
          </div>
        }
      />

      <LinkTabs
        active={tab}
        tabs={[
          { key: "overview", label: "Overview", href: base },
          { key: "people", label: "People", href: `${base}?tab=people`, count: w.members.length },
          { key: "campaigns", label: "Campaigns", href: `${base}?tab=campaigns`, count: w.campaigns.length >= 10 ? "10+" : w.campaigns.length },
          { key: "sending", label: "Sending", href: `${base}?tab=sending`, count: w.domains.length },
          { key: "activity", label: "Activity", href: `${base}?tab=activity`, count: openAbuse || undefined },
          { key: "limits", label: "Plan & limits", href: `${base}?tab=limits` },
        ]}
      />

      {tab === "overview" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Sent (30 days)" value={formatNumber(a.sent30)} note={`${formatNumber(w.dailyLimit)} per day allowed`} />
            <StatCard label="Delivered" value={a.deliveredRate} note={`${formatNumber(a.delivered)} emails`} />
            <StatCard label="Bounce rate" value={a.bounceRate} status={health(ratio(a.bounced, a.sent30), settings.pause_bounce_pct)} note={`Campaigns pause at ${settings.pause_bounce_pct}%`} />
            <StatCard label="Complaint rate" value={a.complaintRate} status={health(ratio(a.complaints30, a.sent30), settings.pause_complaint_pct)} note={`Pause at ${settings.pause_complaint_pct}% · suspend at ${settings.suspend_complaint_pct}%`} />
            <StatCard label="Contacts" value={formatNumber(w.counts.contacts)} progress={Math.min(1, w.counts.contacts / Math.max(1, w.maxContacts))} note={`${formatNumber(w.counts.subscribed)} subscribed · limit ${formatNumber(w.maxContacts)}`} />
            <StatCard label="Lists" value={formatNumber(w.counts.lists)} />
            <StatCard label="Team" value={formatNumber(w.members.length)} note={w.counts.invites ? `${w.counts.invites} invitation${w.counts.invites === 1 ? "" : "s"} pending` : "No pending invitations"} />
            <StatCard label="Sender addresses" value={formatNumber(w.counts.senders)} note={`${w.domains.filter((d) => d.status === "verified").length} of ${w.domains.length} domains verified`} />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader title="Sending, last 30 days" />
              <div className="p-6">
                <TrendChart
                  ariaLabel="Emails sent, bounced and clicked per day for this workspace"
                  dates={a.series.map((d) => d.date)}
                  series={[
                    { key: "sent", label: "Sent", tone: "brand", values: a.series.map((d) => d.sent), area: true },
                    { key: "clicks", label: "Unique clickers", tone: "accent", values: a.series.map((d) => d.uniqueClicks), dashed: true },
                    { key: "bounced", label: "Bounced", tone: "warning", values: a.series.map((d) => d.bounced) },
                  ]}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Account" />
              <FactList
                items={[
                  { label: "Owner", value: w.owner ? <Link href={`/users/${w.owner.id}`} className="text-brand-800 hover:underline">{w.owner.name !== "-" ? w.owner.name : w.owner.email}</Link> : "" },
                  { label: "Plan", value: planName },
                  { label: "Created", value: w.created },
                  { label: "Time zone", value: w.timezone },
                  { label: "Business address", value: w.address || <span className="text-danger">Missing</span> },
                  { label: "Status", value: <StatusBadge status={w.status} /> },
                ]}
              />
            </Card>
          </div>
        </>
      ) : null}

      {tab === "people" ? (
        <Card>
          <CardHeader title="People" description={`Everyone with access to ${w.name}.`} />
          <Table>
            <thead><tr><TH>Person</TH><TH>Role</TH></tr></thead>
            <tbody>
              {w.members.map((m) => (
                <tr key={m.id}>
                  <TD><Link href={`/users/${m.id}`} className="font-semibold text-ink hover:text-brand-800 hover:underline">{m.name !== "-" ? m.name : m.email}</Link>{m.name !== "-" ? <p className="text-xs text-ink-muted">{m.email}</p> : null}</TD>
                  <TD><div className="flex gap-1"><Badge tone={m.owner ? "brand" : "neutral"}>{m.owner ? "Owner" : m.role}</Badge></div></TD>
                </tr>
              ))}
              {w.members.length === 0 ? <EmptyRow cols={2} message="No members." /> : null}
            </tbody>
          </Table>
          {w.counts.invites ? <p className="border-t border-mist px-6 py-4 text-sm text-ink-muted">{w.counts.invites} invitation{w.counts.invites === 1 ? "" : "s"} pending.</p> : null}
        </Card>
      ) : null}

      {tab === "campaigns" ? (
        <Card>
          <CardHeader title="Campaigns" description="The 10 most recent that were sent, scheduled or submitted. Open one to see the email." />
          <Table>
            <thead><tr><TH>Campaign</TH><TH>Status</TH><TH>Recipients</TH><TH>Delivered</TH><TH>Bounced</TH><TH>Complaints</TH><TH>Click rate</TH><TH>Date</TH></tr></thead>
            <tbody>
              {w.campaigns.map((c) => (
                <tr key={c.id}>
                  <TD><Link href={`/review/${c.id}`} className="font-semibold text-ink hover:text-brand-800 hover:underline">{c.name}</Link><p className="text-xs text-ink-muted">{c.subject}</p></TD>
                  <TD><div className="flex flex-wrap gap-1"><StatusBadge status={c.status} />{c.review === "pending" ? <Badge tone="warning">In review</Badge> : c.review === "rejected" ? <Badge tone="danger">Rejected</Badge> : null}</div></TD>
                  <TD>{formatNumber(c.recipients)}</TD>
                  <TD>{pct(c.delivered, c.sent)}</TD>
                  <TD>{c.bounced ? formatNumber(c.bounced) : "-"}</TD>
                  <TD>{c.complained ? <span className="font-semibold text-danger">{formatNumber(c.complained)}</span> : "-"}</TD>
                  <TD>{c.clickRate}</TD>
                  <TD className="whitespace-nowrap">{c.date}</TD>
                </tr>
              ))}
              {w.campaigns.length === 0 ? <EmptyRow cols={8} message="This workspace hasn’t sent a campaign yet." /> : null}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {tab === "sending" ? (
        <Card>
          <CardHeader title="Sending domains" description={`${w.counts.senders} active sender address${w.counts.senders === 1 ? "" : "es"} across ${w.domains.length} domain${w.domains.length === 1 ? "" : "s"}.`} />
          <Table>
            <thead><tr><TH>Domain</TH><TH>Status</TH><TH>DKIM</TH><TH>SPF</TH><TH>DMARC</TH><TH>Added</TH></tr></thead>
            <tbody>
              {w.domains.map((d) => (
                <tr key={d.id}>
                  <TD className="font-semibold text-ink">{d.domain}</TD>
                  <TD><StatusBadge status={d.status} /></TD>
                  <TD><Badge tone={d.dkim ? "success" : "danger"}>{d.dkim ? "Pass" : "Fail"}</Badge></TD>
                  <TD><Badge tone={d.spf ? "success" : "danger"}>{d.spf ? "Pass" : "Fail"}</Badge></TD>
                  <TD><Badge tone={d.dmarc ? "success" : "danger"}>{d.dmarc ? "Pass" : "Fail"}</Badge></TD>
                  <TD>{d.added}</TD>
                </tr>
              ))}
              {w.domains.length === 0 ? <EmptyRow cols={6} message="No sending domain added yet." /> : null}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {tab === "activity" ? (
        <div className="grid gap-6">
          <Card>
            <CardHeader title="Abuse reports" />
            <Table>
              <thead><tr><TH>Reporter</TH><TH>Reason</TH><TH>Status</TH><TH>Received</TH></tr></thead>
              <tbody>
                {w.abuse.map((r) => (<tr key={r.id}><TD>{r.reporter}</TD><TD className="max-w-[420px] break-words">{r.reason}</TD><TD><StatusBadge status={r.status} /></TD><TD>{r.received}</TD></tr>))}
                {w.abuse.length === 0 ? <EmptyRow cols={4} message="No abuse reports." /> : null}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Admin actions" description="What admins have done to this workspace." />
            <Table>
              <thead><tr><TH>When</TH><TH>Admin</TH><TH>Action</TH><TH>Detail</TH></tr></thead>
              <tbody>
                {w.audit.map((e, i) => (<tr key={i}><TD className="whitespace-nowrap">{e.when}</TD><TD>{e.actor}</TD><TD className="font-semibold text-ink">{e.action}</TD><TD className="max-w-[320px] break-all text-xs text-ink-muted">{e.detail}</TD></tr>))}
                {w.audit.length === 0 ? <EmptyRow cols={4} message="No admin actions recorded." /> : null}
              </tbody>
            </Table>
          </Card>
        </div>
      ) : null}

      {tab === "limits" ? (
        <div className="grid max-w-2xl gap-6">
          <Card>
            <CardHeader title="Subscription" description="Where this plan comes from." />
            <FactList
              items={[
                { label: "Plan", value: planName },
                { label: "Billing", value: w.billing.ref ? `Subscribed through ${w.billing.provider ?? "the payment provider"}` : <span className="text-ink-muted">No subscription: set by hand or left on the signup default</span> },
              ]}
            />
            <p className="border-t border-mist px-6 py-4 text-sm text-ink-muted">
              When a customer pays, billing sets the plan and its limits automatically, and puts them back to Free if the subscription ends. The form below
              writes the same values directly. It does not start or cancel a subscription, so a later billing event can overwrite what you set here.
            </p>
          </Card>
          <Card>
            <CardHeader title="Plan and limits" description="Changes apply immediately and are written to the audit log." />
            <form action={updateWorkspaceLimitsAction} className="grid gap-5 p-6 sm:grid-cols-2">
              <input type="hidden" name="id" value={w.id} />
              <input type="hidden" name="back" value="detail" />
              <input type="hidden" name="tab" value="limits" />
              <Field label="Plan" htmlFor="plan" hint={`Plan defaults: ${formatNumber(w.planLimits.startDaily)} emails per day to start (up to ${formatNumber(w.planLimits.maxDaily)}), ${formatNumber(w.planLimits.contacts)} contacts.`}>
                <Select id="plan" name="plan" defaultValue={w.plan}>
                  {plans.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </Select>
              </Field>
              <span className="hidden sm:block" />
              <Field label="Daily send limit" htmlFor="daily" hint="Emails this workspace may send per day. Healthy campaigns raise it automatically, up to the plan’s maximum.">
                <Input id="daily" name="daily" type="number" min={1} max={1000000} defaultValue={w.dailyLimit} />
              </Field>
              <Field label="Contact limit" htmlFor="contacts" hint="People it can store across all lists. This is the limit that is enforced.">
                <Input id="contacts" name="contacts" type="number" min={1} max={10000000} defaultValue={w.maxContacts} />
              </Field>
              <label className="flex items-start gap-3 text-sm text-ink sm:col-span-2">
                <input type="checkbox" name="reset" className="mt-1 h-4 w-4 rounded border-mist" />
                <span><span className="font-semibold">Use this plan’s default limits instead</span><span className="block text-xs text-ink-muted">Ignores the two numbers above. Handy after changing the plan.</span></span>
              </label>
              <div className="sm:col-span-2"><ActionButton>Save changes</ActionButton></div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
