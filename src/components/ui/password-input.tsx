"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field with a show/hide toggle. Drop-in for <Input type="password">: the field keeps
 * its name, id, autocomplete and validation, only the visible type switches. The toggle is a real
 * button (keyboard reachable, announced as pressed/unpressed) and never submits the form.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-12", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-mist-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
});
