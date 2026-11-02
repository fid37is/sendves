// src/components/dashboard/import-contacts-drawer.tsx
"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Drawer } from "@/components/dashboard/drawer";
import { importContactsAction } from "@/app/(dashboard)/app/contacts/actions";

/**
 * Import a CSV in a right-side drawer, on the Contacts page. A failure (wrong file, no consent, over the limit)
 * leaves the drawer open with the reason; a success closes it and refreshes the list.
 */
export function ImportContactsButton({ lists, defaultListId, initialOpen = false }: { lists: { id: string; name: string }[]; defaultListId?: string; initialOpen?: boolean }) {
  const router = useRouter();
  const uid = useId();
  const formId = `${uid}-import`;
  const [open, setOpen] = useState(initialOpen);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const data = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const result = await importContactsAction(data);
      if (!result.ok) {
        toast.error(result.error ?? "Couldn’t import that file.");
        return;
      }
      toast.success(result.message ?? "Contacts imported.");
      setOpen(false);
      if (result.listId && result.listId !== defaultListId) router.push(`/app/contacts?list=${result.listId}`);
      else router.refresh();
    } catch (err) {
      toast.fail("Couldn’t import that file. Try again.", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" className="whitespace-nowrap max-sm:px-3" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Upload className="h-4 w-4" aria-hidden="true" />
        Import CSV
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Import contacts"
        description="Upload a CSV file. People who already exist are skipped, and previously bounced, unsubscribed or reported addresses are never imported."
        icon={<Upload className="h-5 w-5" aria-hidden="true" />}
        busy={saving}
        widthClass="max-w-[30rem]"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form={formId} loading={saving}>Import contacts</Button>
          </div>
        }
      >
        <form id={formId} onSubmit={onSubmit} className="space-y-5">
          <Field label="CSV file" htmlFor={`${uid}-file`} hint="One row per person, with a header row and an email column. first_name and last_name are optional. Up to 5 MB. Every other column (company, plan…) is saved on the contact and can be used in emails as {{company}}.">
            <Input id={`${uid}-file`} name="file" type="file" accept=".csv,text/csv" required />
          </Field>
          <Field label="Add to list" htmlFor={`${uid}-list`}>
            <Select id={`${uid}-list`} name="listId" defaultValue={defaultListId ?? ""}>
              <option value="">No list</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Or a new list" htmlFor={`${uid}-new`} hint="Overrides the list above.">
            <Input id={`${uid}-new`} name="newList" maxLength={80} placeholder="Spring event" />
          </Field>
          <label className="flex items-start gap-3 text-sm text-ink-soft">
            <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-brand-700" />
            <span>These people gave me permission to email them.</span>
          </label>
        </form>
      </Drawer>
    </>
  );
}