"use client";

import { Button } from "@/components/ui/button";
import type { SenderRow } from "@/lib/queries";
import { Hint, SelectBox, TextInput } from "@/components/editor/controls";

export const usableSender = (s: SenderRow) => s.status === "active" && s.domainReady;

/** Why the chosen sender can't be used, or null when it can. */
export function senderProblem(senders: SenderRow[], senderId: string): string | null {
  if (!senders.length) return "You don’t have a work email yet. Set one under Team (the owner can do this for you).";
  const s = senders.find((x) => x.id === senderId);
  if (!s) return "Choose who this email comes from.";
  if (s.status !== "active") return `${s.email} is deactivated.`;
  if (!s.domainReady) return `The domain of ${s.email} isn’t verified.`;
  return null;
}

const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="mb-1.5 mt-3.5 block text-[13px] font-semibold text-ink">{children}</label>
);

type Props = {
  senders: SenderRow[];
  senderId: string;
  onSender: (id: string) => void;
  audienceValue: string;
  audienceOptions: { value: string; label: string }[];
  onAudience: (value: string) => void;
  /** People reached by the chosen audience; null while it is being counted. */
  reach: number | null;
  subject: string;
  onSubject: (v: string) => void;
  preheader: string;
  onPreheader: (v: string) => void;
  onNext: () => void;
};

/** Step 1: who it's from, who gets it, and what they see in the inbox. */
export function SetupStep(p: Props) {
  const sender = p.senders.find((s) => s.id === p.senderId) ?? null;
  const problem = senderProblem(p.senders, p.senderId);
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-7">
      <div className="mx-auto max-w-[680px] rounded-xl border border-mist bg-white p-6">
        <h2 className="text-lg font-bold text-ink">Campaign setup</h2>
        <p className="mb-5 text-ink-muted">Who it’s from, who gets it, and what they see in the inbox.</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="fromName">Sender name</Label>
            <TextInput id="fromName" size="md" value={sender?.fromName ?? ""} readOnly placeholder="Comes from the sender email" />
          </div>
          <div>
            <Label htmlFor="fromMail">Sender email</Label>
            <SelectBox id="fromMail" size="md" value={p.senderId} onChange={(e) => p.onSender(e.target.value)} aria-invalid={problem && p.senders.length ? true : undefined}>
              <option value="">{p.senders.length ? "Choose a sender…" : "No work email yet"}</option>
              {p.senders.map((s) => (
                <option key={s.id} value={s.id} disabled={!usableSender(s) && s.id !== p.senderId}>
                  {s.email}{s.status !== "active" ? " (deactivated)" : !s.domainReady ? " (domain not verified)" : ""}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>
        {problem && p.senders.length === 0 ? <p className="mt-1.5 text-xs font-medium text-danger">{problem}</p> : <Hint>The name is the one set for this email address under Team.</Hint>}

        <Label htmlFor="aud">Audience</Label>
        <SelectBox id="aud" size="md" value={p.audienceValue} onChange={(e) => p.onAudience(e.target.value)}>
          {p.audienceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectBox>
        <Hint>{p.audienceValue === "" ? "Choose who receives this campaign" : p.reach === null ? "Counting…" : `Estimated reach: ${p.reach.toLocaleString("en-US")} ${p.reach === 1 ? "contact" : "contacts"}`}</Hint>

        <Label htmlFor="subject">Subject</Label>
        <TextInput id="subject" size="md" value={p.subject} maxLength={200} onChange={(e) => p.onSubject(e.target.value)} placeholder="What’s this email about?" />
        <Hint className="flex justify-between"><span>Aim for under 60 characters</span><span>{p.subject.length}</span></Hint>

        <Label htmlFor="pre">Preheader</Label>
        <TextInput id="pre" size="md" value={p.preheader} maxLength={200} onChange={(e) => p.onPreheader(e.target.value)} placeholder="A short line that follows the subject" />
        <Hint className="flex justify-between"><span>Shown after the subject in most inboxes</span><span>{p.preheader.length}</span></Hint>

        <div className="mt-3.5 rounded-lg border border-dashed border-mist px-3 py-2.5 text-[13px]">
          <b className="mr-2 inline-block">{p.subject || "Your subject appears here"}</b>
          <span className="text-ink-muted">{p.preheader || "Preheader text follows"}</span>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={p.onNext}>Next: Content</Button>
        </div>
      </div>
    </div>
  );
}
