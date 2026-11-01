"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { AudiencePicker, AudienceSummary, type AudienceActions, type AudienceState } from "@/components/dashboard/audience-panel";
import { toast } from "@/components/ui/toast";
import { switchSummary, TEMPLATE_LABEL, zonedToUtc, type Design, type Mode } from "@/lib/email/design";
import type { AudienceOption } from "@/lib/queries";
import { Dialog } from "./dialog";

const List = ({ items }: { items: string[] }) => (items.length ? <ul className="rs">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="hint">Nothing.</p>);

/** Shows what carries over before the layout changes. */
export function SwitchDialog({ target, design, onCancel, onConfirm }: { target: Mode | null; design: Design; onCancel: () => void; onConfirm: () => void }) {
  const open = target !== null;
  const to = target ?? "custom";
  const s = switchSummary(design, to);
  const custom = to === "custom";
  return (
    <Dialog open={open} onClose={onCancel} label={custom ? "Customize layout" : "Switch template"}>
      <h3>{custom ? "Customize layout" : `Switch to ${TEMPLATE_LABEL[to as keyof typeof TEMPLATE_LABEL]} template`}</h3>
      {custom ? (
        <p>You’ll get free-form blocks you can add, remove and reorder. The template’s layout won’t come back by itself.</p>
      ) : (
        <p>The {TEMPLATE_LABEL[to as keyof typeof TEMPLATE_LABEL]} template has a fixed layout. You’ll edit its content only.</p>
      )}
      <b>Carries over</b>
      <List items={s.keep} />
      {s.restored.length ? <><b>Restored from before</b><List items={s.restored} /></> : null}
      {s.aside.length ? (
        <>
          <b>Set aside</b>
          <List items={s.aside} />
          <p className="hint">Set-aside blocks aren’t in the email. They return if you customize the layout again.</p>
        </>
      ) : null}
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn pri" onClick={onConfirm}>{custom ? "Customize layout" : "Use template"}</button>
      </div>
    </Dialog>
  );
}

export type ScheduleChoice = { iso: string; label: string };

export function ScheduleDialog({ open, timezone, onClose, onContinue }: { open: boolean; timezone: string; onClose: () => void; onContinue: (c: ScheduleChoice) => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const zones = [...new Set([timezone || "UTC", "UTC"])];
  const [tz, setTz] = useState(zones[0]);
  const today = new Date().toISOString().slice(0, 10);

  const go = () => {
    if (!date) return toast.error("Pick a date first.");
    const when = zonedToUtc(date, time || "09:00", tz);
    const now = Date.now();
    if (Number.isNaN(when.getTime()) || when.getTime() < now + 60_000) return toast.error("Pick a time at least a minute from now.");
    if (when.getTime() > now + 90 * 86400_000) return toast.error("You can schedule up to 90 days ahead.");
    onContinue({ iso: when.toISOString(), label: `${date} at ${time || "09:00"}, ${tz}` });
  };

  return (
    <Dialog open={open} onClose={onClose} label="Schedule send">
      <h3>Schedule send</h3>
      <p>Choose when this campaign goes out.</p>
      <div className="row">
        <div><label htmlFor="sd">Date</label><input type="date" id="sd" min={today} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label htmlFor="st">Time</label><input type="time" id="st" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <label htmlFor="stz">Timezone</label>
      <select id="stz" value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z === "UTC" ? "UTC" : z.replace(/_/g, " ")}</option>)}</select>
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn pri" onClick={go}>Continue to review</button>
      </div>
    </Dialog>
  );
}

export type Check = { ok: boolean; warn?: boolean; title: string; detail?: string; fix?: string; onFix?: () => void };
export type ReviewPhase = "review" | "busy" | "done" | "failed";

