import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";

export const metadata: Metadata = { title: "Check your inbox", robots: { index: false } };

export default function VerifyEmailPage({ searchParams }: { searchParams: { email?: string } }) {
  return (
    <div className="text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-800"><MailCheck className="h-7 w-7" aria-hidden="true" /></span>
      <h1 className="mt-6 text-3xl font-extrabold text-ink">Check your inbox</h1>
      <p className="mt-3 text-ink-soft">
        We sent a confirmation link to {searchParams.email ? <strong className="text-ink">{searchParams.email}</strong> : "your email address"}. Open it to activate your account.
      </p>
      <p className="mt-6 text-sm text-ink-muted">Can’t find it? Check your spam folder, or <Link href="/register" className="font-semibold text-brand-800 hover:underline">try registering again</Link>.</p>
    </div>
  );
}
