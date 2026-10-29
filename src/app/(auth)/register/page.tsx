import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-ink">Create your free account</h1>
      <p className="mb-8 mt-2 text-ink-soft">No credit card required.</p>
      <RegisterForm />
      <p className="mt-8 text-center text-sm text-ink-soft">
        Already have an account? <Link href="/login" className="font-semibold text-brand-800 hover:underline">Log in</Link>
      </p>
    </>
  );
}
