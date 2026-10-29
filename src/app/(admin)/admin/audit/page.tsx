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
                <TD className="font-semibold text-ink">{e.actor}</TD>
                <TD className="font-mono text-xs">{e.action}</TD>
                <TD className="break-all text-xs">{e.target}</TD>
                <TD className="font-mono text-xs">{e.ip}</TD>
                <TD className="max-w-[260px] break-all text-xs text-ink-muted">{e.detail}</TD>
              </tr>
            ))}
            {entries.length === 0 ? <EmptyRow cols={6} message="No activity recorded yet." /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
