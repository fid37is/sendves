import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { ButtonLink, Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SearchParams } from "@/types";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { siteConfig } from "@/config/site";
import { getContacts, getDepartments, getListsOverview } from "@/lib/queries";
import { can } from "@/lib/access";
import { NoAccess } from "@/components/dashboard/no-access";
import { getContext } from "@/lib/workspace";
import { AddContactsButton } from "@/components/dashboard/add-contacts-drawer";
import { ContactsTable } from "@/components/dashboard/contacts-table";
import { ListHeader, ListsRail } from "@/components/dashboard/lists-panel";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  if (!can(ctx?.access, "contacts.view")) return <NoAccess title="Contacts" what="contacts" />;
  const manage = can(ctx?.access, "contacts.manage");
  const access = ctx!.access!;
  const departments = (await getDepartments(ctx!)).filter((d) => access.allDepartments || access.departmentIds.includes(d.id)).map(({ id, name }) => ({ id, name }));
  const orgWideAllowed = access.allDepartments || access.departmentIds.length === 0;
  const page = Number(searchParams.page ?? 1) || 1;

  const { lists, total: totalContacts } = await getListsOverview(ctx!);
  const unassigned = searchParams.list === "none";
  const current = unassigned ? null : lists.find((l) => l.id === searchParams.list) ?? null;
  // A link to a list that was deleted: fall back to everyone instead of showing an empty page.
  if (searchParams.list && !unassigned && !current) redirect("/app/contacts");
  const listParam = current ? current.id : unassigned ? "none" : undefined;

  const { rows, total, pageSize } = await getContacts(ctx!, { q: searchParams.q, status: searchParams.status, page, list: listParam });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (p: number) =>
    `/app/contacts?page=${p}${listParam ? `&list=${listParam}` : ""}${searchParams.q ? `&q=${encodeURIComponent(searchParams.q)}` : ""}${searchParams.status ? `&status=${searchParams.status}` : ""}`;

  const filtered = Boolean(searchParams.q || searchParams.status);
  const emptyMessage = filtered
    ? "No contacts match these filters."
    : current
      ? "No one is in this list yet. Use Add contact or Import CSV to put people in it."
      : unassigned
        ? "Every contact is in a list."
        : "No contacts yet. Import a CSV or use Add contact to get started.";

  const description = current
    ? "Add, remove and move people between lists. Select contacts for more actions."
    : unassigned
      ? "Contacts that aren’t in any list yet. Select them to add them to one."
      : "Everyone you email, with their current status. Select contacts to put them in lists.";

  return (
    <>
      <PageHeader
        title="Contacts"
        description={description}
        action={
          <div className="flex flex-wrap gap-3">
            <a href={`/api/contacts/export${current ? `?list=${current.id}` : ""}`} className={buttonStyles({ variant: "outline" })}>
              <Download className="h-4 w-4" aria-hidden="true" />Export{current ? " list" : ""}
            </a>
            {manage ? (
              <>
                <ButtonLink href={`/app/contacts/import${current ? `?list=${current.id}` : ""}`} variant="outline">
                  <Upload className="h-4 w-4" aria-hidden="true" />Import CSV
                </ButtonLink>
                <AddContactsButton lists={lists.map(({ id, name }) => ({ id, name }))} defaultListId={current?.id} />
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ListsRail lists={lists} total={totalContacts} currentId={current?.id ?? null} unassigned={unassigned} departments={departments} orgWideAllowed={orgWideAllowed} canCreate={manage} />

        <div className="min-w-0 space-y-4">
          {current ? <ListHeader list={current} signupUrl={`${siteConfig.url}/subscribe/${current.id}`} /> : null}
          <Card>
            <form className="flex flex-wrap gap-3 border-b border-mist p-4" action="/app/contacts">
              {listParam ? <input type="hidden" name="list" value={listParam} /> : null}
              <Input name="q" defaultValue={searchParams.q} type="search" placeholder="Search by name or email" aria-label="Search contacts" className="max-w-xs" />
              <Select name="status" defaultValue={searchParams.status ?? ""} aria-label="Filter by status" className="max-w-[180px]">
                <option value="">All statuses</option>
                {["subscribed", "unsubscribed", "bounced", "complained", "cleaned"].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </Select>
              <Button type="submit" variant="outline">Filter</Button>
            </form>

            <ContactsTable rows={rows} lists={lists} current={current ? { id: current.id, name: current.name } : null} emptyMessage={emptyMessage} />

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
        </div>
      </div>
    </>
  );
}