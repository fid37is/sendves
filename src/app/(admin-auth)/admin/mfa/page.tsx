import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasRequiredAssurance } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { MfaChallenge, MfaEnroll } from "../forms";

export const metadata: Metadata = { title: "Two-factor verification", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") notFound();
  if (await hasRequiredAssurance()) redirect("/");

  const { data } = await createClient().auth.mfa.listFactors();
  const factor = data?.totp?.[0]; // verified TOTP factors only

  return factor ? (
    <>
      <h1 className="text-2xl font-extrabold text-ink">Two-factor verification</h1>
      <p className="mb-6 mt-2 text-sm text-ink-soft">Open your authenticator app and enter the current code.</p>
      <MfaChallenge factorId={factor.id} />
    </>
  ) : (
    <>
      <h1 className="text-2xl font-extrabold text-ink">Set up two-factor authentication</h1>
      <p className="mb-6 mt-2 text-sm text-ink-soft">The admin console requires an authenticator app (Google Authenticator, 1Password, Authy). Set it up once; you’ll use it on every sign-in.</p>
      <MfaEnroll />
    </>
  );
}
