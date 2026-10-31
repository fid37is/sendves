import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInviteForm } from "@/components/auth/auth-forms";
import { ROLE_BLURB, ROLE_LABEL, type MemberRole } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadInvite } from "@/server/invites";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };

export default async function InvitePage({ params }: { params: { token: string } }) {
  const loaded = await loadInvite(params.token);
  if (!loaded.ok) {
    return (
      <>
        <h1 className="text-3xl font-extrabold text-ink">This invitation can’t be used</h1>
        <p className="mb-8 mt-2 text-ink-soft">{loaded.reason}</p>
        <Link href="/login" className="font-semibold text-brand-800 hover:underline">Go to log in</Link>
      </>
    );
  }
  const { invite, workspaceName } = loaded;
  const { data: existing } = await createAdminClient().from("profiles").select("id, recovery_email").eq("email", invite.email).maybeSingle();
  const rejoin = !!existing?.recovery_email;
  const role = invite.role as MemberRole;

  return (
    <>
      <h1 className="text-3xl font-extrabold text-ink">Join {workspaceName}</h1>
      <p className="mb-6 mt-2 text-ink-soft">You’ve been added as <strong>{ROLE_LABEL[role] ?? invite.role}</strong>. {ROLE_BLURB[role] ?? ""}</p>
      <div className="mb-6 rounded-2xl border border-mist bg-white p-4 text-sm">
        <p className="text-xs text-ink-muted">Your sign-in email</p>
        <p className="break-all font-semibold text-ink">{invite.email}</p>
        <p className="mt-2 text-xs text-ink-muted">This is the company email {workspaceName} created for you. You’ll use it to log in. The invitation was sent to your personal email, which is only used to recover your password.</p>
      </div>
      <AcceptInviteForm token={params.token} rejoin={rejoin} />
    </>
  );
}
