"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode;
  /** Kept so existing callers still compile. The label no longer changes while pending, so the button keeps its width. */
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className={className ?? "w-full"} size="lg">
      {children}
    </Button>
  );
}

/** True when anything in the form differs from what was rendered (typed text, a changed select, a ticked box, a chosen file). */
function formHasChanges(form: HTMLFormElement): boolean {
  for (const el of Array.from(form.elements)) {
    if (el instanceof HTMLSelectElement) {
      if (Array.from(el.options).some((o) => o.selected !== o.defaultSelected)) return true;
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.value !== el.defaultValue) return true;
    } else if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked !== el.defaultChecked) return true;
      } else if (el.type === "file") {
        if (el.files && el.files.length > 0) return true;
      } else if (!["hidden", "submit", "button", "reset", "image"].includes(el.type)) {
        if (el.value !== el.defaultValue) return true;
      }
    }
  }
  return false;
}

/**
 * A submit button for a form that calls a server action: shows a spinner while it runs and keeps its label.
 *
 * `requireChange` is for forms that edit saved values: the button stays disabled (with a "No changes to save"
 * tooltip) until something in the form differs from what is saved, so pressing Save never "saves" nothing.
 * It compares each field with the value it was rendered with, so after a successful save (the page re-renders
 * with the new values) it goes back to disabled, and after a failed save it stays enabled to try again.
 */
export function ActionButton({
  children, variant, size, className, requireChange = false,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  requireChange?: boolean;
}) {
  const { pending } = useFormStatus();
  const anchor = useRef<HTMLSpanElement>(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (!requireChange) return;
    const form = anchor.current?.closest("form");
    if (!form) return;
    const check = () => setChanged(formHasChanges(form));
    check();
    form.addEventListener("input", check);
    form.addEventListener("change", check);
    form.addEventListener("reset", () => setTimeout(check));
    return () => {
      form.removeEventListener("input", check);
      form.removeEventListener("change", check);
    };
  }, [requireChange]);

  // When a save finishes, the page has re-rendered: look again at what differs from what is now saved.
  useEffect(() => {
    if (!requireChange || pending) return;
    const form = anchor.current?.closest("form");
    if (form) setChanged(formHasChanges(form));
  }, [requireChange, pending]);

  const button = <Button type="submit" variant={variant} size={size} className={className} loading={pending} disabled={requireChange && !changed}>{children}</Button>;
  if (!requireChange) return button;
  return (
    <span ref={anchor} className="contents">
      <Tooltip label={changed || pending ? "" : "No changes to save"} align="end">{button}</Tooltip>
    </span>
  );
}