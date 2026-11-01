import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/submit-button";
import { getPlatformSettings } from "@/lib/queries";
import { savePlatformSettingsAction } from "../actions";

export const metadata: Metadata = { title: "Admin settings" };

function Toggle({ name, label, hint, defaultChecked, danger }: { name: string; label: string; hint: string; defaultChecked: boolean; danger?: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm text-ink">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-4 w-4 rounded border-mist" />
      <span>
        <span className={danger ? "font-semibold text-danger" : "font-semibold"}>{label}</span>
        <span className="block text-xs text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}

export default async function AdminSettingsPage() {
  const s = await getPlatformSettings();
  return (
    <>
      <PageHeader title="Platform settings" description="Rules that protect sender reputation and control how new accounts start. One Save applies everything on this page." />
      <form action={savePlatformSettingsAction} className="grid max-w-2xl gap-6">
        {s.sending_paused ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            All sending is paused. Nothing is leaving the platform, and queued mail waits until you switch it back on below.
          </p>
        ) : null}

        <Card>
          <CardHeader title="Automatic enforcement" description="Checked by the worker after every pass. The worker (or the cron call to /api/cron/tick) has to be running for this to apply." />
          <div className="space-y-5 p-6">
            <Field label="Pause a sending campaign at bounce rate (%)" htmlFor="bounce"><Input id="bounce" name="bounce" type="number" step="0.1" min={0.1} max={50} defaultValue={s.pause_bounce_pct} /></Field>
            <Field label="Pause a sending campaign at complaint rate (%)" htmlFor="complaint"><Input id="complaint" name="complaint" type="number" step="0.01" min={0.01} max={10} defaultValue={s.pause_complaint_pct} /></Field>
            <Field label="Suspend the workspace at complaint rate (%)" htmlFor="suspend" hint="Stops all sending for the workspace. Must not be lower than the pause rate."><Input id="suspend" name="suspend" type="number" step="0.01" min={0.01} max={10} defaultValue={s.suspend_complaint_pct} /></Field>
            <Field label="Minimum sends before a campaign is judged" htmlFor="sample" hint="Below this, a handful of bounces can’t trigger anything."><Input id="sample" name="sample" type="number" min={1} defaultValue={s.health_min_sample} /></Field>
            <Field label="Keep judging finished campaigns for (hours)" htmlFor="window" hint="Complaints and bounces arrive after the mail is delivered. A finished campaign that breaches a limit moves its workspace to review (pause rates) or suspends it (complaint suspension rate). Each campaign triggers an action once, so reinstating a workspace sticks.">
              <Input id="window" name="window" type="number" min={1} max={720} defaultValue={s.health_window_hours} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="New workspaces" description="How accounts start. Existing workspaces keep their current values." />
          <div className="space-y-5 p-6">
            <Toggle name="review" label="Check each new workspace’s first campaign" hint="New workspaces start in review: their first campaign waits in Campaign review until you approve it, which also takes the workspace out of review. Turn off to let new accounts send straight away." defaultChecked={s.review_new_workspaces} />
            <Field label="Daily send limit" htmlFor="daily"><Input id="daily" name="daily" type="number" min={1} defaultValue={s.new_workspace_daily_limit} /></Field>
            <Field label="Contact limit" htmlFor="max"><Input id="max" name="max" type="number" min={1} defaultValue={s.new_workspace_max_contacts} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Platform controls" />
          <div className="space-y-5 p-6">
            <Toggle name="signups" label="Allow new sign-ups" hint="Turn off to close registration. People invited to an organization can still join." defaultChecked={s.signups_open} />
            <Toggle name="paused" label="Pause all sending" hint="Emergency stop for the whole platform. Queued mail stays queued and goes out when you switch it off." defaultChecked={s.sending_paused} danger />
          </div>
        </Card>

        <div><ActionButton>Save settings</ActionButton></div>
      </form>
    </>
  );
}
