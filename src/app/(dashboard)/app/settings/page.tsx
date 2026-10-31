import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { SearchParams } from "@/types";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { getContext } from "@/lib/workspace";
import { can, ROLE_LABEL } from "@/lib/access";
import { updateProfileAction, updateWorkspaceAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  const ws = ctx?.workspace;
  const editWorkspace = can(ctx?.access, "org.settings");
  return (
    <>
      <PageHeader title="Settings" description="Your profile and workspace details." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <form action={updateProfileAction} className="space-y-5 p-6">
            <Field label="Full name" htmlFor="fullName"><Input id="fullName" name="fullName" defaultValue={ctx?.user.fullName} /></Field>
            <Field label="Email address" htmlFor="email" hint="Used to sign in and to recover your account."><Input id="email" type="email" defaultValue={ctx?.user.email} readOnly /></Field>
            <Button type="submit">Save profile</Button>
          </form>
        </Card>
        {editWorkspace ? (
        <Card>
          <CardHeader title="Workspace" description="Appears in the footer of every campaign." />
          <form action={updateWorkspaceAction} className="space-y-5 p-6">
            <Field label="Business name" htmlFor="business"><Input id="business" name="business" defaultValue={ws?.name} /></Field>
            <Field label="Physical address" htmlFor="address" hint="Required by anti-spam laws. Shown in every email footer."><Input id="address" name="address" defaultValue={ws?.business_address ?? ""} /></Field>
            <Field label="Time zone" htmlFor="tz">
              <Select id="tz" name="tz" defaultValue={ws?.timezone ?? "Africa/Lagos"}>
                {["Africa/Lagos", "UTC", "Europe/London", "America/New_York"].map((z) => <option key={z} value={z}>{z}</option>)}
              </Select>
            </Field>
            <label className="flex items-start gap-3 text-sm text-ink-soft">
              <input type="checkbox" name="trackOpens" defaultChecked={ws?.track_opens ?? true} className="mt-0.5 h-4 w-4 accent-brand-700" />
              Track opens. Opens are unreliable because mail apps can hide them; click tracking stays on either way.
            </label>
            <Button type="submit">Save workspace</Button>
          </form>
        </Card>
        ) : (
          <Card>
            <CardHeader title="Organization" description="Only an owner can change organization settings." />
            <dl className="space-y-3 p-6 text-sm">
              <div><dt className="font-semibold text-ink">Business name</dt><dd className="text-ink-soft">{ws?.name}</dd></div>
              <div><dt className="font-semibold text-ink">Your role</dt><dd className="text-ink-soft">{ctx?.access ? ROLE_LABEL[ctx.access.role] : "-"}</dd></div>
            </dl>
          </Card>
        )}
      </div>
    </>
  );
}
