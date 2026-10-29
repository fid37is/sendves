import type { Metadata } from "next";
import Link from "next/link";
import { Download, Upload } from "lucide-react";
import { ButtonLink, Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { SearchParams } from "@/types";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { getContacts } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { addContactAction } from "./actions";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  const page = Number(searchParams.page ?? 1) || 1;
  const { rows, total, pageSize } = await getContacts(ctx!, { q: searchParams.q, status: searchParams.status, page });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (p: number) => `/app/contacts?page=${p}${searchParams.q ? `&q=${encodeURIComponent(searchParams.q)}` : ""}${searchParams.status ? `&status=${searchParams.status}` : ""}`;

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Everyone you email, with their current status."
        action={
          <div className="flex gap-3">
            <a href="/api/contacts/export" className="inline-flex h-11 items-center gap-2 rounded-full border border-mist px-5 text-sm font-semibold text-ink hover:bg-mist-50"><Download className="h-4 w-4" aria-hidden="true" />Export</a>
            <ButtonLink href="/app/contacts/import"><Upload className="h-4 w-4" aria-hidden="true" />Import CSV</ButtonLink>
          </div>
        }
      />

      <Card>
        <form className="flex flex-wrap gap-3 border-b border-mist p-4" action="/app/contacts">
          <Input name="q" defaultValue={searchParams.q} type="search" placeholder="Search by name or email" aria-label="Search contacts" className="max-w-xs" />
          <Select name="status" defaultValue={searchParams.status ?? ""} aria-label="Filter by status" className="max-w-[180px]">
            <option value="">All statuses</option>
            {["subscribed", "unsubscribed", "bounced", "complained", "cleaned"].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </Select>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
        <Table>
          <thead><tr><TH>Contact</TH><TH>Status</TH><TH>Lists</TH><TH>Added</TH></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <TD><p className="font-semibold text-ink">{c.name}</p><p className="text-xs text-ink-muted">{c.email}</p></TD>
                <TD><StatusBadge status={c.status} /></TD>
                <TD>{c.lists}</TD>
                <TD>{c.added}</TD>
              </tr>
            ))}
            {rows.length === 0 ? <EmptyRow cols={4} message="No contacts yet. Import a CSV or add a contact below." /> : null}
          </tbody>
        </Table>
        {pages > 1 ? (
          <div className="flex items-center justify-between border-t border-mist px-6 py-3 text-sm text-ink-muted">
            <span>Page {page} of {pages} ({total.toLocaleString("en-US")} contacts)</span>
            <span className="flex gap-4">
              {page > 1 ? <Link className="font-semibold text-brand-800 hover:underline" href={qs(page - 1)}>Previous</Link> : null}
              {page < pages ? <Link className="font-semibold text-brand-800 hover:underline" href={qs(page + 1)}>Next</Link> : null}
            </span>
          </div>
        ) : null}
      </Card>

      <Card className="mt-8 max-w-2xl">
        <CardHeader title="Add one contact" />
        <form action={addContactAction} className="space-y-5 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName"><Input id="firstName" name="firstName" /></Field>
            <Field label="Last name" htmlFor="lastName"><Input id="lastName" name="lastName" /></Field>
          </div>
          <Field label="Email address" htmlFor="email"><Input id="email" name="email" type="email" required /></Field>
          <label className="flex items-start gap-3 text-sm text-ink-soft">
            <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4 accent-brand-700" required />
            This person agreed to receive emails from me.
          </label>
          <Button type="submit">Add contact</Button>
        </form>
      </Card>
    </>
  );
}
