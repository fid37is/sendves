"use client";

import { useFormStatus } from "react-dom";
import { Copy, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmIconButton } from "@/components/ui/confirm";
import { EmailThumb } from "@/components/dashboard/email-preview";
import { startFromTemplateAction, deleteTemplateAction, duplicateTemplateAction } from "@/app/(dashboard)/app/templates/actions";

function UseButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="secondary" size="sm" disabled={pending}>{pending ? "Opening…" : "Use template"}</Button>;
}

type Props = {
  id: string;
  name: string;
  description: string;
  /** The finished email, shown in the preview area. */
  doc: string;
  /** One of your own templates: it can be edited and deleted. */
  own?: boolean;
  /** May make a campaign from it (campaign permission). */
  canUse?: boolean;
  /** May edit, duplicate and delete your own templates (template permission). */
  canManage?: boolean;
};

export function TemplateCard({ id, name, description, doc, own = false, canUse = true, canManage = true }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-mist bg-white">
      <EmailThumb doc={doc} title={`${name} preview`} className="h-32" />
      <div className="p-5">
        <h2 className="font-bold text-ink">{name}</h2>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
        <div className="mt-4 flex items-center gap-2">
          {/* Creates the draft and opens it in the campaign editor. */}
          {canUse ? (
            <form action={startFromTemplateAction}>
              <input type="hidden" name="template" value={id} />
              <UseButton />
            </form>
          ) : null}
          {own && canManage ? (
            <>
              <ButtonLink href={`/app/templates/${id}`} variant="outline" size="sm">Edit</ButtonLink>
              <form action={duplicateTemplateAction}>
                <input type="hidden" name="id" value={id} />
                <Button type="submit" variant="ghost" size="sm" aria-label={`Duplicate ${name}`} title="Duplicate"><Copy className="h-4 w-4" aria-hidden="true" /></Button>
              </form>
              <span className="ml-auto">
                <ConfirmIconButton
                  label={`Delete ${name}`}
                  action={deleteTemplateAction}
                  fields={{ id }}
                  confirm={{ title: `Delete “${name}”?`, description: "The template is removed. Campaigns already made from it are not affected. This can’t be undone.", confirmLabel: "Delete template", tone: "danger" }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </ConfirmIconButton>
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
