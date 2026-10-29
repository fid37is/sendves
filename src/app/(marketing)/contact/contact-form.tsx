"use client";

import { useFormState } from "react-dom";
import { contactAction } from "./actions";
import { initialFormState } from "@/lib/auth/types";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";

export function ContactForm() {
  const [state, action] = useFormState(contactAction, initialFormState);
  useActionToast(state);

  return (
    <form action={action} className="space-y-5 rounded-3xl border border-mist bg-white p-7 sm:p-9">
      <Field label="Your name" htmlFor="name"><Input id="name" name="name" autoComplete="name" required /></Field>
      <Field label="Email address" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Topic" htmlFor="topic">
        <Select id="topic" name="topic" defaultValue="general">
          <option value="general">General question</option>
          <option value="sales">Pricing and plans</option>
          <option value="support">Account support</option>
          <option value="abuse">Report abuse</option>
        </Select>
      </Field>
      <Field label="Message" htmlFor="message"><Textarea id="message" name="message" required /></Field>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pendingText="Sending…">Send message</SubmitButton>
    </form>
  );
}
