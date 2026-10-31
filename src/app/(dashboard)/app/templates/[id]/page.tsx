import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateEditor } from "@/components/dashboard/template-editor";
import { getContactFieldKeys, getDepartments, getTemplate } from "@/lib/queries";
import { can } from "@/lib/access";
import { NoAccess } from "@/components/dashboard/no-access";
import { getContext } from "@/lib/workspace";
import { deleteTemplateAction, duplicateTemplateAction, saveAndUseTemplateAction, saveTemplateAction } from "../actions";

export const metadata: Metadata = { title: "Edit template" };

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const ctx = await getContext();
  if (!ctx?.workspace) notFound();
  if (!can(ctx.access, "templates.manage")) return <NoAccess title="Edit template" what="editing templates" />;
  const access = ctx.access!;
  const template = await getTemplate(ctx, params.id);
  if (!template) notFound();
  const [contactFieldKeys, allDepartments] = await Promise.all([getContactFieldKeys(ctx), getDepartments(ctx)]);

  return (
    <>
      <PageHeader title={template.name} description="Edit your template. Campaigns you start from it begin with this subject, preview text and content." />
      <TemplateEditor
        template={template}
        workspace={{ name: ctx.workspace.name, business_address: ctx.workspace.business_address }}
        contactFieldKeys={contactFieldKeys}
        departments={allDepartments.filter((d) => access.allDepartments || access.departmentIds.includes(d.id)).map(({ id, name }) => ({ id, name }))}
        orgWideAllowed={access.allDepartments || access.departmentIds.length === 0}
        canStartCampaign={can(access, "campaigns.manage")}
        actions={{ save: saveTemplateAction, saveAndUse: saveAndUseTemplateAction, remove: deleteTemplateAction, duplicate: duplicateTemplateAction }}
      />
    </>
  );
}
