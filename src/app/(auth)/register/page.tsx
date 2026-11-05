import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/auth-forms";
import { SelectedPlan, type PlanSelection } from "@/components/auth/selected-plan";
import { ANNUAL_BILLING_ENABLED, DEFAULT_AUDIENCE, isAudienceStep, isSelfServePlan } from "@/config/plan-limits";
import { TRIAL_PROMISE } from "@/config/plans";
import type { SearchParams } from "@/types";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

/** Reads the plan chosen on the pricing page from the link. Anything missing or not one we sell falls back to a sensible default. */
function selectionFrom(searchParams: SearchParams): PlanSelection {
  const plan = String(searchParams.plan ?? "").toLowerCase();
  const audience = Number(String(searchParams.audience ?? "").replace(/,/g, ""));
  return {
    plan: isSelfServePlan(plan) ? plan : "growth",
    audience: isAudienceStep(audience) ? audience : DEFAULT_AUDIENCE,
    interval: ANNUAL_BILLING_ENABLED && searchParams.billing === "year" ? "year" : "month",
  };
}

export default function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const selection = selectionFrom(searchParams);
  return (
    <>
      <h1 className="text-3xl font-extrabold text-ink">Start your free trial</h1>
      <p className="mb-8 mt-2 text-ink-soft">{TRIAL_PROMISE} Your plan is below. You can change it before you subscribe.</p>
      <SelectedPlan selection={selection} />
      <RegisterForm selection={selection} />
      <p className="mt-8 text-center text-sm text-ink-soft">
        Already have an account? <Link href="/login" className="font-semibold text-brand-800 hover:underline">Log in</Link>
      </p>
    </>
  );
}
