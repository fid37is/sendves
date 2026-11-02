import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateCard } from "@/components/dashboard/template-card";
import { BUILT_IN_TEMPLATES, designFromRow, designFromStarter, EMPTY_LOGO } from "@/lib/email/campaign";
import { buildCampaignDoc } from "@/lib/email/campaign-preview";
import { buildPreviewDoc } from "@/lib/email/preview";
import { assetRule, getEmailLogo } from "@/server/email-assets";
import { getTemplates } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { can } from "@/lib/access";
import { NoAccess } from "@/components/dashboard/no-access";
import { createTemplateAction } from "./actions";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const ctx = await getContext();
  if (!can(ctx?.access, "templates.view")) return <NoAccess title="Templates" what="templates" />;
  const manage = can(ctx?.access, "templates.manage");
  const useIt = can(ctx?.access, "campaigns.manage");
  const mine = ctx ? await getTemplates(ctx) : [];
  // The built-in templates are the editor's own layouts, drawn by the editor's renderer with this workspace's logo.
  const logo = ctx?.workspace && ctx.db ? await getEmailLogo(ctx.db, ctx.workspace.id) : EMPTY_LOGO;
  const tz = ctx?.workspace?.timezone || "UTC";
  const address = ctx?.workspace?.business_address ?? null;
  const builtIn = BUILT_IN_TEMPLATES.filter((t) => t.id !== "blank").map((t) => ({
    ...t,
    doc: buildCampaignDoc(designFromStarter(t.id)!, { logo, tz }, { preheader: t.previewText, contact: null, variables: [], businessAddress: address }),
  }));
  const ws = { workspaceName: ctx?.workspace?.name ?? "Your business", businessAddress: ctx?.workspace?.business_address ?? null };

  return (
    <>
      <PageHeader
        title="Templates"
        description="Start a campaign from a ready layout. To make your own, build it in the campaign editor and choose Save as template."
        action={
          manage && useIt ? (
            <form action={createTemplateAction}>
              <Button type="submit">
                <Plus className="h-4 w-4" aria-hidden="true" />
                New template
              </Button>
            </form>
          ) : undefined
        }
      />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {builtIn.map((t) => (
          <TemplateCard key={t.id} id={t.id} name={t.name} description={t.description} doc={t.doc} canUse={useIt} />
        ))}
        {mine.map((t) => (
          <TemplateCard key={t.id} id={t.id} name={t.name} description={t.description || "Your template"} doc={t.design
            ? buildCampaignDoc(designFromRow(t.design, [], assetRule(ctx!.workspace!.id)), { logo, tz }, { preheader: t.preview_text, contact: null, variables: t.variables, businessAddress: address })
            : buildPreviewDoc(t.blocks, { ...ws, preview: t.preview_text, variables: t.variables })}
            own editable={!t.design} canUse={useIt} canManage={manage} />
        ))}
      </div>
    </>
  );
}
