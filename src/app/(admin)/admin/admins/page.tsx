import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/submit-button";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/admin";
import { getAdminUsers } from "@/lib/queries";
import { addAdminAction, removeAdminAction, resendSetupLinkAction } from "./actions";

export const metadata: Metadata = { title: "Admins" };

export default async function AdminAdminsPage() {
  const me = await requireAdmin();
  const { users } = await getAdminUsers({ role: "admin" });
  return (
    <>
      <PageHeader title="Admins" description="People who can open this console. Everyone signs in here with a password and an authenticator app." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Platform admins" description={`${users.length} with access.`} />
          <Table>
            <thead><tr><TH>Admin</TH><TH>Last active</TH><TH>Added</TH><TH><span className="sr-only">Actions</span></TH></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <TD>
                    <Link href={`/users/${u.id}`} className="font-semibold text-ink hover:text-brand-800 hover:underline">{u.name !== "-" ? u.name : u.email}</Link>
                    {u.id === me.id ? <span className="ml-2"><Badge tone="brand">You</Badge></span> : null}
                    {u.name !== "-" ? <p className="text-xs text-ink-muted">{u.email}</p> : null}
                  </TD>
                  <TD className="whitespace-nowrap">{u.lastSeen === "Never" ? <Badge tone="warning">Hasn’t signed in</Badge> : u.lastSeen}</TD>
                  <TD className="whitespace-nowrap">{u.joined}</TD>
                  <TD>
                    {u.id === me.id ? null : (
                      <div className="flex flex-wrap justify-end gap-2">
                        <form action={resendSetupLinkAction}><input type="hidden" name="id" value={u.id} /><ActionButton variant="outline" size="sm">Send setup link</ActionButton></form>
                        <ConfirmSubmitButton action={removeAdminAction} fields={{ id: u.id }} variant="danger" size="sm"
                          confirm={{ title: `Remove ${u.name !== "-" ? u.name : u.email}?`, description: "They lose access to the console and their sign-in is switched off.", confirmLabel: "Remove admin", tone: "danger" }}>
                          Remove
                        </ConfirmSubmitButton>
                      </div>
                    )}
                  </TD>
                </tr>
              ))}
              {users.length === 0 ? <EmptyRow cols={4} message="No admins." /> : null}
            </tbody>
          </Table>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Add an admin" description="They get an email to choose a password, then set up two-factor on first sign-in." />
          <form action={addAdminAction} className="space-y-5 p-6">
            <Field label="Name" htmlFor="name"><Input id="name" name="name" autoComplete="off" maxLength={80} /></Field>
            <Field label="Email address" htmlFor="email" hint="Use an address that isn’t a customer account. Admin and customer sign-ins are separate.">
              <Input id="email" name="email" type="email" autoComplete="off" required />
            </Field>
            <ActionButton>Add admin</ActionButton>
          </form>
        </Card>
      </div>
    </>
  );
}
