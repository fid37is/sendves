import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { PageHeader, StatCard } from "@/components/ui/page-header";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { getAdminUsers } from "@/lib/queries";
import { formatNumber, initials } from "@/lib/utils";
import type { SearchParams } from "@/types";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const { users, total, admins, noWorkspace } = await getAdminUsers({ q: searchParams.q, role: searchParams.role });
  const filtered = Boolean(searchParams.q || searchParams.role);
  return (
    <>
      <PageHeader title="Users" description="Everyone with a Sendves account, the organizations they belong to, and when they were last active. Open a person for the full picture." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Accounts" value={formatNumber(total)} />
        <StatCard label="Platform admins" value={formatNumber(admins)} note="Can open this console" />
        <StatCard label="Without an organization" value={formatNumber(noWorkspace)} note={filtered ? "Within the current results" : "In the 200 most recent"} status={noWorkspace ? "warn" : undefined} />
      </div>
      <Card>
        <form className="flex flex-wrap gap-3 border-b border-mist p-4" action="/users">
          <Input name="q" defaultValue={searchParams.q} type="search" placeholder="Search by name or email" aria-label="Search users" className="max-w-xs" />
          <Select name="role" defaultValue={searchParams.role ?? ""} aria-label="Filter by role" className="max-w-[180px]">
            <option value="">All roles</option>
            <option value="user">Customers</option>
            <option value="admin">Platform admins</option>
          </Select>
          <Button type="submit" variant="outline">Filter</Button>
          {filtered ? <Link href="/users" className="self-center text-sm font-semibold text-brand-800 hover:underline">Clear</Link> : null}
        </form>
        <Table>
          <thead><tr><TH>User</TH><TH>Role</TH><TH>Organizations</TH><TH>Last active</TH><TH>Joined</TH><TH className="w-12"><span className="sr-only">Open</span></TH></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-mist-50">
                <TD>
                  <Link href={`/users/${u.id}`} className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-800">{initials(u.name !== "-" ? u.name : u.email) || "?"}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink hover:text-brand-800">{u.name !== "-" ? u.name : u.email}</span>
                      <span className="block truncate text-xs text-ink-muted">{u.name !== "-" ? u.email : "No name set"}{!u.confirmed ? " · email not verified" : ""}</span>
                    </span>
                  </Link>
                </TD>
                <TD><Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role === "admin" ? "Platform admin" : "Customer"}</Badge></TD>
                <TD>
                  {u.role === "admin" ? (
                    <span className="text-ink-muted">Not applicable</span>
                  ) : u.workspaces.length ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {u.workspaces.slice(0, 2).map((w) => (
                        <Link key={w.id} href={`/workspaces/${w.id}`} className="inline-flex items-center gap-1.5 text-ink hover:text-brand-800 hover:underline">
                          {w.name}<span className="text-xs text-ink-muted">({w.role})</span>{w.status !== "active" ? <StatusBadge status={w.status} /> : null}
                        </Link>
                      ))}
                      {u.workspaces.length > 2 ? <span className="text-xs text-ink-muted">+{u.workspaces.length - 2} more</span> : null}
                    </div>
                  ) : <span className="text-ink-muted">None</span>}
                </TD>
                <TD className="whitespace-nowrap">{u.lastSeen}</TD>
                <TD className="whitespace-nowrap">{u.joined}</TD>
                <TD className="text-right"><Link href={`/users/${u.id}`} aria-label={`Open ${u.name !== "-" ? u.name : u.email}`} className="inline-flex rounded-full p-1.5 text-ink-muted hover:bg-mist-100 hover:text-ink"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></TD>
              </tr>
            ))}
            {users.length === 0 ? <EmptyRow cols={6} message={filtered ? "No users match." : "No users yet."} /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
