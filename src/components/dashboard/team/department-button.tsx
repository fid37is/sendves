// src/components/dashboard/team/department-button.tsx
"use client";

import { useState } from "react";
import { Building2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormDrawer, useDrawerForm } from "@/components/dashboard/team/form-drawer";
import { createDepartmentAction, updateDepartmentAction } from "@/app/(dashboard)/app/team/actions";

/** Creates a department, or edits one when `department` is given. The form is in a drawer. */
export function DepartmentButton({ department }: { department?: { id: string; name: string; description: string } }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const editing = Boolean(department);
  const { pending, onSubmit } = useDrawerForm(editing ? updateDepartmentAction : createDepartmentAction, close);

  return (
    <>
      {editing ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Edit ${department!.name}`}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New department
        </Button>
      )}
      <FormDrawer
        open={open}
        onClose={close}
        title={editing ? "Edit department" : "New department"}
        icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
        submitLabel={editing ? "Save" : "Create department"}
        pending={pending}
        onSubmit={onSubmit}
      >
        {department ? <input type="hidden" name="id" value={department.id} /> : null}
        <Field label="Name" htmlFor="dept-name">
          <Input id="dept-name" name="name" defaultValue={department?.name} required maxLength={60} autoComplete="off" placeholder="Sales" />
        </Field>
        <Field label="Description" htmlFor="dept-desc" hint="Optional.">
          <Input id="dept-desc" name="description" defaultValue={department?.description} maxLength={200} autoComplete="off" />
        </Field>
      </FormDrawer>
    </>
  );
}
