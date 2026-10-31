"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { BlockEditor } from "@/components/dashboard/block-editor";
import { buildVariableOptions, VariableField } from "@/components/dashboard/variable-field";
import { VariablesEditor } from "@/components/dashboard/variables-panel";
import { EmailPreviewCard } from "@/components/dashboard/email-preview";
import type { Block } from "@/lib/email/blocks";
import { buildPreviewDoc, previewSubject } from "@/lib/email/preview";
import { sanitizeVariables, type VariableDef } from "@/lib/email/variables";

type Action = (formData: FormData) => Promise<void>;
type Props = {
  template: { id: string; name: string; description: string; subject: string; preview_text: string; blocks: Block[]; variables: VariableDef[]; departmentId: string | null };
  workspace: { name: string; business_address: string | null };
  /** Custom contact fields found on contacts (extra CSV columns). */
  contactFieldKeys: string[];
  /** Departments this person may put the template in. */
  departments: { id: string; name: string }[];
  orgWideAllowed: boolean;
  canStartCampaign: boolean;
  actions: { save: Action; saveAndUse: Action; remove: Action; duplicate: Action };
};

/** Edit one of your own templates. Saved with the buttons (not automatically), with a warning before leaving unsaved changes. */
export function TemplateEditor({ template, workspace, contactFieldKeys, departments, orgWideAllowed, canStartCampaign, actions }: Props) {
  const confirm = useConfirm();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [subject, setSubject] = useState(template.subject);
  const [previewText, setPreviewText] = useState(template.preview_text);
  const [blocks, setBlocks] = useState<Block[]>(template.blocks);
  const [variables, setVariables] = useState<VariableDef[]>(template.variables);
  const [departmentId, setDepartmentId] = useState(template.departmentId ?? "");
  const validDefs = useMemo(() => sanitizeVariables(variables), [variables]);
  const variableOptions = useMemo(() => buildVariableOptions(validDefs, contactFieldKeys), [validDefs, contactFieldKeys]);

  const key = JSON.stringify([name, description, subject, previewText, blocks, variables, departmentId]);
  const saved = useRef(key);
  const dirty = key !== saved.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const doc = useMemo(
    () => buildPreviewDoc(blocks, { preview: previewText, workspaceName: workspace.name, businessAddress: workspace.business_address, variables: validDefs }),
    [blocks, previewText, workspace, validDefs],
  );

  return (
    <form
      // Enter in a text field must not submit the form.
      onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }}
      className="grid gap-6 xl:grid-cols-[1.1fr_1fr]"
    >
      <input type="hidden" name="id" value={template.id} />
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
      <input type="hidden" name="variables" value={JSON.stringify(validDefs)} />
      <input type="hidden" name="departmentId" value={departmentId} />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Details" description="Campaigns started from this template begin with its subject, preview text and content." />
          <div className="space-y-5 p-6">
            <Field label="Template name" htmlFor="name" hint="This is the title. Saving never asks for it again."><Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></Field>
            <Field label="Description" htmlFor="description" hint="A short note to help you pick it later."><Input id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} /></Field>
            <VariableField label="Subject line" value={subject} onChange={setSubject} options={variableOptions} maxLength={200} />
            <VariableField label="Preview text" value={previewText} onChange={setPreviewText} options={variableOptions} maxLength={200} hint="The short line shown beside the subject in many inboxes." />
            <input type="hidden" name="subject" value={subject} />
            <input type="hidden" name="previewText" value={previewText} />
            {departments.length > 0 ? (
              <Field label="Department" htmlFor="tpl-dept" hint="Only members of this department, and people with access to every department, can see this template.">
                <Select id="tpl-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  {orgWideAllowed ? <option value="">Whole organization</option> : null}
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
            ) : null}
          </div>
        </Card>

        <BlockEditor blocks={blocks} setBlocks={setBlocks} variableOptions={variableOptions} />

        <VariablesEditor variables={variables} setVariables={setVariables} contactFieldKeys={contactFieldKeys} title="Template variables" />

        <Card>
          <CardHeader title="Save" description={dirty ? "You have unsaved changes. Duplicate copies the last saved version." : "All changes saved."} />
          <div className="flex flex-wrap gap-3 p-6">
            <Button type="submit" formAction={actions.save}>Save template</Button>
            {canStartCampaign ? <Button type="submit" formAction={actions.saveAndUse} variant="secondary">Save and start a campaign</Button> : null}
            <Button type="submit" formAction={actions.duplicate} variant="outline" title={dirty ? "Copies the last saved version" : undefined}>Duplicate</Button>
            <Button
              type="submit"
              formAction={actions.remove}
              variant="ghost"
              onClick={async (e) => {
                const button = e.currentTarget;
                const form = button.form;
                e.preventDefault();
                const ok = await confirm({
                  title: "Delete this template?",
                  description: "The template is removed. Campaigns already made from it are not affected. This can’t be undone.",
                  confirmLabel: "Delete template",
                  tone: "danger",
                });
                if (ok) form?.requestSubmit(button);
              }}
            >
              Delete template
            </Button>
          </div>
        </Card>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <EmailPreviewCard doc={doc} subject={previewSubject(subject, undefined, validDefs)} description="Shown with a sample person: Ada Lovelace." />
      </div>
    </form>
  );
}
