// src/components/dashboard/team/edit-member-button.tsx
"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { FormDrawer, useDrawerForm } from "@/components/dashboard/team/form-drawer";
import { DepartmentChecks, type DepartmentOption } from "@/components/dashboard/team/add-member-button";
import { updateMemberAction } from "@/app/(dashboard)/app/team/actions";

/** Change a member's role and departments, from a drawer. */
export function EditMemberButton({
  userId, name, role, roles, departments, selectedDepartmentIds,
}: {
  userId: string;
  name: string;
  role: string;
  roles: { value: string; label: string }[];
  departments: DepartmentOption[];
  selectedDepartmentIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { pending, onSubmit } = useDrawerForm(updateMemberAction, close);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Edit
      </Button>
      <FormDrawer
        open={open}
        onClose={close}
        title="Edit member"
        description={name}
        icon={<Pencil className="h-5 w-5" aria-hidden="true" />}
        submitLabel="Save changes"
        pending={pending}
        onSubmit={onSubmit}
      >
        <input type="hidden" name="userId" value={userId} />
        <Field label="Role" htmlFor="member-role">
          <Select id="member-role" name="role" defaultValue={role}>
            {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
        {departments.length > 0 ? <DepartmentChecks departments={departments} selected={selectedDepartmentIds} /> : null}
      </FormDrawer>
    </>
  );
}
