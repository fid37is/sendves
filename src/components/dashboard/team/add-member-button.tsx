// src/components/dashboard/team/add-member-button.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormDrawer, useDrawerForm } from "@/components/dashboard/team/form-drawer";
import { inviteMemberAction } from "@/app/(dashboard)/app/team/actions";

export type DepartmentOption = { id: string; name: string; assignable: boolean };

/** "Add member" in the page header: the invitation form lives in a drawer. */
export function AddMemberButton({
  domains, roles, departments,
}: {
  domains: { id: string; domain: string }[];
  roles: { value: string; label: string }[];
  departments: DepartmentOption[];
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { pending, onSubmit } = useDrawerForm(inviteMemberAction, close);
  const noDomain = domains.length === 0;

  return (
    <>
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add member
      </Button>

      <FormDrawer
        open={open}
        onClose={close}
        title="Add team member"
        description="They get an invitation at their personal email."
        icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
        submitLabel="Send invitation"
        pending={pending}
        onSubmit={onSubmit}
        hideFooter={noDomain}
      >
        {noDomain ? (
          <p className="rounded-xl bg-mist-50 p-4 text-sm text-ink-soft">
            Company emails are created on a verified domain.{" "}
            <Link href="/app/domains" className="font-semibold text-brand-800 hover:underline">Verify a sending domain</Link> first.
          </p>
        ) : (
          <>
            <Field label="Full name" htmlFor="invite-name">
              <Input id="invite-name" name="fullName" required maxLength={80} autoComplete="off" />
            </Field>
            <Field label="Personal email" htmlFor="invite-email" hint="Receives the invitation. Not used to sign in.">
              <Input id="invite-email" name="contactEmail" type="email" required maxLength={254} autoComplete="off" />
            </Field>
            <div>
              <label htmlFor="invite-local" className="mb-1.5 block text-sm font-semibold text-ink">Company email</label>
              <div className="flex items-center gap-2">
                <Input id="invite-local" name="localPart" placeholder="jon" maxLength={64} required className="min-w-0" autoComplete="off" />
                <span className="text-ink-muted">@</span>
                {domains.length === 1 ? (
                  <>
                    <input type="hidden" name="domainId" value={domains[0].id} />
                    <span className="shrink-0 text-sm font-medium text-ink">{domains[0].domain}</span>
                  </>
                ) : (
                  <Select name="domainId" aria-label="Domain" className="min-w-0">
                    {domains.map((d) => <option key={d.id} value={d.id}>{d.domain}</option>)}
                  </Select>
                )}
              </div>
            </div>
            <Field label="Role" htmlFor="invite-role">
              <Select id="invite-role" name="role" defaultValue={roles.find((r) => r.value === "marketing")?.value ?? roles[0]?.value}>
                {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </Field>
            {departments.length > 0 ? <DepartmentChecks departments={departments} /> : null}
          </>
        )}
      </FormDrawer>
    </>
  );
}

export function DepartmentChecks({ departments, selected = [] }: { departments: DepartmentOption[]; selected?: string[] }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">Departments</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2.5">
        {departments.map((d) => (
          <label key={d.id} className={`flex items-center gap-2 text-sm ${d.assignable ? "text-ink-soft" : "text-ink-muted"}`}>
            <input type="checkbox" name="departmentIds" value={d.id} defaultChecked={selected.includes(d.id)} disabled={!d.assignable} className="h-4 w-4 accent-brand-700" />
            {d.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
