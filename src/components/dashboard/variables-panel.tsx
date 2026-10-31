"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { BUILT_IN_VARIABLES, MAX_VARIABLES, isBuiltInVariable, VARIABLE_KEY_RE, type VariableDef } from "@/lib/email/variables";
import { updateContactNameAction } from "@/app/(dashboard)/app/contacts/actions";
import type { PreviewContact } from "@/app/(dashboard)/app/campaigns/actions";

export const SAMPLE_ID = "sample";

/** What a person types for a variable name becomes a valid key as they type: "Offer code" → offer_code. */
const toKeyInput = (v: string) => v.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z]+/, "").slice(0, 40);

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
      toast.error("Couldn’t save. Try again.");
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

/** "Preview as": fills the preview with a real person from the audience, and lets you fix their names. */
export function PreviewAsCard({
  contacts, selectedId, onSelect, onContactSaved,
}: {
  contacts: PreviewContact[];
  selectedId: string;
  onSelect: (id: string) => void;
  onContactSaved: (c: PreviewContact) => void;
}) {
  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  return (
    <Card>
      <CardHeader title="Preview as" description="Check the email as a real person from your audience. Variables are filled with their details." />
      <div className="p-6">
        <Field label="Person" htmlFor="pv-as" hint={contacts.length === 0 ? "No subscribed people in this audience yet. Choose an audience first." : "The preview uses this person’s details, or your fallbacks where they have none."}>
          <Select id="pv-as" value={selectedId} onChange={(e) => onSelect(e.target.value)}>
            <option value={SAMPLE_ID}>Sample person (Ada Lovelace)</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}{[c.first_name, c.last_name].some(Boolean) ? ` · ${c.email}` : " · no name yet"}</option>)}
          </Select>
        </Field>
        {selected ? <NameEditor key={selected.id} contact={selected} onSaved={onContactSaved} /> : null}
      </div>
    </Card>
  );
}

type Props = {
  variables: VariableDef[];
  setVariables: Dispatch<SetStateAction<VariableDef[]>>;
  /** Extra columns found on the workspace's contacts (from imported CSV files). */
  contactFieldKeys: readonly string[];
  /** Hide the card chrome when it sits inside another card. */
  title?: string;
};

/**
 * Where variable values and fallbacks are defined.
 *  - Recipient variables take each person's own data; here you choose what shows when it's missing.
 *  - Campaign variables are values you type once, the same for everyone (a promo code, a date).
 */
