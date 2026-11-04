import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { ImportContactsButton } from "@/components/dashboard/import-contacts-drawer";
import { ExportContactsButton } from "@/components/dashboard/export-contacts-drawer";
import { ContactsTable } from "@/components/dashboard/contacts-table";
import { ListSettingsButton, ListsRail } from "@/components/dashboard/lists-panel";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  if (!can(ctx?.access, "contacts.view")) return <NoAccess title="Contacts" what="contacts" />;
  const manage = can(ctx?.access, "contacts.manage");
  const access = ctx!.access!;
  const orgWideAllowed = access.allDepartments || access.departmentIds.length === 0;
  const page = Number(searchParams.page ?? 1) || 1;

  // The three loads don't depend on each other, so they run together. The list filter is passed on as typed
  // (getContacts ignores anything that is not a real list id); a list that doesn't exist is caught right after.
  const unassigned = searchParams.list === "none";
  const [allDepartments, { lists, total: totalContacts }, { rows, total, pageSize }] = await Promise.all([
    getDepartments(ctx!),
    getListsOverview(ctx!),
    getContacts(ctx!, { q: searchParams.q, status: searchParams.status, page, list: searchParams.list }),
  ]);
  const departments = allDepartments.filter((d) => access.allDepartments || access.departmentIds.includes(d.id)).map(({ id, name }) => ({ id, name }));
  const current = unassigned ? null : lists.find((l) => l.id === searchParams.list) ?? null;
  // A link to a list that was deleted: fall back to everyone instead of showing an empty page.
  if (searchParams.list && !unassigned && !current) redirect("/app/contacts");
  const listParam = current ? current.id : unassigned ? "none" : undefined;

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
          <div className="flex flex-nowrap justify-end gap-2 sm:gap-3">
            <ExportContactsButton lists={lists.map(({ id, name, count }) => ({ id, name, count }))} total={totalContacts} defaultListId={current?.id} />
            {manage ? (
              <>
                <ImportContactsButton lists={lists.map(({ id, name }) => ({ id, name }))} defaultListId={current?.id} initialOpen={searchParams.import === "1"} />
                <AddContactsButton lists={lists.map(({ id, name }) => ({ id, name }))} defaultListId={current?.id} />
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ListsRail lists={lists} total={totalContacts} currentId={current?.id ?? null} unassigned={unassigned} departments={departments} orgWideAllowed={orgWideAllowed} canCreate={manage} />

        <div className="min-w-0 space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-mist p-4">
            <form className="flex min-w-0 flex-1 flex-wrap items-center gap-3" action="/app/contacts">
              {listParam ? <input type="hidden" name="list" value={listParam} /> : null}
              <Input name="q" defaultValue={searchParams.q} type="search" placeholder="Search by name or email" aria-label="Search contacts" className="basis-full sm:max-w-xs sm:basis-60" />
              <Select name="status" defaultValue={searchParams.status ?? ""} aria-label="Filter by status" className="min-w-0 flex-1 sm:max-w-[180px] sm:flex-none">
                <option value="">All statuses</option>
                {["subscribed", "unsubscribed", "bounced", "complained", "cleaned"].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </Select>
              <Button type="submit" variant="outline" className="ml-auto">Filter</Button>
            </form>
            {current ? <ListSettingsButton list={current} signupUrl={`${siteConfig.url}/subscribe/${current.id}`} className="ml-auto" /> : null}
            </div>

            <ContactsTable rows={rows} lists={lists} current={current ? { id: current.id, name: current.name } : null} emptyMessage={emptyMessage} canEmail={can(ctx?.access, "inbox.reply")} />

            {pages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-mist px-4 py-3 text-sm text-ink-muted sm:px-6">
                <span>Page {page} of {pages} ({total.toLocaleString("en-US")} contacts)</span>
                <span className="ml-auto flex gap-4">
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