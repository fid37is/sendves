import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/auth-forms";
import { isSelfServePlan } from "@/config/plan-limits";
import { TRIAL_PROMISE } from "@/config/plans";
import type { SearchParams } from "@/types";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

export default function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const picked = String(searchParams.plan ?? "");
  const defaultPlan = isSelfServePlan(picked) ? picked : "growth";
  return (
    <>
      <h1 className="text-3xl font-extrabold text-ink">Start your free trial</h1>
      <p className="mb-8 mt-2 text-ink-soft">{TRIAL_PROMISE} Pick a plan to try. You can change it before you subscribe.</p>
      <RegisterForm defaultPlan={defaultPlan} />
      <p className="mt-8 text-center text-sm text-ink-soft">
        Already have an account? <Link href="/login" className="font-semibold text-brand-800 hover:underline">Log in</Link>
      </p>
    </>
  );
}