export function VariablesEditor({ variables, setVariables, contactFieldKeys, title = "Variables" }: Props) {
  const [touched, setTouched] = useState(false);
  const byKey = new Map(variables.map((v) => [v.key, v]));
  const recipientKeys = [...new Set<string>([...BUILT_IN_VARIABLES.map((v) => v.key), ...contactFieldKeys.filter((k) => !isBuiltInVariable(k))])];
  const campaignVars = variables.filter((v) => v.scope === "campaign");

  const setFallback = (key: string, fallback: string) =>
    setVariables((vs) => {
      const has = vs.some((v) => v.key === key);
      const next = has ? vs.map((v) => (v.key === key ? { ...v, fallback } : v)) : [...vs, { key, scope: "recipient" as const, value: "", fallback }];
      // A recipient variable with nothing set needs no row.
      return next.filter((v) => !(v.scope === "recipient" && !v.fallback && v.key === key));
    });

  const patchCampaign = (index: number, p: Partial<VariableDef>) =>
    setVariables((vs) => {
      const target = campaignVars[index];
      return vs.map((v) => (v === target ? { ...v, ...p } : v));
    });

  const addCampaign = () => {
    setTouched(true);
    if (variables.length >= MAX_VARIABLES) return toast.error(`You can define up to ${MAX_VARIABLES} variables.`);
    setVariables((vs) => [...vs, { key: "", scope: "campaign", value: "", fallback: "" }]);
  };

  const keyProblem = (v: VariableDef): string | undefined => {
    if (!v.key) return touched ? "Give it a name." : undefined;
    if (!VARIABLE_KEY_RE.test(v.key)) return "Start with a letter; use letters, numbers and _.";
    if (isBuiltInVariable(v.key) || contactFieldKeys.includes(v.key)) return "That name is already a contact field.";
    if (variables.filter((x) => x.key === v.key).length > 1) return "Another variable already uses this name.";
    return undefined;
  };

  return (
    <Card>
      <CardHeader title={title} description="Insert a variable in the subject, preview text, headings, text or button labels. Each person’s email shows their own value." />
      <div className="space-y-8 p-6">
        <section aria-labelledby="vars-recipient">
          <h3 id="vars-recipient" className="text-sm font-bold text-ink">Recipient variables</h3>
          <p className="mt-1 text-xs text-ink-muted">Filled from each person’s details. If someone has no value, the email shows the fallback you set here (or one written in the email, like {"{{first_name|friend}}"}).</p>
          <div className="mt-3 divide-y divide-mist rounded-2xl border border-mist">
            {recipientKeys.map((key) => {
              const builtIn = BUILT_IN_VARIABLES.find((b) => b.key === key);
              const def = byKey.get(key);
              const id = `fb-${key}`;
              return (
                <div key={key} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                  <div className="min-w-0">
                    <code className="rounded bg-mist-100 px-1.5 py-0.5 text-xs text-ink-soft">{`{{${key}}}`}</code>
                    <p className="mt-1 text-xs text-ink-muted">{builtIn ? builtIn.label : "Custom contact field"}</p>
                  </div>
                  <div>
                    <label htmlFor={id} className="sr-only">Fallback for {key}</label>
                    <Input id={id} value={def?.fallback ?? ""} onChange={(e) => setFallback(key, e.target.value.slice(0, 100))} placeholder={builtIn?.fallback ? `If missing: ${builtIn.fallback}` : "If missing: show nothing"} maxLength={100} />
                  </div>
                </div>
              );
            })}
          </div>
          {contactFieldKeys.length === 0 ? <p className="mt-2 text-xs text-ink-muted">Import a CSV with extra columns (company, plan…) and they appear here as variables too.</p> : null}
        </section>

        <section aria-labelledby="vars-campaign">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 id="vars-campaign" className="text-sm font-bold text-ink">Campaign variables</h3>
              <p className="mt-1 text-xs text-ink-muted">Values you set once, the same in every email: a promo code, an event date, a link label.</p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={addCampaign}><Plus className="h-4 w-4" aria-hidden="true" />Add variable</Button>
          </div>
          {campaignVars.length === 0 ? <p className="mt-3 rounded-xl bg-mist-50 p-4 text-sm text-ink-muted">None yet. Add one, then insert it with “Insert variable”.</p> : (
            <ul className="mt-3 space-y-3">
              {campaignVars.map((v, i) => {
                const problem = keyProblem(v);
                return (
                  <li key={i} className="rounded-2xl border border-mist p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_1fr_auto] sm:items-end">
                      <Field label="Name" htmlFor={`cv-key-${i}`} error={problem}>
                        <Input id={`cv-key-${i}`} value={v.key} onChange={(e) => patchCampaign(i, { key: toKeyInput(e.target.value) })} placeholder="offer_code" maxLength={40} aria-invalid={problem ? true : undefined} />
                      </Field>
                      <Field label="Value" htmlFor={`cv-val-${i}`}>
                        <Input id={`cv-val-${i}`} value={v.value} onChange={(e) => patchCampaign(i, { value: e.target.value.slice(0, 500) })} placeholder="SPRING20" maxLength={500} />
                      </Field>
                      <Field label="If empty, show" htmlFor={`cv-fb-${i}`}>
                        <Input id={`cv-fb-${i}`} value={v.fallback} onChange={(e) => patchCampaign(i, { fallback: e.target.value.slice(0, 100) })} maxLength={100} />
                      </Field>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setVariables((vs) => vs.filter((x) => x !== campaignVars[i]))} aria-label={`Remove ${v.key || "variable"}`}>
                        <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
                      </Button>
                    </div>
                    {v.key && !problem ? <p className="mt-2 text-xs text-ink-muted">Use it as <code className="rounded bg-mist-100 px-1 py-0.5">{`{{${v.key}}}`}</code>.</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="rounded-xl bg-mist-50 p-4 text-xs leading-relaxed text-ink-soft">
          <strong className="text-ink">What an email shows for a variable:</strong> the person’s own value → the campaign value → the fallback written in the email ({"{{key|fallback}}"}) → the fallback set here → nothing. Before sending, Sendves checks that every variable you used can be filled in.
        </p>
      </div>
    </Card>
  );
}
