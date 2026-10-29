import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-ink">Set a new password</h1>
      <p className="mb-8 mt-2 text-ink-soft">Choose a password you haven’t used before.</p>
      <ResetPasswordForm />
    </>
  );
}
