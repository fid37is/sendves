"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { Info } from "lucide-react";
import { contactAction } from "./actions";
import { initialFormState } from "@/lib/auth/types";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";

const ABUSE_TOPIC = "abuse";
const ABUSE_HINT = "Received a suspicious or unsolicited email? Tell us why you believe it may be abusive. You can report it even if you don’t know which email platform sent it.";
const PLACEHOLDERS = {
  abuse: "Describe the email, including the sender’s address, subject, and why you’re reporting it. Include message headers if available.",
  other: "How can we help you?",
};

export function ContactForm() {
  const [state, action] = useFormState(contactAction, initialFormState);
  const [topic, setTopic] = useState("general");
  const [hintOpen, setHintOpen] = useState(false);
  const hintRef = useRef<HTMLSpanElement | null>(null);
  useActionToast(state);

  const isAbuse = topic === ABUSE_TOPIC;

  // The bubble opens when "Report spam or suspected abuse" is chosen and is gone for other topics.
  useEffect(() => {
    setHintOpen(isAbuse);
  }, [isAbuse]);

  // Dismiss on Escape or a click elsewhere. The info icon brings it back.
  useEffect(() => {
    if (!hintOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHintOpen(false); };
    const onDown = (e: PointerEvent) => { if (!hintRef.current?.contains(e.target as Node)) setHintOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [hintOpen]);

  return (
    <form action={action} className="space-y-5 rounded-3xl border border-mist bg-white p-7 sm:p-9">
      <Field label="Your name" htmlFor="name"><Input id="name" name="name" autoComplete="name" required /></Field>
      <Field label="Email address" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Topic" htmlFor="topic">
        <Select id="topic" name="topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="general">General question</option>
          <option value="sales">Pricing and plans</option>
          <option value="support">Account support</option>
          <option value={ABUSE_TOPIC}>Report spam or suspected abuse</option>
        </Select>
      </Field>
      <div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <Label htmlFor="message" className="mb-0">Message</Label>
          {isAbuse ? (
            <span ref={hintRef} className="relative inline-flex">
              <button
                type="button"
                onClick={() => setHintOpen((o) => !o)}
                aria-label="About reporting abuse"
                aria-expanded={hintOpen}
                aria-controls="message-hint"
                className="rounded-full p-0.5 text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
              >
                <Info className="h-4 w-4" aria-hidden="true" />
              </button>
              {/* Floats over the page, so opening or closing it never moves the form. */}
              <span
                id="message-hint"
                role="note"
                className={
                  hintOpen
                    ? "absolute bottom-full left-0 z-10 mb-2.5 w-64 max-w-[calc(100vw-5rem)] rounded-2xl rounded-bl-sm border border-mist bg-white px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft shadow-lg shadow-night/10"
                    : "sr-only"
                }
              >
                {ABUSE_HINT}
                {hintOpen ? <span aria-hidden="true" className="absolute -bottom-[5px] left-2 h-2.5 w-2.5 rotate-45 border-b border-r border-mist bg-white" /> : null}
              </span>
            </span>
          ) : null}
        </div>
        <Textarea
          id="message"
          name="message"
          required
          placeholder={isAbuse ? PLACEHOLDERS.abuse : PLACEHOLDERS.other}
          aria-describedby={isAbuse ? "message-hint" : undefined}
          onFocus={() => setHintOpen(false)}
        />
      </div>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Sending…" className="px-8">Send message</SubmitButton>
      </div>
    </form>
  );
}