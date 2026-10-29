import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { SearchParams } from "@/types";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { siteConfig } from "@/config/site";
import { getLists } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { createListAction } from "../contacts/actions";

export const metadata: Metadata = { title: "Lists" };

export default async function ListsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  const lists = await getLists(ctx!);
  return (
    <>
      <PageHeader title="Lists" description="Group contacts so you can send each campaign to the right people." />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <Table>
            <thead><tr><TH>List</TH><TH>Contacts</TH><TH>Public signup page</TH></tr></thead>
            <tbody>
              {lists.map((l) => (
                <tr key={l.id}>
                  <TD className="font-semibold text-ink">{l.name}</TD>
                  <TD>{l.count.toLocaleString("en-US")}</TD>
                  <TD className="break-all font-mono text-xs">{siteConfig.url}/subscribe/{l.id}</TD>
                </tr>
              ))}
              {lists.length === 0 ? <EmptyRow cols={3} message="No lists yet. Create one, or add a list while importing." /> : null}
            </tbody>
          </Table>
        </Card>
        <Card className="h-fit">
          <CardHeader title="New list" />
          <form action={createListAction} className="space-y-5 p-6">
            <Field label="List name" htmlFor="name"><Input id="name" name="name" required /></Field>
            <Button type="submit">Create list</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
