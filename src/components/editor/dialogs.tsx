"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BLOCK_LABELS, customizeCarryOver, planTemplateSwitch, SCHEDULE_ZONES, TEMPLATE_NAMES,
  type Check, type ContentScan, type Design, type Layout, type ScheduleZoneKey,
} from "@/lib/email/campaign";
import { cn } from "@/lib/utils";
import { SelectBox, TextInput } from "@/components/editor/controls";
import { Modal } from "@/components/editor/modal";

const Lbl = ({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="mb-1.5 mt-3.5 block text-[13px] font-semibold text-ink">{children}</label>
);
const Title = ({ id, children }: { id?: string; children: React.ReactNode }) => <h3 id={id} className="mb-1 text-[17px] font-bold text-ink">{children}</h3>;
const Lead = ({ children }: { children: React.ReactNode }) => <p className="mb-3.5 text-ink-muted">{children}</p>;
const Sub = ({ children }: { children: React.ReactNode }) => <b className="mt-2.5 block text-ink">{children}</b>;

function List({ items }: { items: string[] }) {
  return items.length ? <ul className="mt-2 list-disc pl-[18px] text-xs text-ink-muted">{items.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-1 text-xs text-ink-muted">Nothing.</p>;
}

// ── Schedule ────────────────────────────────────────────────────────────────

export type ScheduleValues = { date: string; time: string; zone: ScheduleZoneKey };

export function ScheduleDialog({ open, onClose, onContinue }: { open: boolean; onClose: () => void; onContinue: (v: ScheduleValues) => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [zone, setZone] = useState<ScheduleZoneKey>("lagos");
  return (
    <Modal open={open} onClose={onClose} label="Schedule send">
      <Title>Schedule send</Title>
      <Lead>Choose when this campaign goes out.</Lead>
      <div className="grid grid-cols-2 gap-3">
        <div><Lbl htmlFor="sd">Date</Lbl><TextInput id="sd" type="date" size="md" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Lbl htmlFor="st">Time</Lbl><TextInput id="st" type="time" size="md" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <Lbl htmlFor="stz">Timezone</Lbl>
      <SelectBox id="stz" size="md" value={zone} onChange={(e) => setZone(e.target.value as ScheduleZoneKey)}>
        {SCHEDULE_ZONES.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
      </SelectBox>
      <div className="mt-5 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={() => onContinue({ date, time, zone })}>Continue to review</Button>
      </div>
    </Modal>
  );
}

// ── Saving as a template ────────────────────────────────────────────────────

/** Asks for a name, then keeps the email's layout and content as a template. */
export function SaveTemplateDialog({ open, defaultName, saving, error, onClose, onSave }: {
  open: boolean; defaultName: string; saving: boolean; error: string | null; onClose: () => void; onSave: (name: string, description: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  useEffect(() => { if (open) { setName(defaultName); setDescription(""); } }, [open, defaultName]);
  return (
    <Modal open={open} onClose={onClose} label="Save as template" closable={!saving}>
      <Title>Save as template</Title>
      <p className="text-ink-soft">Keeps the layout, content, colours and pictures. New campaigns made from it start exactly like this.</p>
      <Lbl htmlFor="tplName">Template name</Lbl>
      <TextInput id="tplName" size="md" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      <Lbl htmlFor="tplDesc">Short description (optional)</Lbl>
      <TextInput id="tplDesc" size="md" value={description} maxLength={200} placeholder="When to use it" onChange={(e) => setDescription(e.target.value)} />
      {error ? <p className="mt-2 text-xs font-medium text-danger" role="alert">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={saving} disabled={!name.trim()} onClick={() => onSave(name.trim(), description.trim())}>Save template</Button>
      </div>
    </Modal>
  );
}

// ── Switching layouts ───────────────────────────────────────────────────────

export function SwitchDialog({ target, design, onClose, onConfirm }: { target: Layout | null; design: Design; onClose: () => void; onConfirm: () => void }) {
  if (!target) return null;
  const toCustom = target === "custom";
  const title = toCustom ? "Customize layout" : `Switch to ${TEMPLATE_NAMES[target]} template`;
  const plan = planTemplateSwitch(design);
  return (
    <Modal open onClose={onClose} label={title}>
      <Title>{title}</Title>
      {toCustom ? (
        <>
          <p className="text-ink-soft">You’ll get free-form blocks you can add, remove and reorder. The template’s layout won’t come back by itself.</p>
          <Sub>Carries over</Sub>
          <List items={customizeCarryOver(design)} />
          {design.tray.length ? <><Sub>Restored from before</Sub><List items={design.tray.map((b) => BLOCK_LABELS[b.t])} /></> : null}
        </>
      ) : (
        <>
          <p className="text-ink-soft">The {TEMPLATE_NAMES[target]} template has a fixed layout. You’ll edit its content only.</p>
          <Sub>Carries over</Sub>
          <List items={plan.keep} />
          {plan.aside.length ? (
            <>
              <Sub>Set aside</Sub>
              <List items={plan.aside.map((b) => BLOCK_LABELS[b.t])} />
              <p className="mt-1 text-xs text-ink-muted">Set-aside blocks aren’t in the email. They return if you customize the layout again.</p>
            </>
          ) : null}
        </>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={onConfirm}>{toCustom ? "Customize layout" : "Use template"}</Button>
      </div>
    </Modal>
  );
}

// ── Review and send ─────────────────────────────────────────────────────────

export type SendOutcome = { title: string; body: string };

type ReviewProps = {
  open: boolean;
  mode: "now" | "sched";
  onClose: () => void;
  checks: Check[];
  onFix: (c: Check) => void;
  subject: string;
  preheader: string;
  senderName: string;
  audienceName: string;
  size: number | null;
  scheduleLabel: string | null;
  scan: ContentScan;
  hasLogo: boolean;
  onCheckOn: (v: "desk" | "mob" | "dark") => void;
  phase: "review" | "sending" | "done";
  outcome: SendOutcome | null;
  onSend: () => void;
  onDone: () => void;
};

export function ReviewDialog(p: ReviewProps) {
  const all = p.checks.every((c) => c.ok);
  const contacts = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "contact" : "contacts"}`;
  const level = p.scan.score < 20 ? { tone: "bg-success", name: "Low" } : p.scan.score < 45 ? { tone: "bg-warning", name: "Medium" } : { tone: "bg-danger", name: "High" };
  const sched = p.mode === "sched";
  const closable = p.phase !== "sending";
  const onClose = p.phase === "done" ? p.onDone : p.onClose;

  return (
    <Modal open={p.open} onClose={onClose} closable={closable} wide={p.phase === "review"} label={p.phase === "review" ? "Review before sending" : p.phase === "sending" ? "Sending" : "Done"}>
      {p.phase === "sending" ? (
        <>
          <Title>{sched ? "Scheduling…" : "Sending…"}</Title>
          <Lead>{p.size === null ? "Getting your campaign ready" : contacts(p.size)}</Lead>
          <div className="h-1.5 overflow-hidden rounded-full bg-mist" role="progressbar" aria-label={sched ? "Scheduling" : "Sending"}><div className="h-full w-full animate-pulse rounded-full bg-brand-700" /></div>
        </>
      ) : p.phase === "done" && p.outcome ? (
        <>
          <Title>{p.outcome.title}</Title>
          <Lead>{p.outcome.body}</Lead>
          <div className="mt-5 flex justify-end"><Button size="sm" onClick={p.onDone}>Done</Button></div>
        </>
      ) : (
        <>
          <Title>Review before sending</Title>
          <Lead>Fix anything marked ✕ to enable sending.</Lead>
          <div className="grid gap-5 min-[761px]:grid-cols-2">
            <div>
              <div>
                {p.checks.map((c) => (
                  <div key={c.key} className="flex gap-2.5 border-t border-mist py-2">
                    <i className={cn("w-[18px] flex-none text-center font-bold not-italic", !c.ok ? "text-danger" : c.warn ? "text-warning" : "text-success")} aria-hidden="true">{!c.ok ? "✕" : c.warn ? "!" : "✓"}</i>
                    <div>
                      <span className="sr-only">{!c.ok ? "Needs fixing: " : c.warn ? "Worth a look: " : "Passed: "}</span>
                      {c.title}
                      {c.detail ? <small className="block text-ink-muted">{c.detail}</small> : null}
                    </div>
                    {!c.ok && c.fix ? <Button size="sm" variant="outline" className="ml-auto flex-none self-center whitespace-nowrap" onClick={() => p.onFix(c)}>{c.fix}</Button> : null}
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-mist-50 px-3 py-2.5">
                <b className="text-ink">{p.subject || "(no subject)"}</b><br />
                {p.audienceName} · {p.size === null ? "…" : contacts(p.size)}<br />
                {sched && p.scheduleLabel ? `Scheduled for ${p.scheduleLabel}` : "Sends immediately"}
              </div>
            </div>
            <div>
              <div className="mt-2 rounded-lg border border-mist px-3 py-2.5 text-[13px]">
                <div className="flex justify-between"><b className="text-ink">{p.senderName || "No sender"}</b><span className="text-ink-muted">9:41</span></div>
                <div><b className="text-ink">{p.subject || "(no subject)"}</b> <span className="text-ink-muted">{p.preheader}</span></div>
              </div>
              <div>
                <Lbl>Content checks · {p.scan.reasons.length ? `${p.scan.reasons.length} to review` : "no issues found"}</Lbl>
                <div className="h-1.5 overflow-hidden rounded-full bg-mist" role="img" aria-label={`Content risk: ${level.name}`}><i className={cn("block h-full transition-[width] duration-200", level.tone)} style={{ width: `${Math.max(p.scan.score, 4)}%` }} /></div>
                {p.scan.reasons.length ? <ul className="mt-2 list-disc pl-[18px] text-xs text-ink-muted">{p.scan.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="mt-1 text-xs text-ink-muted">These basic checks found nothing to flag. They don’t predict inbox placement.</p>}
              </div>
              <div>
                <Lbl>Check it on</Lbl>
                <div className="inline-flex overflow-hidden rounded-full border border-mist">
                  {([["desk", "Desktop"], ["mob", "Mobile"], ["dark", "Dark mode"]] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => p.onCheckOn(k)} className="px-3 py-1.5 text-[13px] text-ink-soft hover:bg-mist-100">{label}</button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-ink-muted">{p.hasLogo ? "Check your logo against a dark background." : "A single column keeps mobile readable."}</p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={p.onClose}>Keep editing</Button>
            <Button size="sm" disabled={!all} onClick={p.onSend}>{sched ? "Schedule campaign" : p.size === null ? "Send now" : `Send to ${contacts(p.size)}`}</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
