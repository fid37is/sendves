"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Full-width preview of the email, opened from the campaign editor's Preview button.
 * Layout: Back at the top left, Desktop / Mobile switch centred below it, then the email itself.
 * The email is shown exactly as it will arrive (variables resolved, formatting and images intact),
 * but it is inert: the frame is sandboxed and links and buttons in it do nothing.
 */
export function CampaignPreview({
  doc, subject, from, asLabel, onBack,
}: {
  /** The finished email HTML (already inert; see buildPreviewDoc). */
  doc: string;
  subject: string;
  from: string;
  /** Who the variables were filled in for, e.g. "Ada Lovelace (sample)". */
  asLabel: string;
  onBack: () => void;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const back = useRef<HTMLButtonElement>(null);

  // Keyboard users land on Back when the view opens.
  useEffect(() => { back.current?.focus(); window.scrollTo({ top: 0 }); }, []);

  const pill = (value: "desktop" | "mobile", label: string, Icon: typeof Monitor) => (
    <button
      type="button"
      aria-pressed={device === value}
      onClick={() => setDevice(value)}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500",
        device === value ? "bg-brand-700 text-white" : "bg-white text-ink-soft ring-1 ring-mist hover:bg-mist-100",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />{label}
    </button>
  );

  return (
    <section aria-label="Email preview" className="space-y-4">
      <div>
        <button
          ref={back}
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-full py-1.5 pl-1 pr-3 text-sm font-semibold text-ink hover:bg-mist-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />Back to editor
        </button>
      </div>

      <div role="group" aria-label="Preview size" className="flex justify-center gap-3">
        {pill("desktop", "Desktop", Monitor)}
        {pill("mobile", "Mobile", Smartphone)}
      </div>

      <div className="rounded-3xl border border-mist bg-mist-50 p-3 sm:p-6">
        <div
          className={cn("mx-auto overflow-hidden rounded-2xl border border-mist bg-white shadow-sm transition-[width] duration-200", device === "mobile" ? "w-[390px] max-w-full" : "w-full")}
          data-device={device}
        >
          <dl className="space-y-1 border-b border-mist px-5 py-3 text-sm">
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-ink-muted">Subject</dt><dd className="min-w-0 break-words font-semibold text-ink">{subject || "(no subject yet)"}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-ink-muted">From</dt><dd className="min-w-0 break-words text-ink-soft">{from || "No sender chosen yet"}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-ink-muted">Shown as</dt><dd className="min-w-0 break-words text-ink-soft">{asLabel}</dd></div>
          </dl>
          <iframe title="Email preview" srcDoc={doc} sandbox="" className="block h-[calc(100vh-20rem)] min-h-[480px] w-full bg-white" />
        </div>
      </div>
    </section>
  );
}
