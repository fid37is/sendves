"use client";

import { Button } from "@/components/ui/button";
import type { SenderRow } from "@/lib/queries";
import { MAX_PASTED_RECIPIENTS, type PasteParse } from "@/lib/validation/paste-contacts";
import type { IngestResult } from "@/server/audience";
import { Hint, Seg, SelectBox, TextArea, TextInput } from "@/components/editor/controls";

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

/** The "Type or paste" audience: the text, what the browser makes of it, and what the server did with it. */
export type PasteState = {
  text: string;
  onText: (v: string) => void;
  /** The browser's quick reading of the text, for instant feedback. The server reads it again and decides. */
  parse: PasteParse;
  consent: boolean;
  onConsent: (v: boolean) => void;
  /** People who may add contacts must confirm the permission to email them. */
  needsConsent: boolean;
  adding: boolean;
  onAdd: () => void;
  report: IngestResult | null;
  /** People already in the audience from typed or pasted addresses. */
  picked: number;
  onClear: () => void;
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The live note under the text box: how many addresses are good, duplicated or unreadable. */
export function pasteNote(parse: PasteParse): string {
  if (parse.contacts.length === 0 && parse.invalidCount === 0) return "Add at least one valid email address";
  const parts = [
    parse.contacts.length ? `${plural(parse.contacts.length, "valid address", "valid addresses")}` : "No valid addresses",
    parse.duplicates ? `${plural(parse.duplicates, "duplicate", "duplicates")} removed` : "",
    parse.invalidCount ? `${plural(parse.invalidCount, "invalid address", "invalid addresses")} skipped` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

type Props = {
  senders: SenderRow[];
  senderId: string;
  onSender: (id: string) => void;
  audienceValue: string;
  audienceOptions: { value: string; label: string }[];
  onAudience: (value: string) => void;
  /** People reached by the chosen audience; null while it is being counted. */
  reach: number | null;
  audMode: "list" | "paste";
  onAudMode: (m: "list" | "paste") => void;
  paste: PasteState;
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
        {sender ? (
          <p className="mt-1 text-xs" role="status">
            <span className={sender.domainReady ? "font-medium text-success" : "font-medium text-danger"}>{sender.domainReady ? "✓ " : "✕ "}</span>
            <span className="text-ink-muted">{sender.domainReady ? "Domain authentication passes (DKIM, SPF and DMARC). Inbox placement also depends on your sender reputation and list quality." : "This domain isn’t verified yet (DKIM, SPF and DMARC must pass). Fix it under Sending domains before you send."}</span>
          </p>
        ) : null}

        <Label htmlFor="aud">Audience</Label>
        <Seg label="Audience source" value={p.audMode} onChange={p.onAudMode} options={[{ value: "list", label: "From a list" }, { value: "paste", label: "Type or paste" }]} />

        {p.audMode === "list" ? (
          <div className="mt-2.5">
            <SelectBox id="aud" size="md" value={p.audienceValue} onChange={(e) => p.onAudience(e.target.value)}>
              {p.audienceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectBox>
            <Hint>{p.audienceValue === "" ? "Choose who receives this campaign" : p.reach === null ? "Counting…" : `Estimated reach: ${p.reach.toLocaleString("en-US")} ${p.reach === 1 ? "contact" : "contacts"}`}</Hint>
          </div>
        ) : (
          <div className="mt-2.5">
            <label htmlFor="audText" className="sr-only">Email addresses</label>
            <TextArea
              id="audText" rows={5} value={p.paste.text} placeholder={"ada@example.com, Emeka Eze <emeka@example.com>\nOne per line, or separated by commas, semicolons or spaces"}
              onChange={(e) => p.paste.onText(e.target.value)} aria-describedby="audNote"
            />
            <p id="audNote" className="mt-1 text-xs text-ink-muted" role="status">
              {pasteNote(p.paste.parse)}
              {p.paste.parse.contacts.length > MAX_PASTED_RECIPIENTS ? <span className="font-medium text-danger"> · Over the limit of {MAX_PASTED_RECIPIENTS.toLocaleString("en-US")}</span> : null}
            </p>
            <Hint>Up to {MAX_PASTED_RECIPIENTS.toLocaleString("en-US")} at a time. For more, import a file into a list on the Contacts page and choose “From a list”.</Hint>

            {p.paste.needsConsent ? (
              <label className="mt-3 flex items-start gap-2 text-[13px] text-ink">
                <input type="checkbox" className="mt-0.5 accent-brand-700" checked={p.paste.consent} onChange={(e) => p.paste.onConsent(e.target.checked)} />
                <span>These people have agreed to receive email from us. Addresses are added to your contacts, and anyone who has unsubscribed, bounced or reported spam is left out.</span>
              </label>
            ) : <Hint>Only addresses already in your contacts can be used; you don’t have permission to add new ones.</Hint>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm" loading={p.paste.adding}
                disabled={p.paste.parse.contacts.length === 0 || p.paste.parse.contacts.length > MAX_PASTED_RECIPIENTS || (p.paste.needsConsent && !p.paste.consent)}
                onClick={p.paste.onAdd}
              >
                Add to audience
              </Button>
              {p.paste.picked > 0 ? <Button size="sm" variant="outline" onClick={p.paste.onClear}>Clear audience</Button> : null}
            </div>

            <p className="mt-2.5 text-[13px] text-ink" role="status">
              {p.paste.picked === 0 ? "No one added yet." : `${plural(p.paste.picked, "person", "people")} in this audience${p.reach !== null && p.reach !== p.paste.picked ? ` · ${plural(p.reach, "will receive it", "will receive it")}` : ""}`}
            </p>

            {p.paste.report && (p.paste.report.skippedCount > 0 || p.paste.report.invalid > 0 || p.paste.report.duplicates > 0) ? (
              <details className="mt-2 rounded-lg border border-mist px-3 py-2 text-xs text-ink-muted">
                <summary className="cursor-pointer font-medium text-ink">{p.paste.report.message || "Some addresses were left out"}</summary>
                {p.paste.report.skipped.length ? (
                  <ul className="mt-2 list-disc pl-[18px]">
                    {p.paste.report.skipped.map((x) => <li key={x.email}><b className="text-ink">{x.email}</b>: {x.reason}</li>)}
                  </ul>
                ) : null}
              </details>
            ) : null}
          </div>
        )}

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
