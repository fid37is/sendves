"use client";

import { useFormState } from "react-dom";
import { useState, useTransition } from "react";
import { adminSignInAction, startEnrollAction, verifyMfaAction, type EnrollState } from "./auth-actions";
import { initialFormState } from "@/lib/auth/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast, useActionToast } from "@/components/ui/toast";

export function AdminLoginForm() {
  const [state, action] = useFormState(adminSignInAction, initialFormState);
  useActionToast(state);
  return (
    <form action={action} className="space-y-5">
      <Field label="Email address" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="username" required /></Field>
      <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

function CodeForm({ factorId }: { factorId: string }) {
  const [state, action] = useFormState(verifyMfaAction, {} as EnrollState);
  useActionToast(state);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="factorId" value={factorId} />
      <Field label="6-digit code" htmlFor="code">
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="text-center font-mono text-lg tracking-[0.4em]" />
      </Field>
      <SubmitButton pendingText="Verifying…">Verify and continue</SubmitButton>
    </form>
  );
}

/** Returning admins: just enter the code. */
export function MfaChallenge({ factorId }: { factorId: string }) {
  return <CodeForm factorId={factorId} />;
}

/** First sign-in: scan a QR code, then confirm with a code. */
export function MfaEnroll() {
  const [pending, start] = useTransition();
  const [setup, setSetup] = useState<EnrollState | null>(null);

  function begin() {
    start(async () => {
      const res = await startEnrollAction();
      if (res.error) toast.error(res.error);
      else setSetup(res);
    });
  }

  if (!setup?.factorId) {
    return <Button type="button" size="lg" className="w-full" onClick={begin} disabled={pending}>{pending ? "Preparing…" : "Set up authenticator app"}</Button>;
  }
  return (
    <div className="space-y-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="QR code to add this account to your authenticator app" className="mx-auto h-44 w-44 rounded-xl border border-lavender p-2" />
      <p className="text-center text-xs text-ink-muted">Can’t scan? Enter this key manually:<br /><span className="select-all break-all font-mono text-ink">{setup.secret}</span></p>
      <CodeForm factorId={setup.factorId} />
    </div>
  );
}
