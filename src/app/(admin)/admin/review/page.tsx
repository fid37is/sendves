import type { Metadata } from "next";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { getReviewQueue } from "@/lib/queries";
import { approveCampaignAction, rejectCampaignAction } from "../actions";

export const metadata: Metadata = { title: "Campaign review" };

export default async function AdminReviewPage() {
  const queue = await getReviewQueue();
  return (
    <>
      <PageHeader title="Campaign review" description="First campaigns from new workspaces are held here until approved." />
      {queue.length === 0 ? (
        <EmptyState title="Nothing waiting" description="New campaigns that need a human check will appear here." />
      ) : (
        <div className="space-y-4">
          {queue.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <p className="font-bold text-ink">{r.workspace}: {r.campaign}</p>
                <p className="mt-1 text-sm text-ink-muted">Subject: {r.subject}</p>
                <p className="text-sm text-ink-muted">{r.recipients} recipients, submitted {r.submitted}</p>
              </div>
              <div className="flex gap-3">
                <ButtonLink href={`/review/${r.id}`} variant="outline">Preview</ButtonLink>
                <form action={rejectCampaignAction}><input type="hidden" name="id" value={r.id} /><Button type="submit" variant="danger">Reject</Button></form>
                <form action={approveCampaignAction}><input type="hidden" name="id" value={r.id} /><Button type="submit">Approve</Button></form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
