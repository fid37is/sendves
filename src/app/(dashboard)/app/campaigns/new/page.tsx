import type { Metadata } from "next";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { SearchParams } from "@/types";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { BUILT_IN_TEMPLATES } from "@/lib/email/campaign";
import { getTemplates } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { can } from "@/lib/access";
import { NoAccess } from "@/components/dashboard/no-access";
import { TemplatePicker, type PickerOption } from "@/components/dashboard/template-picker";
import { createCampaignAction } from "../actions";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  if (!can(ctx?.access, "campaigns.manage")) return <NoAccess title="New campaign" what="creating campaigns" />;
  const mine = ctx ? await getTemplates(ctx) : [];
  const options: PickerOption[] = [
    // The same templates as the editor's "Change template" tab (and the Templates page), plus your own.
    ...BUILT_IN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, group: "builtin" as const })),
    ...mine.map((t) => ({ id: t.id, name: t.name, description: t.description || "Your template", group: "mine" as const })),
  ];
  const selected = options.some((t) => t.id === searchParams.template) ? String(searchParams.template) : "blank";
  return (
    <>
      <PageHeader title="New campaign" description="Name it and pick a starting point. You’ll set the subject, audience and content next." />
      <Card className="max-w-3xl">
        <CardHeader title="Start" />
        <form action={createCampaignAction} className="space-y-6 p-6">
          <Field label="Campaign name" htmlFor="name" hint="Only you see this."><Input id="name" name="name" placeholder="October newsletter" required /></Field>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-ink">Starting point</legend>
            <TemplatePicker options={options} selected={selected} />
          </fieldset>
          <div className="flex gap-3">
            <Button type="submit">Create campaign</Button>
            <ButtonLink href="/app/campaigns" variant="outline">Cancel</ButtonLink>
          </div>
        </form>
      </Card>
    </>
  );
}
