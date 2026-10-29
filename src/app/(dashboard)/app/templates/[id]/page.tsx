import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateEditor } from "@/components/dashboard/template-editor";
import { getTemplate } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { deleteTemplateAction, saveAndUseTemplateAction, saveTemplateAction } from "../actions";

export const metadata: Metadata = { title: "Edit template" };

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const ctx = await getContext();
  if (!ctx?.workspace) notFound();
  const template = await getTemplate(ctx, params.id);
  if (!template) notFound();

  return (
    <>
      <PageHeader title={template.name} description="Edit your template. Campaigns you start from it begin with this subject, preview text and content." />
      <TemplateEditor
        template={template}
        workspace={{ name: ctx.workspace.name, business_address: ctx.workspace.business_address }}
        actions={{ save: saveTemplateAction, saveAndUse: saveAndUseTemplateAction, remove: deleteTemplateAction }}
      />
    </>
  );
}
