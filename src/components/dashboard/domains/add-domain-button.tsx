// src/components/dashboard/domains/add-domain-button.tsx
"use client";

import { useState } from "react";
import { Globe, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormDrawer, useDrawerForm } from "@/components/dashboard/team/form-drawer";
import { addDomainAction } from "@/app/(dashboard)/app/domains/actions";

/** "Add domain" in the page header: the form lives in a drawer, and the new domain opens on success. */
export function AddDomainButton() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { pending, onSubmit } = useDrawerForm(addDomainAction, close);

  return (
    <>
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add domain
      </Button>
      <FormDrawer
        open={open}
        onClose={close}
        title="Add domain"
        icon={<Globe className="h-5 w-5" aria-hidden="true" />}
        submitLabel="Add domain"
        pending={pending}
        onSubmit={onSubmit}
      >
        <Field label="Domain" htmlFor="domain" hint="A domain you own, not a free email domain like gmail.com.">
          <Input id="domain" name="domain" placeholder="example.com" required autoComplete="off" />
        </Field>
      </FormDrawer>
    </>
  );
}
