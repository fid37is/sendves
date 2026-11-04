import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { getAuditLog } from "@/lib/queries";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage() {
  const entries = await getAuditLog();
  return (
    <>
      <PageHeader title="Audit log" description="Every administrator sign-in and action. Entries are append-only and cannot be edited or deleted. Showing the latest 200." />
      <Card>
        <Table>
          <thead><tr><TH>When</TH><TH>Administrator</TH><TH>Action</TH><TH>Target</TH><TH>IP</TH><TH>Details</TH></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <TD className="whitespace-nowrap">{e.when}</TD>
                <TD label="Administrator" className="font-semibold text-ink">{e.actor}</TD>
                <TD label="Action" className="font-mono text-xs">{e.action}</TD>
                <TD label="Target" className="text-xs">
                  {e.target ? (
                    <span title={e.target.full}>
                      <span className="text-ink">{e.target.type}</span>
                      {e.target.id ? <span className="ml-1.5 font-mono text-ink-muted">{e.target.id}</span> : null}
                    </span>
                  ) : "-"}
                </TD>
                <TD label="IP" className="font-mono text-xs">{e.ip}</TD>
                <TD label="Details" wide className="min-w-[220px] text-xs">
                  {e.details.length ? (
                    <dl className="space-y-1">
                      {e.details.map((d, i) => (
                        <div key={i} className="flex gap-2">
                          <dt className="shrink-0 text-ink-muted">{d.label}</dt>
                          <dd className="min-w-0 break-words font-medium text-ink" title={d.full}>{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <span className="text-ink-muted">-</span>}
                </TD>
              </tr>
            ))}
            {entries.length === 0 ? <EmptyRow cols={6} message="No activity recorded yet." /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
