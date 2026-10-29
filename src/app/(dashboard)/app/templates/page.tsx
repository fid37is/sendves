import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateCard } from "@/components/dashboard/template-card";
import { starterTemplates } from "@/config/starter-templates";
import { buildPreviewDoc } from "@/lib/email/preview";
import { getTemplates } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { createTemplateAction } from "./actions";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const ctx = await getContext();
  const mine = ctx ? await getTemplates(ctx) : [];
  const ws = { workspaceName: ctx?.workspace?.name ?? "Your business", businessAddress: ctx?.workspace?.business_address ?? null };

  return (
    <>
      <PageHeader
        title="Templates"
        description="Start a campaign from a ready layout."
        action={
          <form action={createTemplateAction}>
            <Button type="submit">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New template
            </Button>
          </form>
        }
      />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {starterTemplates.filter((t) => t.id !== "blank").map((t) => (
          <TemplateCard key={t.id} id={t.id} name={t.name} description={t.description} doc={buildPreviewDoc(t.blocks, { ...ws, preview: t.previewText })} />
        ))}
        {mine.map((t) => (
          <TemplateCard key={t.id} id={t.id} name={t.name} description={t.description || "Your template"} doc={buildPreviewDoc(t.blocks, { ...ws, preview: t.preview_text })} own />
        ))}
      </div>
    </>
  );
}
