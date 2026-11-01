import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/submit-button";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./forms";
import { resetAuthenticatorAction, signOutOtherDevicesAction, updateProfileAction } from "./actions";

export const metadata: Metadata = { title: "My account" };

export default async function AdminAccountPage() {
  const user = await requireAdmin();
  const { data } = await createClient().auth.mfa.listFactors();
  const authenticators = data?.totp ?? [];
  return (
    <>
      <PageHeader title="My account" description="Your own sign-in details for this console." />
      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader title="Profile" />
          <form action={updateProfileAction} className="space-y-5 p-6">
            <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={user.fullName} maxLength={80} required /></Field>
            <Field label="Email address" htmlFor="email" hint="Your sign-in. To change it, add the new address as an admin and remove this one."><Input id="email" value={user.email} disabled readOnly /></Field>
            <ActionButton>Save name</ActionButton>
          </form>
        </Card>

        <Card>
          <CardHeader title="Password" description="Changing it signs you out of your other devices." />
          <ChangePasswordForm />
        </Card>

        <Card>
          <CardHeader title="Security" />
          <div className="divide-y divide-mist">
            <div className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <p className="font-semibold text-ink">Authenticator app</p>
                <p className="mt-1 text-sm text-ink-muted">{authenticators.length ? "Two-factor sign-in is on." : "Not set up. You’ll be asked to set it up at your next sign-in."}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={authenticators.length ? "success" : "warning"}>{authenticators.length ? "On" : "Off"}</Badge>
                {authenticators.length ? (
                  <ConfirmSubmitButton action={resetAuthenticatorAction} variant="outline" size="sm"
                    confirm={{ title: "Replace your authenticator app?", description: "This removes the current one and signs you out. At your next sign-in you’ll scan a new QR code. Have your phone ready.", confirmLabel: "Remove and sign out", tone: "danger" }}>
                    Replace
                  </ConfirmSubmitButton>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <p className="font-semibold text-ink">Other devices</p>
                <p className="mt-1 text-sm text-ink-muted">Sign out everywhere except this browser, for example after using a shared computer.</p>
              </div>
              <form action={signOutOtherDevicesAction}><ActionButton variant="outline" size="sm">Sign out other devices</ActionButton></form>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
