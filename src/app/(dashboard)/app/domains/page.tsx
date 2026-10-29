import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageToasts } from "@/components/ui/toast";
import type { SearchParams } from "@/types";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TD, TH } from "@/components/ui/table";
import { serverEnv } from "@/lib/env.server";
import { getDomains } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { addDomainAction, checkDomainAction, removeDomainAction } from "./actions";

export const metadata: Metadata = { title: "Sending domains" };

export default async function DomainsPage(_props: { searchParams: SearchParams }) {
  const ctx = await getContext();
  const domains = await getDomains(ctx!);
  return (
    <>
      <PageHeader title="Sending domains" description="Authenticate your domain so mailbox providers trust your emails." />
      {serverEnv.sending.provider === "console" ? (
        <PageToasts toasts={[{ id: "console-mode", kind: "warning", message: "Test sending mode is on: domains verify automatically and emails are not delivered to real inboxes." }]} />
      ) : null}

      <div className="space-y-6">
        {domains.map((d) => (
          <Card key={d.id}>
            <CardHeader
              title={d.domain}
              description="Add these records at your DNS provider, then check again. Changes can take up to 48 hours. DKIM is required; SPF and DMARC are recommended."
              action={
                <div className="flex items-center gap-3">
                  <StatusBadge status={d.status} />
                  <form action={checkDomainAction}><input type="hidden" name="id" value={d.id} /><Button type="submit" variant="outline" size="sm">Check records</Button></form>
                  <form action={removeDomainAction}><input type="hidden" name="id" value={d.id} /><Button type="submit" variant="ghost" size="sm">Remove</Button></form>
                </div>
              }
            />
            <Table>
              <thead><tr><TH>Purpose</TH><TH>Type</TH><TH>Host</TH><TH>Value</TH><TH>Status</TH></tr></thead>
              <tbody>
                {d.records.map((r) => (
                  <tr key={r.host + r.purpose}>
                    <TD className="font-semibold text-ink">{r.purpose}</TD>
                    <TD>{r.type}</TD>
                    <TD className="break-all font-mono text-xs">{r.host}</TD>
                    <TD className="break-all font-mono text-xs">{r.value}</TD>
                    <TD><StatusBadge status={r.status} /></TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ))}
      </div>

      <Card className="mt-8 max-w-xl">
        <CardHeader title="Add a domain" description="Use a domain you own, not a free email domain like gmail.com." />
        <form action={addDomainAction} className="space-y-5 p-6">
          <Field label="Domain" htmlFor="domain"><Input id="domain" name="domain" placeholder="example.com" required /></Field>
          <Button type="submit">Add domain</Button>
        </form>
      </Card>
    </>
  );
}
