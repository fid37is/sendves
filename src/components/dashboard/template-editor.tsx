"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { BlockEditor, useVariableInsert } from "@/components/dashboard/block-editor";
import { EmailPreviewCard } from "@/components/dashboard/email-preview";
import { PersonalizeCard } from "@/components/dashboard/personalize-card";
import type { Block } from "@/lib/email/blocks";
import { buildPreviewDoc, previewSubject } from "@/lib/email/preview";

type Action = (formData: FormData) => Promise<void>;
type Props = {
  template: { id: string; name: string; description: string; subject: string; preview_text: string; blocks: Block[] };
  workspace: { name: string; business_address: string | null };
  actions: { save: Action; saveAndUse: Action; remove: Action };
};

/** Edit one of your own templates. Saved with the buttons (not automatically), with a warning before leaving unsaved changes. */
export function TemplateEditor({ template, workspace, actions }: Props) {
  const confirm = useConfirm();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [subject, setSubject] = useState(template.subject);
  const [previewText, setPreviewText] = useState(template.preview_text);
  const [blocks, setBlocks] = useState<Block[]>(template.blocks);
  const { onFocusCapture, insert } = useVariableInsert();

  const key = JSON.stringify([name, description, subject, previewText, blocks]);
  const saved = useRef(key);
  const dirty = key !== saved.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const doc = useMemo(
    () => buildPreviewDoc(blocks, { preview: previewText, workspaceName: workspace.name, businessAddress: workspace.business_address }),
    [blocks, previewText, workspace],
  );

  return (
    <form
      onFocusCapture={onFocusCapture}
      // Enter in a text field must not submit the form.
      onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }}
      className="grid gap-6 xl:grid-cols-[1.1fr_1fr]"
    >
      <input type="hidden" name="id" value={template.id} />
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Details" description="Campaigns started from this template begin with its subject, preview text and content." />
          <div className="space-y-5 p-6">
            <Field label="Template name" htmlFor="name" hint="Only you see this."><Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></Field>
            <Field label="Description" htmlFor="description" hint="A short note to help you pick it later."><Input id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} /></Field>
            <Field label="Subject line" htmlFor="subject" hint="You can use {{first_name|there}}."><Input id="subject" name="subject" data-var="true" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></Field>
            <Field label="Preview text" htmlFor="previewText" hint="The short line shown beside the subject in many inboxes."><Input id="previewText" name="previewText" data-var="true" value={previewText} onChange={(e) => setPreviewText(e.target.value)} maxLength={200} /></Field>
          </div>
        </Card>

        <PersonalizeCard onInsert={insert} />

        <BlockEditor blocks={blocks} setBlocks={setBlocks} />

        <Card>
          <CardHeader title="Save" description={dirty ? "You have unsaved changes." : "All changes saved."} />
          <div className="flex flex-wrap gap-3 p-6">
            <Button type="submit" formAction={actions.save}>Save template</Button>
            <Button type="submit" formAction={actions.saveAndUse} variant="secondary">Save and start a campaign</Button>
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
        <EmailPreviewCard doc={doc} subject={previewSubject(subject)} description="Shown with a sample person: Ada Lovelace." />
      </div>
    </form>
  );
}
