import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { getSuppression } from "@/lib/queries";

export const metadata: Metadata = { title: "Suppression list" };

export default async function AdminSuppressionPage() {
  const entries = await getSuppression();
  return (
    <>
      <PageHeader title="Suppression list" description="Addresses that must never be emailed. Global entries protect every workspace. Showing the latest 200." />
      <Card>
        <Table>
          <thead><tr><TH>Email</TH><TH>Reason</TH><TH>Scope</TH><TH>Added</TH></tr></thead>
          <tbody>
            {entries.map((s) => (
              <tr key={s.email + s.scope + s.added}>
                <TD className="font-semibold text-ink">{s.email}</TD>
                <TD>{s.reason}</TD>
                <TD><Badge tone={s.scope === "Global" ? "brand" : "neutral"}>{s.scope}</Badge></TD>
                <TD>{s.added}</TD>
              </tr>
            ))}
            {entries.length === 0 ? <EmptyRow cols={4} message="The suppression list is empty." /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
