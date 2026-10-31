"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { forgotPasswordAction, resetPasswordAction, signInAction, signUpAction } from "@/app/(auth)/actions";
import { acceptInviteAction } from "@/app/(auth)/invite/[token]/actions";
import { initialFormState } from "@/lib/auth/types";
import { Field, Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
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
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
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
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword">
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={8} required />
      </Field>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pendingText="Creating account…">Create free account</SubmitButton>
      <p className="text-center text-xs leading-relaxed text-ink-muted">
        By creating an account, you agree to our{" "}
        <Link href="/terms-of-service" className="font-semibold text-brand-800 hover:underline">Terms of Service</Link>,{" "}
        <Link href="/privacy-policy" className="font-semibold text-brand-800 hover:underline">Privacy Policy</Link> and{" "}
        <Link href="/anti-spam-policy" className="font-semibold text-brand-800 hover:underline">Anti-spam Policy</Link>.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useFormState(forgotPasswordAction, initialFormState);
  useActionToast(state);
  return (
    <form action={action} className="space-y-5">
      <Field label="Sign-in email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="username" required /></Field>
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
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={8} required />
      </Field>
      <SubmitButton pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}

/** Accepting an invitation: choose the password for the company email you were given. */
export function AcceptInviteForm({ token, rejoin }: { token: string; rejoin: boolean }) {
  const [state, action] = useFormState(acceptInviteAction.bind(null, token), initialFormState);
  useActionToast(state);
  return (
    <form action={action} className="space-y-5">
      {rejoin ? (
        <p className="text-sm text-ink-soft">You already have an account for this email. Accept to rejoin, then log in with your existing password.</p>
      ) : (
        <>
          <Field label="Choose a password" htmlFor="password" hint="At least 8 characters.">
            <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword">
            <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={8} required />
          </Field>
        </>
      )}
      <SubmitButton pendingText="Setting up…">{rejoin ? "Accept invitation" : "Create password and continue"}</SubmitButton>
      <p className="text-center text-xs leading-relaxed text-ink-muted">
        By continuing, you agree to our{" "}
        <Link href="/terms-of-service" className="font-semibold text-brand-800 hover:underline">Terms of Service</Link>,{" "}
        <Link href="/privacy-policy" className="font-semibold text-brand-800 hover:underline">Privacy Policy</Link> and{" "}
        <Link href="/anti-spam-policy" className="font-semibold text-brand-800 hover:underline">Anti-spam Policy</Link>.
      </p>
    </form>
  );
}
