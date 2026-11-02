import type { Metadata } from "next";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsLayout, SettingsSection, type SettingsNavItem } from "@/components/ui/settings-layout";
import { ActionButton } from "@/components/ui/submit-button";
import { FormActions } from "@/components/ui/form-actions";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { PageToasts, type ToastKind } from "@/components/ui/toast";
import { requireAdmin } from "@/lib/auth/admin";
import { getAdminAccounts, getPlatformSettings } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { addAdminAction, changeOwnPasswordAction, removeAdminAction, savePlatformSettingsAction, signOutOtherSessionsAction } from "../actions";

export const metadata: Metadata = { title: "Admin settings" };

/** A labelled on/off switch inside a form. Unchecked boxes aren't submitted, so the action treats "absent" as off. */
function Toggle({ name, label, description, defaultChecked }: { name: string; label: string; description: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-mist p-4 transition-colors hover:bg-mist-50">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-700" />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-sm text-ink-muted">{description}</span>
      </span>
    </label>
  );
}

export default async function AdminSettingsPage() {
  const [s, me, admins, factorsRes] = await Promise.all([
    getPlatformSettings(),
    requireAdmin(),
    getAdminAccounts(),
    createClient().auth.mfa.listFactors(),
  ]);
  const factors = factorsRes.data?.totp ?? [];

  const toasts: { id: string; kind: ToastKind; message: string }[] = s.sending_paused
    ? [{ id: `paused-${s.sending_paused}`, kind: "warning", message: "Sending is paused for the whole platform. Nothing is being delivered." }]
    : [];

  const sections: SettingsNavItem[] = [
    { id: "enforcement", label: "Enforcement", hint: "Pause and thresholds" },
    { id: "signups", label: "Sign-ups & review", hint: "Access and defaults" },
    { id: "admins", label: "Admins", hint: "Who runs the console" },
    { id: "account", label: "My account", hint: "Password and sessions" },
  ];

  return (
    <>
      <PageToasts toasts={toasts} />
      <PageHeader title="Settings" description="How the platform protects itself, who can sign up, who runs the console, and your own account." />
      <SettingsLayout sections={sections}>
        {/* ── Enforcement ───────────────────────────────────────────── */}
        <SettingsSection id="enforcement" title="Enforcement" description="An emergency stop, and the limits the worker uses to pause or suspend senders automatically.">
          <form action={savePlatformSettingsAction} className="grid gap-6">
            <input type="hidden" name="section" value="enforcement" />
            <Card>
              <CardHeader title="Pause all sending" description="Everything stays queued and resumes when you turn this off." />
              <div className="p-6">
                <Toggle name="sendingPaused" label="Pause sending for every workspace" description="Use during an incident or a provider problem. Scheduled campaigns wait; nothing is lost." defaultChecked={s.sending_paused} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Automatic enforcement" description="Checked by the worker on every pass." />
              <div className="space-y-5 p-6">
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Pause at bounce rate (%)" htmlFor="bounce"><Input id="bounce" name="bounce" type="number" step="0.1" min="0.1" max="50" defaultValue={s.pause_bounce_pct} /></Field>
                  <Field label="Pause at complaint rate (%)" htmlFor="complaint"><Input id="complaint" name="complaint" type="number" step="0.01" min="0.01" max="10" defaultValue={s.pause_complaint_pct} /></Field>
                  <Field label="Suspend at complaint rate (%)" htmlFor="suspend"><Input id="suspend" name="suspend" type="number" step="0.01" min="0.01" max="10" defaultValue={s.suspend_complaint_pct} /></Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Minimum emails before a rate counts" htmlFor="minSample" hint="Stops 1 bounce in 10 emails from tripping a pause."><Input id="minSample" name="minSample" type="number" min="5" max="10000" defaultValue={s.health_min_sample} /></Field>
                  <Field label="Rolling window (days)" htmlFor="windowDays" hint="How far back a workspace’s rates are measured."><Input id="windowDays" name="windowDays" type="number" min="1" max="30" defaultValue={s.window_days} /></Field>
                </div>
                <div className="rounded-xl bg-mist-50 p-4 text-sm text-ink-soft">
                  <p className="font-semibold text-ink">What happens</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>A campaign that is sending is paused when its own bounce or complaint rate passes the pause limit.</li>
                    <li>Each workspace is also judged over the rolling window, even after its campaigns finish, because bounces and complaints arrive later. Over a pause limit, everything it is sending is paused. Over the suspend limit, the workspace is suspended.</li>
                    <li>The customer sees the reason on the paused campaign, and every automatic action is logged under Abuse.</li>
                  </ul>
                </div>
                <FormActions><ActionButton requireChange mobileLabel="Update">Save enforcement settings</ActionButton></FormActions>
              </div>
            </Card>
          </form>
        </SettingsSection>

        {/* ── Sign-ups & review ─────────────────────────────────────── */}
        <SettingsSection id="signups" title="Sign-ups & review" description="Who can create an account, whether new workspaces are reviewed, and the limits they start with.">
          <form action={savePlatformSettingsAction} className="grid gap-6">
            <input type="hidden" name="section" value="signups" />
            <Card>
              <CardHeader title="Sign-ups" />
              <div className="space-y-4 p-6">
                <Toggle name="registrationsOpen" label="Allow new sign-ups" description="Turn off to stop new accounts being created. Existing customers and invited team members are not affected." defaultChecked={s.registrations_open} />
                <Toggle name="requireReview" label="Review new workspaces before they can send" description="A new workspace starts in review: its first campaign waits in the Review queue. Approving that campaign, or approving the workspace itself, moves it to Active." defaultChecked={s.require_review} />
                <Field label="Blocked email domains" htmlFor="blocked" hint="One per line or comma separated, for example mailinator.com. People with these domains can’t register.">
                  <Textarea id="blocked" name="blocked" rows={4} defaultValue={(s.blocked_email_domains ?? []).join("\n")} />
                </Field>
              </div>
            </Card>
            <Card>
              <CardHeader title="New workspace defaults" description="Applies to workspaces created after you save. Paid plans set their own limits." />
              <div className="space-y-5 p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Daily send limit" htmlFor="daily"><Input id="daily" name="daily" type="number" min="1" defaultValue={s.new_workspace_daily_limit} /></Field>
                  <Field label="Contact limit" htmlFor="max"><Input id="max" name="max" type="number" min="1" defaultValue={s.new_workspace_max_contacts} /></Field>
                </div>
                <FormActions><ActionButton requireChange mobileLabel="Update">Save sign-up settings</ActionButton></FormActions>
              </div>
            </Card>
          </form>
        </SettingsSection>

        {/* ── Admins ────────────────────────────────────────────────── */}
        <SettingsSection id="admins" title="Admins" description="Staff who can open this console. Admins are separate from customers and never get a workspace.">
          <Card>
            <CardHeader title="Platform admins" />
            <Table>
              <thead><tr><TH>Admin</TH><TH>Two-factor</TH><TH>Last active</TH><TH className="w-28"><span className="sr-only">Actions</span></TH></tr></thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <TD><span className="font-semibold text-ink">{a.name !== "-" ? a.name : a.email}</span>{a.self ? <span className="ml-2"><Badge tone="brand">You</Badge></span> : null}<p className="text-xs text-ink-muted">{a.email}</p></TD>
                    <TD>{a.mfa ? <Badge tone="success">On</Badge> : <Badge tone="warning">Not set up</Badge>}</TD>
                    <TD className="whitespace-nowrap">{a.lastSeen}</TD>
                    <TD className="text-right">
                      {a.self ? null : (
                        <ConfirmSubmitButton action={removeAdminAction} fields={{ id: a.id }} variant="outline" size="sm"
                          confirm={{ title: `Remove ${a.name !== "-" ? a.name : a.email}?`, description: "They can no longer open the console. Their account stays but has no admin access.", confirmLabel: "Remove admin", tone: "danger" }}>
                          Remove
                        </ConfirmSubmitButton>
                      )}
                    </TD>
                  </tr>
                ))}
                {admins.length === 0 ? <EmptyRow cols={4} message="No admins." /> : null}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Add an admin" description="They get an email to set their password, then set up an authenticator app on first sign-in. Use an email that isn’t already a customer account." />
            <form action={addAdminAction} className="space-y-5 p-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Full name" htmlFor="name"><Input id="name" name="name" required autoComplete="off" /></Field>
                <Field label="Email" htmlFor="adminEmail"><Input id="adminEmail" name="email" type="email" required autoComplete="off" /></Field>
              </div>
              <FormActions><ActionButton mobileLabel="Save">Add admin</ActionButton></FormActions>
            </form>
          </Card>
        </SettingsSection>

        {/* ── My account ────────────────────────────────────────────── */}
        <SettingsSection id="account" title="My account" description="Your own sign-in details. Only you see these.">
          <Card>
            <CardHeader title="Two-factor authentication" description={me.email} />
            <div className="flex items-center gap-3 p-6 text-sm">
              {factors.length ? <ShieldCheck className="h-5 w-5 text-success" aria-hidden="true" /> : <ShieldAlert className="h-5 w-5 text-warning" aria-hidden="true" />}
              <span className="text-ink">{factors.length ? "Two-factor authentication is on. You’ll be asked for a code each time you sign in." : "Two-factor authentication isn’t set up for this account."}</span>
            </div>
          </Card>
          <Card>
            <CardHeader title="Change password" description="Use at least 12 characters. Your other sessions are signed out when it changes." />
            <form action={changeOwnPasswordAction} className="space-y-5 p-6">
              <Field label="Current password" htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" required /></Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="New password" htmlFor="next"><Input id="next" name="next" type="password" autoComplete="new-password" minLength={12} required /></Field>
                <Field label="Confirm new password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required /></Field>
              </div>
              <FormActions><ActionButton mobileLabel="Update">Change password</ActionButton></FormActions>
            </form>
          </Card>
          <Card>
            <CardHeader title="Sessions" description="Signed in somewhere you don’t use any more? Sign out everywhere except this browser." />
            <form action={signOutOtherSessionsAction} className="p-6"><FormActions><ActionButton variant="outline">Sign out other sessions</ActionButton></FormActions></form>
          </Card>
        </SettingsSection>
      </SettingsLayout>
    </>
  );
}