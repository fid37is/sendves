// src/components/dashboard/team/sender-button.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { AtSign, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormDrawer, useDrawerForm } from "@/components/dashboard/team/form-drawer";
import { createAliasAction, saveWorkEmailAction, updateAliasAction } from "@/app/(dashboard)/app/team/actions";

type Common = { userId: string; memberName: string };

type Props = Common & (
  | { mode: "work"; domains: { id: string; domain: string }[]; existing?: { fromName: string; localPart: string; domainId: string; email: string }; lockAddress?: boolean }
  | { mode: "alias"; domain: string; existing?: { id: string; fromName: string; localPart: string } }
);

/**
 * Every add or edit of a sending address happens here, in a drawer: a person's work email (the first
 * address) and their aliases. With `existing` it edits; without, it adds.
 */
export function SenderButton(props: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const editing = Boolean(props.existing);
  const action = props.mode === "alias" ? (editing ? updateAliasAction : createAliasAction) : saveWorkEmailAction;
  const { pending, onSubmit } = useDrawerForm(action, close);

  const lock = props.mode === "work" && props.lockAddress;
  const noDomain = props.mode === "work" && props.domains.length === 0 && !lock;
  const label = props.mode === "work" ? (editing ? "Edit work email" : "Add work email") : editing ? "Edit alias" : "Add alias";

  return (
    <>
      {editing ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${label} for ${props.memberName}`}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {label}
        </Button>
      )}

      <FormDrawer
        open={open}
        onClose={close}
        title={label}
        description={props.memberName}
        icon={<AtSign className="h-5 w-5" aria-hidden="true" />}
        submitLabel={editing ? "Save" : props.mode === "work" ? "Add work email" : "Add alias"}
        pending={pending}
        onSubmit={onSubmit}
        hideFooter={noDomain}
      >
        {noDomain ? (
          <p className="rounded-xl bg-mist-50 p-4 text-sm text-ink-soft">
            Addresses are created on a verified domain.{" "}
            <Link href="/app/domains" className="font-semibold text-brand-800 hover:underline">Verify a sending domain</Link> first.
          </p>
        ) : (
          <>
            {props.mode === "alias" && props.existing ? <input type="hidden" name="id" value={props.existing.id} /> : <input type="hidden" name="userId" value={props.userId} />}
            <Field label="Sender name" htmlFor="sender-name" hint="Shown to recipients.">
              <Input id="sender-name" name="fromName" defaultValue={props.existing?.fromName ?? (props.mode === "work" ? props.memberName : "")} required maxLength={80} autoComplete="off" />
            </Field>
            <div>
              <label htmlFor="sender-local" className="mb-1.5 block text-sm font-semibold text-ink">Address</label>
              {props.mode === "alias" ? (
                <div className="flex items-center gap-2">
                  <Input id="sender-local" name="localPart" defaultValue={props.existing?.localPart} placeholder="sales" maxLength={64} required className="min-w-0" autoComplete="off" />
                  <span className="shrink-0 text-sm text-ink-muted">@{props.domain}</span>
                </div>
              ) : lock ? (
                <Input id="sender-local" value={props.existing?.email ?? ""} readOnly disabled />
              ) : (
                <div className="flex items-center gap-2">
                  <Input id="sender-local" name="localPart" defaultValue={props.existing?.localPart} placeholder="jon" maxLength={64} required className="min-w-0" autoComplete="off" />
                  <span className="text-ink-muted">@</span>
                  <Select name="domainId" aria-label="Domain" defaultValue={props.existing?.domainId} className="min-w-0">
                    {props.domains.map((d) => <option key={d.id} value={d.id}>{d.domain}</option>)}
                  </Select>
                </div>
              )}
            </div>
          </>
        )}
      </FormDrawer>
    </>
  );
}
