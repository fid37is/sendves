"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { TEMPLATE_THUMBS, type TemplateKey } from "@/lib/email/campaign";
import { cn } from "@/lib/utils";

/** A row of choices where exactly one is on (Desktop / Mobile, Left / Center / Right…). */
export function Seg<T extends string>({ value, options, onChange, label, className }: {
  value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string; className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex overflow-hidden rounded-full border border-mist bg-white", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("px-3 py-1.5 text-[13px] transition-colors", value === o.value ? "bg-brand-50 font-semibold text-brand-800" : "text-ink-soft hover:bg-mist-100")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The label above a field in the side panel. */
export function Lbl({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="mb-1.5 mt-3.5 block text-[13px] font-semibold text-ink">{children}</label>;
}

export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-1 text-xs text-ink-muted", className)}>{children}</p>;
}

const STRIPE: Record<string, string> = {
  l: "w-2/5 bg-ink-muted/60",
  b: "h-3 bg-accent-400",
  h: "h-[5px] w-[70%] bg-ink",
  B: "h-[5px] w-[36%] bg-brand-700",
  c: "h-[7px] bg-[repeating-linear-gradient(90deg,rgb(var(--c-accent-600))_0_10px,transparent_10px_13px)]",
  p: "h-2.5 bg-[repeating-linear-gradient(90deg,rgb(var(--c-ink-muted)/.5)_0_10px,transparent_10px_13px)]",
  t: "bg-mist",
  f: "bg-mist",
};

/** A tiny picture of a template's layout. */
export function LayoutThumb({ layout }: { layout: TemplateKey }) {
  return (
    <div aria-hidden="true" className="flex w-[50px] flex-none flex-col gap-[3px] rounded border border-mist bg-white p-1">
      {[...TEMPLATE_THUMBS[layout]].map((c, i) => <i key={i} className={cn("block h-[3px] rounded-[1px]", STRIPE[c])} />)}
    </div>
  );
}

const field =
  "w-full rounded-lg border border-mist bg-white px-3 text-sm text-ink placeholder:text-ink-muted transition-colors hover:border-ink/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 read-only:bg-mist-50 disabled:bg-mist-50";
const HEIGHT = { xs: "h-8", sm: "h-9", md: "h-10" } as const;
type Size = { size?: keyof typeof HEIGHT };

/** Compact form fields for the editor (the shared ones are sized for full-page forms). */
export function TextInput({ size = "sm", className, ...p }: InputHTMLAttributes<HTMLInputElement> & Size) {
  return <input className={cn(field, HEIGHT[size], className)} {...p} />;
}
export function SelectBox({ size = "sm", className, ...p }: SelectHTMLAttributes<HTMLSelectElement> & Size) {
  return <select className={cn(field, HEIGHT[size], className)} {...p} />;
}
export function TextArea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "py-2", className)} {...p} />;
}
