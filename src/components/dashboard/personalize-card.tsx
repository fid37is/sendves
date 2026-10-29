"use client";

import { useState } from "react";
import { Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { EMAIL_VARIABLES } from "@/lib/email/blocks";
import { updateContactNameAction } from "@/app/(dashboard)/app/contacts/actions";
import type { PreviewContact } from "@/app/(dashboard)/app/campaigns/actions";

export const SAMPLE_ID = "sample";

/** Keeps a fallback usable inside {{name|fallback}}. */
const cleanFallback = (s: string) => s.replace(/[{}|<>]/g, "").trim().slice(0, 40);

function NameEditor({ contact, onSaved }: { contact: PreviewContact; onSaved: (c: PreviewContact) => void }) {
  const [first, setFirst] = useState(contact.first_name ?? "");
  const [last, setLast] = useState(contact.last_name ?? "");
  const [saving, setSaving] = useState(false);
  const changed = first.trim() !== (contact.first_name ?? "") || last.trim() !== (contact.last_name ?? "");

  const save = async () => {
    if (saving || !changed) return;
    setSaving(true);
    try {
      const res = await updateContactNameAction({ contactId: contact.id, firstName: first, lastName: last });
      if (!res.ok) { toast.error(res.error ?? "Couldn’t save that contact."); return; }
      onSaved({ ...contact, first_name: first.trim() || null, last_name: last.trim() || null });
      toast.success("Contact updated.");
    } catch {
      toast.error("Couldn’t save that contact. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-mist p-4">
      <p className="text-sm font-bold text-ink">{contact.email}</p>
      <p className="mt-0.5 text-xs text-ink-muted">These names are saved on the contact, so every campaign uses them.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="First name" htmlFor="pv-first" hint="Fills {{first_name}}"><Input id="pv-first" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={80} /></Field>
        <Field label="Last name" htmlFor="pv-last" hint="Fills {{last_name}}"><Input id="pv-last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={80} /></Field>
      </div>
      <Button type="button" size="sm" className="mt-3" disabled={!changed || saving} onClick={save}>{saving ? "Saving…" : "Save names"}</Button>
    </div>
  );
}

/**
 * Where personalisation is set up: insert a variable into the email, choose what it shows when a
 * person has no value, and (in a campaign) preview the email as a real contact and set their names.
 */
export function PersonalizeCard({
  onInsert, contacts, selectedId, onSelect, onContactSaved,
}: {
  /** Receives the text to insert, e.g. {{first_name|there}}. Returns false if there is no field to put it in. */
  onInsert: (token: string) => boolean;
  /** Campaign editor only. Leave undefined in the template editor, which previews with a sample person. */
  contacts?: PreviewContact[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onContactSaved?: (c: PreviewContact) => void;
}) {
  const [fallback, setFallback] = useState("there");
  const fb = cleanFallback(fallback);
  const selected = contacts?.find((c) => c.id === selectedId) ?? null;

  const insert = (key: string, withFallback: boolean) => {
    const ok = onInsert(withFallback && fb ? `{{${key}|${fb}}}` : `{{${key}}}`);
    if (!ok) toast.info("Click into the subject, preview text or a text block first, then choose a variable.");
  };

  return (
    <Card>
      <CardHeader title="Personalise" description="Each person gets their own details in the email. Click where it should go, then choose a variable." />
      <div className="space-y-5 p-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Insert a variable</p>
          <div className="flex flex-wrap gap-2">
            {EMAIL_VARIABLES.map((v) => (
              <Button key={v.key} type="button" variant="secondary" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(v.key, v.fallback)}>
                <Braces className="h-4 w-4" aria-hidden="true" />
                {v.label}
              </Button>
            ))}
          </div>
        </div>
        <Field label="If a person has no name, show" htmlFor="pv-fallback" hint={`“Hi {{first_name|${fb || "there"}}},” becomes “Hi ${fb || "there"},” when the first name is empty. Leave blank to show nothing.`}>
          <Input id="pv-fallback" value={fallback} onChange={(e) => setFallback(e.target.value)} maxLength={40} className="max-w-xs" />
        </Field>

        {contacts !== undefined ? (
          <div>
            <Field label="Preview as" htmlFor="pv-as" hint={contacts.length === 0 ? "No subscribed contacts in this audience yet. Add people below to preview the email as them." : "The preview on the right is filled in with this person’s details."}>
              <Select id="pv-as" value={selectedId ?? SAMPLE_ID} onChange={(e) => onSelect?.(e.target.value)}>
                <option value={SAMPLE_ID}>Sample person (Ada Lovelace)</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}{[c.first_name, c.last_name].some(Boolean) ? ` · ${c.email}` : " · no name yet"}</option>)}
              </Select>
            </Field>
            {selected ? <NameEditor key={selected.id} contact={selected} onSaved={(c) => onContactSaved?.(c)} /> : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
