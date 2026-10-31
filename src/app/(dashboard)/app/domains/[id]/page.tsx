import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/submit-button";
import { Table, TD, TH } from "@/components/ui/table";
import { NoAccess } from "@/components/dashboard/no-access";
import { CopyText } from "@/components/dashboard/domains/copy-text";
import { can } from "@/lib/access";
import { getDomains, type DomainFinding } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { checkDomainAction, removeDomainAction } from "../actions";

export const metadata: Metadata = { title: "Sending domain" };

const tone = { ok: "success", pending: "warning", missing: "danger", incorrect: "danger" } as const;
const word = { ok: "Passed", pending: "Pending", missing: "Missing", incorrect: "Incorrect" } as const;

/** A check that hasn't passed, with what was found. Passed checks aren't listed: the records table shows them. */
function Problem({ label, finding }: { label: string; finding?: DomainFinding }) {
  const status = finding?.status ?? "pending";
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 px-6 py-3">
      <span className="w-16 shrink-0 text-sm font-bold text-ink">{label}</span>
      <Badge tone={tone[status]}>{word[status]}</Badge>
      <span className="min-w-0 flex-1 basis-64 text-sm text-ink-soft">
        {finding?.message || "Not checked yet. Add the record, then choose Check records."}
        {finding?.found?.length ? <span className="mt-1 block break-all font-mono text-xs text-ink-muted">Found: {finding.found.join(" · ")}</span> : null}
      </span>
    </li>
  );
}

export default async function DomainPage({ params }: { params: { id: string } }) {
  const ctx = await getContext();
  if (!can(ctx?.access, "domains.view")) return <NoAccess title="Sending domains" what="sending domains" />;
  const manage = can(ctx?.access, "domains.manage");
  const d = (await getDomains(ctx!)).find((x) => x.id === params.id);
  if (!d) notFound();

  const checked = d.lastChecked
    ? new Date(d.lastChecked).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  const problems = [
    !d.dkimOk && { label: "DKIM", finding: d.findings.dkim },
    !d.spfOk && { label: "SPF", finding: d.findings.spf },
    !d.dmarcOk && { label: "DMARC", finding: d.findings.dmarc },
  ].filter(Boolean) as { label: string; finding?: DomainFinding }[];

  return (
    <>
      <PageHeader
        title={d.domain}
        description={[d.ready ? "Ready to send" : "Not ready to send yet", checked ? `Last checked ${checked}` : "Not checked yet"].join(" · ")}
        action={manage ? (
          <div className="flex flex-wrap items-center gap-2">
            <form action={checkDomainAction}>
              <input type="hidden" name="id" value={d.id} />
              <ActionButton variant="outline">Check records</ActionButton>
            </form>
            <ConfirmSubmitButton
              action={removeDomainAction}
              fields={{ id: d.id }}
              variant="ghost"
              className="!text-danger hover:!bg-danger-soft"
              confirm={{
                title: `Remove ${d.domain}?`,
                description: "The work emails and aliases on it are removed too, and drafts that use them lose their sender. Campaigns that are scheduled or sending must finish or be cancelled first. This can’t be undone.",
                confirmLabel: "Remove domain",
                tone: "danger",
              }}
            >
              Remove
            </ConfirmSubmitButton>
          </div>
        ) : undefined}
      />

      {problems.length > 0 ? (
        <Card className="mb-6 overflow-hidden">
          <CardHeader title="Needs attention" description="Add or fix these at your DNS provider, then choose Check records. Changes can take up to 48 hours. If you already have an SPF or DMARC record, edit it instead of adding a second one." />
          <ul className="divide-y divide-mist" aria-label={`Checks that haven’t passed for ${d.domain}`}>
            {problems.map((p) => <Problem key={p.label} label={p.label} finding={p.finding} />)}
          </ul>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader title="DNS records" action={<StatusBadge status={d.ready ? "verified" : d.status === "verified" ? "pending" : d.status} />} />
        <Table>
          <thead><tr><TH>Purpose</TH><TH>Type</TH><TH>Host</TH><TH>Value</TH><TH>Status</TH></tr></thead>
          <tbody>
            {d.records.map((r) => (
              <tr key={r.host + r.purpose}>
                <TD className="font-semibold text-ink">{r.purpose}</TD>
                <TD>{r.type}</TD>
                <TD>
                  <div className="flex items-start gap-1">
                    <span className="min-w-0 break-all font-mono text-xs">{r.host}</span>
                    <CopyText value={r.host} label="host" />
                  </div>
                </TD>
                <TD>
                  <div className="flex items-start gap-1">
                    <span className="min-w-0 break-all font-mono text-xs">{r.value}</span>
                    <CopyText value={r.value} label="value" />
                  </div>
                </TD>
                <TD><StatusBadge status={r.status} /></TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
