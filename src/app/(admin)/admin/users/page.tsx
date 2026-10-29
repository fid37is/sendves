import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { getAdminUsers } from "@/lib/queries";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const users = await getAdminUsers();
  return (
    <>
      <PageHeader title="Users" description="Everyone with a Sendves account." />
      <Card>
        <Table>
          <thead><tr><TH>User</TH><TH>Role</TH><TH>Joined</TH></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <TD><p className="font-semibold text-ink">{u.name}</p><p className="text-xs text-ink-muted">{u.email}</p></TD>
                <TD><Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role}</Badge></TD>
                <TD>{u.joined}</TD>
              </tr>
            ))}
            {users.length === 0 ? <EmptyRow cols={3} message="No users yet." /> : null}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
