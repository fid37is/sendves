import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { getPlatformSettings } from "@/lib/queries";
import { savePlatformSettingsAction } from "../actions";

export const metadata: Metadata = { title: "Admin settings" };

export default async function AdminSettingsPage() {
  const s = await getPlatformSettings();
  return (
    <>
      <PageHeader title="Platform settings" description="Thresholds that protect sender reputation." />
      <Card className="max-w-2xl">
        <CardHeader title="Automatic enforcement" description="Checked by the worker after every pass, once a campaign has at least 50 sends." />
        <form action={savePlatformSettingsAction} className="space-y-5 p-6">
          <Field label="Pause campaign at bounce rate (%)" htmlFor="bounce"><Input id="bounce" name="bounce" type="number" step="0.1" defaultValue={s.pause_bounce_pct} /></Field>
          <Field label="Pause campaign at complaint rate (%)" htmlFor="complaint"><Input id="complaint" name="complaint" type="number" step="0.01" defaultValue={s.pause_complaint_pct} /></Field>
          <Field label="Suspend workspace at complaint rate (%)" htmlFor="suspend"><Input id="suspend" name="suspend" type="number" step="0.01" defaultValue={s.suspend_complaint_pct} /></Field>
          <Field label="New workspace daily send limit" htmlFor="daily" hint="Applies to workspaces created after you save."><Input id="daily" name="daily" type="number" defaultValue={s.new_workspace_daily_limit} /></Field>
          <Field label="New workspace contact limit" htmlFor="max"><Input id="max" name="max" type="number" defaultValue={s.new_workspace_max_contacts} /></Field>
          <Button type="submit">Save settings</Button>
        </form>
      </Card>
    </>
  );
}
