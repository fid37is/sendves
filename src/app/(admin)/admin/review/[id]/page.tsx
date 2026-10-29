import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminDb } from "@/lib/auth/admin";
import { approveCampaignAction, rejectCampaignAction } from "../../actions";

export const metadata: Metadata = { title: "Review campaign" };

export default async function ReviewCampaignPage({ params }: { params: { id: string } }) {
  const { db } = await requireAdminDb();
  let c: any = null;
  if (/^[0-9a-f-]{36}$/i.test(params.id)) {
    const { data } = await db.from("campaigns").select("id, name, subject, from_name, from_email, html, recipient_count, review_status, workspaces(name, business_address)").eq("id", params.id).maybeSingle();
    c = data;
  }
  if (!c) notFound();

  return (
    <>
      <PageHeader title={c.name} description={`${c.workspaces?.name ?? "Workspace"}: ${c.recipient_count} recipients`} />
      <div className="mb-6 grid gap-2 text-sm text-ink-soft">
        <p><strong className="text-ink">Subject:</strong> {c.subject}</p>
        <p><strong className="text-ink">From:</strong> {c.from_name} &lt;{c.from_email}&gt;</p>
        <p><strong className="text-ink">Business address:</strong> {c.workspaces?.business_address ?? "(missing)"}</p>
      </div>
      <Card>
        <CardHeader title="Email content" description="Check for phishing, deceptive claims, prohibited content and purchased-list signs." />
        <iframe title="Campaign preview" srcDoc={c.html} sandbox="" className="h-[640px] w-full rounded-b-2xl bg-white" />
      </Card>
      {c.review_status === "pending" ? (
        <div className="mt-6 flex gap-3">
          <form action={approveCampaignAction}><input type="hidden" name="id" value={c.id} /><Button type="submit">Approve</Button></form>
          <form action={rejectCampaignAction}><input type="hidden" name="id" value={c.id} /><Button type="submit" variant="danger">Reject</Button></form>
          <ButtonLink href="/review" variant="outline">Back to queue</ButtonLink>
        </div>
      ) : null}
    </>
  );
}
