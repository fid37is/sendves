"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { Field } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";
import { initialFormState } from "@/lib/auth/types";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [state, action] = useFormState(changePasswordAction, initialFormState);
  const ref = useRef<HTMLFormElement>(null);
  useActionToast(state);
  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-5 p-6">
      <Field label="Current password" htmlFor="current"><PasswordInput id="current" name="current" autoComplete="current-password" required /></Field>
      <Field label="New password" htmlFor="password" hint="At least 12 characters."><PasswordInput id="password" name="password" autoComplete="new-password" minLength={12} required /></Field>
      <Field label="Confirm new password" htmlFor="confirmPassword"><PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={12} required /></Field>
      <SubmitButton pendingText="Changing…" className="w-auto">Change password</SubmitButton>
    </form>
  );
}
