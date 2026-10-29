import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Recover your account", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-ink">Recover your account</h1>
      <p className="mb-8 mt-2 text-ink-soft">Enter the email you registered with and we’ll send you a link to set a new password.</p>
      <ForgotPasswordForm />
      <p className="mt-8 text-center text-sm text-ink-soft">
        <Link href="/login" className="font-semibold text-brand-800 hover:underline">Back to log in</Link>
      </p>
    </>
  );
}
