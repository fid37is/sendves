import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { getAdminWorkspaces } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";
import type { SearchParams } from "@/types";
import { setWorkspaceStatusAction } from "../actions";

export const metadata: Metadata = { title: "Workspaces" };

export default async function AdminWorkspacesPage({ searchParams }: { searchParams: SearchParams }) {
  const workspaces = await getAdminWorkspaces({ q: searchParams.q, status: searchParams.status });
  return (
    <>
      <PageHeader title="Workspaces" description="Review volumes, complaint rates and account status. Showing the 200 most recent matches." />
      <Card>
        <form className="flex flex-wrap gap-3 border-b border-mist p-4" action="/workspaces">
          <Input name="q" defaultValue={searchParams.q} type="search" placeholder="Search by workspace name" aria-label="Search workspaces" className="max-w-xs" />
          <Select name="status" defaultValue={searchParams.status ?? ""} aria-label="Filter by status" className="max-w-[180px]">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="review">In review</option>
            <option value="suspended">Suspended</option>
          </Select>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
        <Table>
          <thead><tr><TH>Workspace</TH><TH>Plan</TH><TH>Status</TH><TH>Created</TH><TH>Daily limit</TH><TH>Sent (30 days)</TH><TH>Complaints</TH><TH><span className="sr-only">Actions</span></TH></tr></thead>
          <tbody>
            {workspaces.map((w) => (
              <tr key={w.id}>
                <TD><p className="font-semibold text-ink">{w.name}</p><p className="text-xs text-ink-muted">{w.owner}</p></TD>
                <TD>{w.plan}</TD>
                <TD><StatusBadge status={w.status} /></TD>
                <TD>{w.created}</TD>
                <TD>{formatNumber(w.dailyLimit)}</TD>
                <TD>{formatNumber(w.sent30d)}</TD>
                <TD>{w.complaintRate}{w.complaints30d ? <span className="text-xs text-ink-muted"> ({w.complaints30d})</span> : null}</TD>
                <TD>
                  <form action={setWorkspaceStatusAction}>
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="status" value={w.status === "suspended" ? "active" : "suspended"} />
                    <Button type="submit" variant={w.status === "suspended" ? "outline" : "danger"} size="sm">{w.status === "suspended" ? "Reinstate" : "Suspend"}</Button>
                  </form>
                </TD>
              </tr>
            ))}
            {workspaces.length === 0 ? <EmptyRow cols={8} message="No workspaces match." /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
