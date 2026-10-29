import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { starterTemplates } from "@/config/starter-templates";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader title="Templates" description="Start a campaign from a ready layout." />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {starterTemplates.map((t) => (
          <div key={t.id} className="overflow-hidden rounded-2xl border border-mist bg-white">
            <div className="h-32 bg-mist-100" aria-hidden="true" />
            <div className="p-5">
              <h2 className="font-bold text-ink">{t.name}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t.description}</p>
              <ButtonLink href={`/app/campaigns/new?template=${t.id}`} variant="secondary" size="sm" className="mt-4">Use template</ButtonLink>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
