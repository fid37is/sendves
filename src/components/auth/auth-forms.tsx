"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { forgotPasswordAction, resetPasswordAction, signInAction, signUpAction } from "@/app/(auth)/actions";
import { initialFormState } from "@/lib/auth/types";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageToasts, useActionToast } from "@/components/ui/toast";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useFormState(signInAction, initialFormState);
  useActionToast(state);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next ?? "/app"} />
      {notice ? <PageToasts toasts={[{ id: `login-${notice}`, kind: "warning", message: notice }]} /> : null}
      <Field label="Email address" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-semibold text-ink">Password</label>
          <Link href="/forgot-password" className="text-sm font-semibold text-brand-800 hover:underline">Forgot password?</Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useFormState(signUpAction, initialFormState);
  useActionToast(state);
  return (
    <form action={action} className="space-y-5">
      <Field label="Full name" htmlFor="fullName"><Input id="fullName" name="fullName" autoComplete="name" required /></Field>
      <Field label="Email address" htmlFor="email" hint="Use an email you already have and can access. We use it to sign you in and to recover your account.">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex items-start gap-3 text-sm text-ink-soft">
        <input type="checkbox" name="terms" className="mt-0.5 h-4 w-4 rounded border-mist accent-brand-700" required />
        <span>
          I agree to the <Link href="/terms-of-service" className="font-semibold text-brand-800 hover:underline">Terms of service</Link> and the{" "}
          <Link href="/anti-spam-policy" className="font-semibold text-brand-800 hover:underline">Anti-spam policy</Link>.
        </span>
      </label>
      <SubmitButton pendingText="Creating account…">Create free account</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useFormState(forgotPasswordAction, initialFormState);
  useActionToast(state);
  return (
    <form action={action} className="space-y-5">
      <Field label="Email address" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <SubmitButton pendingText="Sending link…">Send recovery link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useFormState(resetPasswordAction, initialFormState);
  useActionToast(state);
  return (
    <form action={action} className="space-y-5">
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <SubmitButton pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