export function ReviewDialog(p: {
  open: boolean; phase: ReviewPhase; onClose: () => void;
  checks: Check[]; subject: string; preheader: string; fromName: string; audienceName: string; reach: number | null; when: "now" | "sched"; scheduleLabel: string;
  content: { score: number; notes: string[] }; hasLogo: boolean; onDevice: (v: "desk" | "mob" | "dark") => void;
  onSend: () => void; resultTitle: string; resultText: string; problems: string[]; onDone: () => void; onBack: () => void;
}) {
  const all = p.checks.every((c) => c.ok);
  const level = p.content.score < 20 ? ["Low", "var(--ok)"] : p.content.score < 45 ? ["Medium", "var(--warn)"] : ["High", "var(--bad)"];
  const sched = p.when === "sched";
  const reach = p.reach ?? 0;

  if (p.phase !== "review") {
    return (
      <Dialog open={p.open} onClose={p.onClose} label={p.phase === "busy" ? "Sending" : "Result"} locked={p.phase === "busy"}>
        {p.phase === "busy" ? (
          <>
            <h3>{sched ? "Scheduling…" : "Sending…"}</h3>
            <p role="status"><span className="spin" aria-hidden="true" />Checking everything one last time and handing it to the sender. Please don’t close this window.</p>
          </>
        ) : p.phase === "done" ? (
          <div className="done">
            <h3>{p.resultTitle}</h3>
            <p>{p.resultText}</p>
            <div className="actions"><button type="button" className="btn pri" onClick={p.onDone}>Done</button></div>
          </div>
        ) : (
          <>
            <h3>It wasn’t sent</h3>
            <p>Nothing was sent. Fix this, then try again:</p>
            <ul className="rs">{p.problems.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <div className="actions"><button type="button" className="btn pri" onClick={p.onBack}>Back to review</button></div>
          </>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog open={p.open} onClose={p.onClose} label="Review before sending" wide>
      <h3>Review before sending</h3>
      <p>Fix anything marked ✕ to enable sending.</p>
      <div className="rv">
        <div>
          <div>
            {p.checks.map((c, i) => (
              <div key={i} className={`chk ${c.ok ? (c.warn ? "w" : "ok") : "no"}`}>
                <i aria-hidden="true">{c.ok ? (c.warn ? "!" : "✓") : "✕"}</i>
                <div><span className="sr-only">{c.ok ? (c.warn ? "Warning: " : "Passed: ") : "Needs fixing: "}</span>{c.title}{c.detail ? <small>{c.detail}</small> : null}</div>
                {!c.ok && c.fix ? <button type="button" className="btn" onClick={c.onFix}>{c.fix}</button> : null}
              </div>
            ))}
          </div>
          <div className="sum">
            <b style={{ marginTop: 0 }}>{p.subject || "(no subject)"}</b>
            {p.audienceName} · {reach.toLocaleString("en-US")} contacts<br />
            {sched ? `Scheduled for ${p.scheduleLabel}` : "Sends immediately"}
          </div>
        </div>
        <div>
          <div className="inb">
            <div className="fr"><b style={{ marginTop: 0 }}>{p.fromName || "Sender"}</b><span>9:41</span></div>
            <div><b style={{ marginTop: 0, display: "inline" }}>{p.subject || "(no subject)"}</b> <span>{p.preheader}</span></div>
          </div>
          <label>Content checks · {p.content.notes.length ? `${p.content.notes.length} to review` : "no issues found"}</label>
          <div className="meter"><i style={{ width: `${Math.max(p.content.score, 4)}%`, background: level[1] }} /></div>
          {p.content.notes.length ? <ul className="rs">{p.content.notes.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="hint">These basic checks found nothing to flag. They don’t predict inbox placement.</p>}
          <label>Check it on</label>
          <div className="seg" style={{ display: "inline-flex" }}>
            <button type="button" onClick={() => p.onDevice("desk")}>Desktop</button>
            <button type="button" onClick={() => p.onDevice("mob")}>Mobile</button>
            <button type="button" onClick={() => p.onDevice("dark")}>Dark mode</button>
          </div>
          <p className="hint">{p.hasLogo ? "Check your logo against a dark background." : "A single column keeps mobile readable."}</p>
        </div>
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={p.onClose}>Keep editing</button>
        <button type="button" className="btn pri" disabled={!all} onClick={p.onSend}>{sched ? "Schedule campaign" : `Send to ${reach.toLocaleString("en-US")} contacts`}</button>
      </div>
    </Dialog>
  );
}

export function AudienceDialog(p: {
  open: boolean; onClose: () => void; audience: AudienceState; setAudience: Dispatch<SetStateAction<AudienceState>>;
  lists: AudienceOption[]; totalSubscribed: number; size: number | null; sizing: boolean;
  canImport: boolean; canCreateContacts: boolean; actions: AudienceActions;
}) {
  return (
    <Dialog open={p.open} onClose={p.onClose} label="Choose recipients" wide>
      <h3>Choose recipients</h3>
      <p>Combine lists, people you pick, pasted addresses and imported files. Nobody gets the email twice.</p>
      <div className="aud-pick">
        <AudiencePicker audience={p.audience} setAudience={p.setAudience} lists={p.lists} totalSubscribed={p.totalSubscribed} canImport={p.canImport} canCreateContacts={p.canCreateContacts} actions={p.actions} />
        <div style={{ marginTop: 16 }}>
          <AudienceSummary audience={p.audience} setAudience={p.setAudience} lists={p.lists} totalSubscribed={p.totalSubscribed} size={p.size} sizing={p.sizing} />
        </div>
      </div>
      <div className="actions"><button type="button" className="btn pri" onClick={p.onClose}>Done</button></div>
    </Dialog>
  );
}
