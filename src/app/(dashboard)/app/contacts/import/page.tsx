import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { NoAccess } from "@/components/dashboard/no-access";
import { can } from "@/lib/access";
import { getListsOverview } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import type { SearchParams } from "@/types";
import { importContactsAction } from "../actions";

export const metadata: Metadata = { title: "Import contacts" };

export default async function ImportContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  if (!can(ctx?.access, "contacts.manage")) return <NoAccess title="Import contacts" what="importing contacts" />;
  const { lists } = await getListsOverview(ctx!);
  const preset = lists.some((l) => l.id === searchParams.list) ? searchParams.list : "";

  return (
    <>
      <PageHeader
        title="Import contacts"
        description="Upload a CSV file. People who already exist are skipped, and previously bounced, unsubscribed or reported addresses are never imported."
      />
      <Card className="max-w-2xl">
        <CardHeader title="CSV file" description="One row per person, with a header row. Needs an email column; first_name and last_name are optional." />
        <form action={importContactsAction} className="space-y-5 p-6">
          <Field label="File" htmlFor="file" hint="CSV, up to 5 MB. Every other column (company, plan…) is saved on the contact and can be used in emails as {{company}}.">
            <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Add to list" htmlFor="listId">
              <Select id="listId" name="listId" defaultValue={preset}>
                <option value="">No list</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="Or a new list" htmlFor="newList" hint="Overrides the list on the left.">
              <Input id="newList" name="newList" maxLength={80} placeholder="Spring event" />
            </Field>
          </div>
          <label className="flex items-start gap-3 text-sm text-ink-soft">
            <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-brand-700" />
            <span>These people gave me permission to email them.</span>
          </label>
          <Button type="submit"><Upload className="h-4 w-4" aria-hidden="true" />Import contacts</Button>
        </form>
      </Card>
    </>
  );
}
