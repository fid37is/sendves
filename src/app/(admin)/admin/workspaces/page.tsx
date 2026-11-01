import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { getAdminWorkspaces } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";
import type { SearchParams } from "@/types";

export const metadata: Metadata = { title: "Workspaces" };

export default async function AdminWorkspacesPage({ searchParams }: { searchParams: SearchParams }) {
  const workspaces = await getAdminWorkspaces({ q: searchParams.q, status: searchParams.status });
  const count = (s: string) => workspaces.filter((w) => w.status === s).length;
  return (
    <>
      <PageHeader title="Workspaces" description="Every customer organization. Open one to see its people, campaigns, domains and limits, or to suspend it." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Shown" value={formatNumber(workspaces.length)} note="Up to the 200 most recent matches" />
        <StatCard label="Active" value={formatNumber(count("active"))} />
        <StatCard label="In review" value={formatNumber(count("review"))} status={count("review") ? "warn" : undefined} />
        <StatCard label="Suspended" value={formatNumber(count("suspended"))} status={count("suspended") ? "bad" : undefined} />
      </div>
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
          <thead><tr><TH>Workspace</TH><TH>Plan</TH><TH>Status</TH><TH>People</TH><TH>Created</TH><TH>Sent (30 days)</TH><TH>Complaints</TH><TH className="w-12"><span className="sr-only">Open</span></TH></tr></thead>
          <tbody>
            {workspaces.map((w) => (
              <tr key={w.id} className="transition-colors hover:bg-mist-50">
                <TD><Link href={`/workspaces/${w.id}`} className="font-semibold text-ink hover:text-brand-800 hover:underline">{w.name}</Link><p className="text-xs text-ink-muted">{w.owner}</p></TD>
                <TD>{w.plan}</TD>
                <TD><StatusBadge status={w.status} /></TD>
                <TD>{formatNumber(w.members)}</TD>
                <TD className="whitespace-nowrap">{w.created}</TD>
                <TD>{formatNumber(w.sent30d)}<span className="block text-xs text-ink-muted">Limit {formatNumber(w.dailyLimit)} / day</span></TD>
                <TD>{w.complaintRate}{w.complaints30d ? <span className="text-xs text-ink-muted"> ({w.complaints30d})</span> : null}</TD>
                <TD className="text-right"><Link href={`/workspaces/${w.id}`} aria-label={`Open ${w.name}`} className="inline-flex rounded-full p-1.5 text-ink-muted hover:bg-mist-100 hover:text-ink"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></TD>
              </tr>
            ))}
            {workspaces.length === 0 ? <EmptyRow cols={8} message="No workspaces match." /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
