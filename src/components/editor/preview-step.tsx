"use client";

import { Button } from "@/components/ui/button";
import { Seg, SelectBox } from "@/components/editor/controls";
import { MailFrame } from "@/components/editor/mail-frame";
import { cn } from "@/lib/utils";

export type PreviewVariant = { id: string; label: string; doc: string; subject: string };

type Props = {
  /** The email for the chosen contact. */
  single: PreviewVariant;
  /** Side by side: a few contacts, then one with no data. Used by "Compare contacts". */
  compare: PreviewVariant[];
  preheader: string;
  contacts: { id: string; label: string }[];
  contactId: string;
  onContact: (id: string) => void;
  comparing: boolean;
  onCompare: () => void;
  device: "desk" | "mob";
  onDevice: (d: "desk" | "mob") => void;
  dark: boolean;
  onDark: () => void;
  onBack: () => void;
  onContinue?: () => void;
};

const Subject = ({ v, preheader, className }: { v: PreviewVariant; preheader: string; className?: string }) => (
  <div className={cn("mx-auto mb-2.5 max-w-[640px] text-[13px] text-ink-muted", className)}><b className="text-ink">{v.subject || "(no subject)"}</b>{preheader ? ` — ${preheader}` : ""}</div>
);

/** Step 3: the email as one contact receives it, on desktop or mobile, light or dark. */
export function PreviewStep(p: Props) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-mist bg-white px-3 py-2.5 sm:px-5">
        <Button size="sm" variant="outline" onClick={p.onBack}>Back to editor</Button>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={p.onCompare}>{p.comparing ? "Single view" : "Compare contacts"}</Button>
        <Seg label="Preview size" value={p.device} onChange={p.onDevice} options={[{ value: "desk", label: "Desktop" }, { value: "mob", label: "Mobile" }]} />
        <Button size="sm" variant="outline" onClick={p.onDark}>Theme: {p.dark ? "Light" : "Dark"}</Button>
        <SelectBox aria-label="Preview as contact" className="w-full flex-1 sm:w-auto sm:flex-none" value={p.contactId} onChange={(e) => p.onContact(e.target.value)}>
          {p.contacts.map((c) => <option key={c.id} value={c.id}>Preview as {c.label}</option>)}
        </SelectBox>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-5">
        {p.comparing ? (
          <div className="flex flex-wrap items-start justify-center gap-4">
            {p.compare.map((v) => (
              <div key={v.id} className="w-[300px]">
                <div className="mb-1.5 text-[13px] text-ink-muted">{v.label}</div>
                <MailFrame doc={v.doc} title={`Email preview: ${v.label}`} />
              </div>
            ))}
          </div>
        ) : (
          <div className={cn("w-[640px] max-w-full transition-[width] duration-200", p.device === "mob" && "w-[375px]")}>
            <Subject v={p.single} preheader={p.preheader} className="mx-0 max-w-none" />
            <MailFrame doc={p.single.doc} title="Email preview" />
          </div>
        )}
      </div>

      {p.onContinue ? (
        <div className="flex justify-end gap-2 border-t border-mist bg-white px-4 py-2.5">
          <Button size="sm" onClick={p.onContinue}>Continue to send</Button>
        </div>
      ) : null}
    </>
  );
}
