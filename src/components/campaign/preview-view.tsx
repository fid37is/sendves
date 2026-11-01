"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { palette } from "@/config/brand";
import { personalize } from "@/lib/email/blocks";
import { applyConditions, renderEmailHtml, resolveCountdowns, type Brand, type Design } from "@/lib/email/design";
import { makeInert, previewSubject } from "@/lib/email/preview";
import type { RecipientData, VariableDef } from "@/lib/email/variables";

export type PreviewPerson = { id: string; label: string; data: RecipientData };

/** Email dark mode, approximated: the page and card go dark, text follows. Built from the night palette. */
const DARK_CSS =
  `<style>body{background:${palette.night[950]}!important}` +
  `.sv-card{background:${palette.night[800]}!important}` +
  `.sv-t,.sv-card p,.sv-card h2{color:#eef4f6!important}.sv-m{color:#9db4be!important}.sv-hr{border-color:${palette.night[700]}!important}</style>`;

/** The email exactly as one recipient receives it: conditions applied, variables and countdown filled in. */
export function buildPreviewDocument(args: {
  design: Design; brand: Brand; preheader: string; person: RecipientData; variables: VariableDef[];
  businessAddress: string | null; timezone: string; dark: boolean;
}): string {
  let html = renderEmailHtml(args.design, args.brand, { preheader: args.preheader });
  html = applyConditions(html, args.person);
  html = resolveCountdowns(html, { tz: args.timezone });
  html = personalize(html, args.person, args.variables);
  const address = (args.businessAddress ?? "").replace(/</g, "");
  html = html.replace("<!--UNSUB-->", `<u>Unsubscribe</u>${address ? `<br>${address}` : ""}`);
  html = makeInert(html);
  return args.dark ? html.replace("</head>", `${DARK_CSS}</head>`) : html;
}

/** An iframe that grows to fit its email. Scripts are off; only the same-origin flag is set so the height can be measured. */
function MailFrame({ doc, title }: { doc: string; title: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const fit = () => {
    const f = ref.current;
    const h = f?.contentDocument?.documentElement?.scrollHeight;
    if (f && h) f.style.height = `${h}px`;
  };
  useEffect(() => { const t = setTimeout(fit, 60); return () => clearTimeout(t); }, [doc]);
  return <iframe ref={ref} title={title} srcDoc={doc} sandbox="allow-same-origin" onLoad={fit} style={{ height: 480 }} />;
}

export function PreviewView({
  design, brand, subject, preheader, variables, people, personId, setPersonId, businessAddress, timezone, dark, setDark, device, setDevice, compare, setCompare, onBack, onContinue,
}: {
  design: Design; brand: Brand; subject: string; preheader: string; variables: VariableDef[];
  people: PreviewPerson[]; personId: string; setPersonId: (id: string) => void;
  businessAddress: string | null; timezone: string;
  dark: boolean; setDark: (v: boolean) => void; device: "desk" | "mob"; setDevice: (v: "desk" | "mob") => void;
  compare: boolean; setCompare: (v: boolean) => void; onBack: () => void; onContinue: (() => void) | null;
}) {
  const current = people.find((p) => p.id === personId) ?? people[people.length - 1];
  const doc = (p: PreviewPerson) => buildPreviewDocument({ design, brand, preheader, person: p.data, variables, businessAddress, timezone, dark });
  const main = useMemo(() => doc(current), [design, brand, preheader, current, variables, businessAddress, timezone, dark]); // eslint-disable-line react-hooks/exhaustive-deps
  const compared = people.slice(0, 3);

  return (
    <section className="view on" id="v-preview" aria-label="Email preview">
      <div className="pvh">
        <button type="button" className="btn" onClick={onBack}>Back to editor</button>
        <span className="sp" />
        <button type="button" className="btn" onClick={() => setCompare(!compare)}>{compare ? "Single view" : "Compare contacts"}</button>
        <div className="seg" role="group" aria-label="Preview size">
          <button type="button" className={device === "desk" ? "on" : ""} aria-pressed={device === "desk"} onClick={() => setDevice("desk")}>Desktop</button>
          <button type="button" className={device === "mob" ? "on" : ""} aria-pressed={device === "mob"} onClick={() => setDevice("mob")}>Mobile</button>
        </div>
        <button type="button" className="btn" onClick={() => setDark(!dark)}>Theme: {dark ? "Light" : "Dark"}</button>
        <select aria-label="Preview as contact" value={current.id} onChange={(e) => { setPersonId(e.target.value); setCompare(false); }}>
          {people.map((p) => <option key={p.id} value={p.id}>Preview as {p.label}</option>)}
        </select>
      </div>
      <div className="pv">
        {!compare ? (
          <div className={`frame${device === "mob" ? " mob" : ""}`} id="frame">
            <div className="subj"><b>{previewSubject(subject, current.data, variables) || "(no subject)"}</b>{preheader ? ` — ${previewSubject(preheader, current.data, variables)}` : ""}</div>
            <MailFrame doc={main} title="Email preview" />
          </div>
        ) : (
          <div id="cmp" className="on">
            {compared.map((p) => (
              <div key={p.id} style={{ width: 300 }}>
                <div className="subj" style={{ margin: "0 0 6px" }}>{p.label}</div>
                <MailFrame doc={doc(p)} title={`Email preview for ${p.label}`} />
              </div>
            ))}
          </div>
        )}
      </div>
      {onContinue ? <div className="bar"><button type="button" className="btn pri" onClick={onContinue}>Continue to send</button></div> : null}
    </section>
  );
}
