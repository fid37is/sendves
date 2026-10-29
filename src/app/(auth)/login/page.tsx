import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/auth-forms";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

const notices: Record<string, string> = {
  "not-configured": "Sign-in isn’t connected yet. Add your Supabase keys and restart the app.",
  "link-invalid": "That link has expired or was already used. Request a new one and try again.",
};

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-ink">Welcome back</h1>
      <p className="mb-8 mt-2 text-ink-soft">Log in to manage your campaigns.</p>
      <LoginForm next={safeNext(searchParams.next)} notice={searchParams.error ? notices[searchParams.error] : undefined} />
      <p className="mt-8 text-center text-sm text-ink-soft">
        New to Sendves? <Link href="/register" className="font-semibold text-brand-800 hover:underline">Create a free account</Link>
      </p>
    </>
  );
}
