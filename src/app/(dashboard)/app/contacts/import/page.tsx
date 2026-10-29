import type { Metadata } from "next";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { SearchParams } from "@/types";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { getLists } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { importContactsAction } from "../actions";

export const metadata: Metadata = { title: "Import contacts" };

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  const lists = await getLists(ctx!);
  return (
    <>
      <PageHeader title="Import contacts" description="Upload a CSV with a column named “email”. Optional columns: first_name, last_name (or name)." />
      <Card className="max-w-2xl">
        <CardHeader title="CSV file" description="Up to 5 MB and 50,000 rows. Duplicates, invalid and disposable addresses are removed automatically." />
        <form action={importContactsAction} className="space-y-5 p-6">
          <Field label="File" htmlFor="file"><Input id="file" name="file" type="file" accept=".csv,text/csv" required className="h-auto py-2.5" /></Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Add to an existing list" htmlFor="listId">
              <Select id="listId" name="listId" defaultValue=""><option value="">No list</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
            </Field>
            <Field label="Or create a new list" htmlFor="newList"><Input id="newList" name="newList" placeholder="Newsletter" /></Field>
          </div>
          <label className="flex items-start gap-3 rounded-xl bg-mist-50 p-4 text-sm text-ink-soft">
            <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4 accent-brand-700" required />
            I confirm that everyone in this file gave me permission to email them, and that this list was not bought, rented or scraped.
          </label>
          <div className="flex gap-3">
            <Button type="submit">Import contacts</Button>
            <ButtonLink href="/app/contacts" variant="outline">Cancel</ButtonLink>
          </div>
        </form>
      </Card>
    </>
  );
}
