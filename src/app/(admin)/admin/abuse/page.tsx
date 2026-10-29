import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { getAbuseReports } from "@/lib/queries";
import { resolveAbuseAction } from "../actions";

export const metadata: Metadata = { title: "Abuse reports" };

export default async function AdminAbusePage() {
  const reports = await getAbuseReports();
  return (
    <>
      <PageHeader title="Abuse reports" description="Complaints from recipients, mailbox providers and automatic enforcement." />
      <Card>
        <Table>
          <thead><tr><TH>Reason</TH><TH>Workspace</TH><TH>Reporter</TH><TH>Status</TH><TH>Received</TH><TH><span className="sr-only">Actions</span></TH></tr></thead>
          <tbody>
            {reports.map((a) => (
              <tr key={a.id}>
                <TD className="font-semibold text-ink">{a.reason}</TD>
                <TD>{a.workspace}</TD>
                <TD>{a.reporter}</TD>
                <TD><StatusBadge status={a.status} /></TD>
                <TD>{a.received}</TD>
                <TD>{a.status === "open" ? <form action={resolveAbuseAction}><input type="hidden" name="id" value={a.id} /><Button type="submit" variant="outline" size="sm">Resolve</Button></form> : null}</TD>
              </tr>
            ))}
            {reports.length === 0 ? <EmptyRow cols={6} message="No abuse reports." /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
