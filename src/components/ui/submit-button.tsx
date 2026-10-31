"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingText = "Please wait…",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className={className ?? "w-full"} size="lg">
      {pending ? pendingText : children}
    </Button>
  );
}

/** A submit button for a form that calls a server action: shows a spinner while it runs. Keeps its label. */
export function ActionButton({
  children, variant, size, className,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} size={size} className={className} loading={pending}>{children}</Button>;
}
