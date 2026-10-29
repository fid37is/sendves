import type { Metadata } from "next";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { SearchParams } from "@/types";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { starterTemplates } from "@/config/starter-templates";
import { createCampaignAction } from "../actions";

export const metadata: Metadata = { title: "New campaign" };

export default function NewCampaignPage({ searchParams }: { searchParams: SearchParams }) {
  const selected = starterTemplates.some((t) => t.id === searchParams.template) ? searchParams.template : "blank";
  return (
    <>
      <PageHeader title="New campaign" description="Name it and pick a starting point. You’ll set the subject, audience and content next." />
      <Card className="max-w-3xl">
        <CardHeader title="Start" />
        <form action={createCampaignAction} className="space-y-6 p-6">
          <Field label="Campaign name" htmlFor="name" hint="Only you see this."><Input id="name" name="name" placeholder="October newsletter" required /></Field>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-ink">Starting point</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {starterTemplates.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-mist p-4 hover:border-brand-500 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50">
                  <input type="radio" name="template" value={t.id} defaultChecked={t.id === selected} className="mt-1 accent-brand-700" />
                  <span><span className="block text-sm font-bold text-ink">{t.name}</span><span className="block text-sm text-ink-muted">{t.description}</span></span>
                </label>
              ))}
            </div>
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
