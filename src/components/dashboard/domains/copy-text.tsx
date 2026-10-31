// src/components/dashboard/domains/copy-text.tsx
"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@/components/ui/toast";

/** Small icon button that copies a DNS host or value. */
export function CopyText({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy.");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className="shrink-0 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-mist-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}
