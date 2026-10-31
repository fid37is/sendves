import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageToasts } from "@/components/ui/toast";
import type { SearchParams } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { NoAccess } from "@/components/dashboard/no-access";
import { AddDomainButton } from "@/components/dashboard/domains/add-domain-button";
import { can } from "@/lib/access";
import { serverEnv } from "@/lib/env.server";
import { getDomains } from "@/lib/queries";
import { getContext } from "@/lib/workspace";

export const metadata: Metadata = { title: "Sending domains" };

const fmtChecked = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

export default async function DomainsPage(_props: { searchParams: SearchParams }) {
  const ctx = await getContext();
  if (!can(ctx?.access, "domains.view")) return <NoAccess title="Sending domains" what="sending domains" />;
  const manage = can(ctx?.access, "domains.manage");
  const domains = await getDomains(ctx!);

  return (
    <>
      <PageHeader title="Sending domains" description="A domain can send once DKIM, SPF and DMARC have all passed." action={manage ? <AddDomainButton /> : undefined} />
      {serverEnv.sending.provider === "console" ? (
        <PageToasts toasts={[{ id: "console-mode", kind: "warning", message: "Test sending mode is on: domains verify automatically and emails are not delivered to real inboxes." }]} />
      ) : null}

      <Card className="overflow-hidden">
        <Table>
          <thead>
            <tr><TH>Domain</TH><TH>Status</TH><TH>Checks</TH><TH>Last checked</TH><TH><span className="sr-only">Open</span></TH></tr>
          </thead>
          <tbody>
            {domains.length === 0 ? (
              <EmptyRow cols={5} message={manage ? "No sending domains yet. Use Add domain to start." : "No sending domains yet. An owner or administrator can add one."} />
            ) : domains.map((d) => (
              <tr key={d.id} className="transition-colors hover:bg-mist-50/60">
                <TD><Link href={`/app/domains/${d.id}`} className="font-semibold text-ink hover:underline">{d.domain}</Link></TD>
                <TD><StatusBadge status={d.ready ? "verified" : d.status === "verified" ? "pending" : d.status} /></TD>
                <TD>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={d.dkimOk ? "success" : "warning"}>DKIM</Badge>
                    <Badge tone={d.spfOk ? "success" : "warning"}>SPF</Badge>
                    <Badge tone={d.dmarcOk ? "success" : "warning"}>DMARC</Badge>
                  </div>
                </TD>
                <TD>{fmtChecked(d.lastChecked) ?? <span className="text-ink-muted">Not yet</span>}</TD>
                <TD className="text-right">
                  <Link href={`/app/domains/${d.id}`} aria-label={`Open ${d.domain}`} className="inline-flex rounded-full p-2 text-ink-muted transition-colors hover:bg-mist-100 hover:text-ink">
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
