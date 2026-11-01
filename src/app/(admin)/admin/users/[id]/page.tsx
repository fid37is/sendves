import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { FactList } from "@/components/ui/tabs";
import { ConfirmSubmitButton } from "@/components/ui/confirm";
import { ActionButton } from "@/components/ui/submit-button";
import { getAdminUserDetail } from "@/lib/queries";
import { sendPasswordResetAction, setUserDisabledAction } from "../actions";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({ params }: { params: { id: string } }) {
  const u = await getAdminUserDetail(params.id);
  if (!u) notFound();
  return (
    <>
      <PageHeader
        title={u.name !== "-" ? u.name : u.email}
        description={u.name !== "-" ? u.email : "No name set"}
        action={<div className="flex items-center gap-2">{u.disabled ? <Badge tone="danger">Sign-in disabled</Badge> : null}<Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role === "admin" ? "Platform admin" : "Customer"}</Badge></div>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-6">
          <Card>
            <CardHeader title="Organizations" description="Where this person works inside Sendves." />
            <Table>
              <thead><tr><TH>Organization</TH><TH>Their role</TH><TH>Plan</TH><TH>Status</TH></tr></thead>
              <tbody>
                {u.workspaces.map((w) => (
                  <tr key={w.id}>
                    <TD><Link href={`/workspaces/${w.id}`} className="font-semibold text-ink hover:text-brand-800 hover:underline">{w.name}</Link></TD>
                    <TD><Badge tone={w.owns ? "brand" : "neutral"}>{w.owns ? "Owner" : w.role}</Badge></TD>
                    <TD className="capitalize">{w.plan}</TD>
                    <TD><StatusBadge status={w.status} /></TD>
                  </tr>
                ))}
                {u.workspaces.length === 0 ? <EmptyRow cols={4} message="Not part of any organization." /> : null}
              </tbody>
            </Table>
          </Card>
          {u.role === "admin" ? (
            <Card>
              <CardHeader title="Recent admin actions" />
              <Table>
                <thead><tr><TH>When</TH><TH>Action</TH><TH>Target</TH></tr></thead>
                <tbody>
                  {u.activity.map((a, i) => (<tr key={i}><TD className="whitespace-nowrap">{a.when}</TD><TD className="font-semibold text-ink">{a.action}</TD><TD className="break-all text-xs text-ink-muted">{a.target}</TD></tr>))}
                  {u.activity.length === 0 ? <EmptyRow cols={3} message="No admin actions yet." /> : null}
                </tbody>
              </Table>
            </Card>
          ) : null}
        </div>
        <div className="grid h-fit gap-6">
          <Card>
            <CardHeader title="Account" />
            <FactList
              items={[
                { label: "Email", value: u.email },
                { label: "Email verified", value: u.confirmed ? "Yes" : <span className="text-danger">Not yet</span> },
                { label: "Last active", value: u.lastSeen },
                { label: "Joined", value: u.joined },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Manage" />
            {u.role === "admin" ? (
              <p className="p-6 text-sm text-ink-muted">Platform admins are managed on the <Link href="/admins" className="font-semibold text-brand-800 hover:underline">Admins</Link> page.</p>
            ) : (
              <div className="flex flex-wrap gap-3 p-6">
                <form action={sendPasswordResetAction}>
                  <input type="hidden" name="id" value={u.id} />
                  <ActionButton variant="outline" size="sm">Send password reset</ActionButton>
                </form>
                {u.disabled ? (
                  <ConfirmSubmitButton action={setUserDisabledAction} fields={{ id: u.id, disable: "0" }} variant="outline" size="sm"
                    confirm={{ title: "Enable sign-in?", description: "They will be able to log in again.", confirmLabel: "Enable sign-in" }}>
                    Enable sign-in
                  </ConfirmSubmitButton>
                ) : (
                  <ConfirmSubmitButton action={setUserDisabledAction} fields={{ id: u.id, disable: "1" }} variant="danger" size="sm"
                    confirm={{ title: "Disable sign-in?", description: "They can’t log in until you enable it again. Their workspaces and data are kept, and anything already scheduled still sends. To stop sending, suspend the workspace.", confirmLabel: "Disable sign-in", tone: "danger" }}>
                    Disable sign-in
                  </ConfirmSubmitButton>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
