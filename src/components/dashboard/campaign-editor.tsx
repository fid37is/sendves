"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookmarkPlus, ChevronRight, Check, Eye, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { AudiencePicker, AudienceSummary, type AudienceActions, type AudienceState } from "@/components/dashboard/audience-panel";
import { BlockEditor } from "@/components/dashboard/block-editor";
import { CampaignPreview } from "@/components/dashboard/campaign-preview";
import { buildVariableOptions, VariableField } from "@/components/dashboard/variable-field";
import { PreviewAsCard, SAMPLE_ID, VariablesEditor } from "@/components/dashboard/variables-panel";
import type { AutosaveResult, PreviewContact } from "@/app/(dashboard)/app/campaigns/actions";
import type { SaveTemplateResult } from "@/app/(dashboard)/app/templates/actions";
import type { AudienceOption, SenderRow } from "@/lib/queries";
import type { Block } from "@/lib/email/blocks";
import { buildPreviewDoc, previewSubject, SAMPLE_VARS } from "@/lib/email/preview";
import { analyzeVariables, blockStrings, knownKeys, sanitizeVariables, type VariableDef } from "@/lib/email/variables";

type Action = (formData: FormData) => Promise<void>;
type Tab = "details" | "audience" | "content" | "variables" | "review";
const TABS: { key: Tab; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "audience", label: "Audience" },
  { key: "content", label: "Content" },
  { key: "variables", label: "Variables" },
  { key: "review", label: "Review & send" },
];

type Props = {
  campaign: {
    id: string; name: string; subject: string; preview_text: string;
    sender_identity_id: string | null; department_id: string | null;
    blocks: Block[]; variables: VariableDef[];
    audience: AudienceState;
  };
  /** What this person can send as: their work email and their aliases (active or not; the editor marks the unusable ones). */
  senders: SenderRow[];
  /** Departments this person may put the campaign in. */
  departments: { id: string; name: string }[];
  orgWideAllowed: boolean;
  lists: AudienceOption[];
  /** Everyone subscribed in the workspace: the size of "Everyone subscribed". */
  totalSubscribed: number;
  /** Custom contact fields found on contacts (extra CSV columns). */
  contactFieldKeys: string[];
  workspace: { name: string; business_address: string | null };
  can: { send: boolean; createContacts: boolean; viewContacts: boolean; saveTemplate: boolean };
  actions: {
    autosave: (formData: FormData) => Promise<AutosaveResult>;
    save: Action; test: Action; submit: Action; remove: Action;
    saveTemplate: (input: { name: string; subject: string; previewText: string; blocks: unknown; variables: unknown; departmentId: string | null }) => Promise<SaveTemplateResult>;
    previewContacts: (selection: unknown) => Promise<PreviewContact[]>;
    audienceSize: (selection: unknown) => Promise<{ ok: true; size: number } | { ok: false; error: string }>;
    audience: AudienceActions;
  };
};

const AUTOSAVE_DELAY_MS = 2500; // pause after the last edit before saving
const RETRY_DELAY_MS = 6000; // wait before retrying a failed save
const NOT_SAVED_KEYS = new Set(["mode", "scheduledAtIso"]); // send options, not part of the draft
const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

export function CampaignEditor({ campaign, senders, departments, orgWideAllowed, lists, totalSubscribed, contactFieldKeys, workspace, can, actions }: Props) {
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement | null>(null);

  // ── Everything the person edits lives here, so switching tabs or opening the preview loses nothing ──
  const [tab, setTab] = useState<Tab>("details");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [previewText, setPreviewText] = useState(campaign.preview_text);
  const [senderId, setSenderId] = useState(campaign.sender_identity_id ?? "");
  const [departmentId, setDepartmentId] = useState(campaign.department_id ?? "");
  const [blocks, setBlocks] = useState<Block[]>(campaign.blocks);
  const [variables, setVariables] = useState<VariableDef[]>(campaign.variables);
  const [audience, setAudience] = useState<AudienceState>(campaign.audience);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [iso, setIso] = useState("");

  const validDefs = useMemo(() => sanitizeVariables(variables), [variables]);
  const variableOptions = useMemo(() => buildVariableOptions(validDefs, contactFieldKeys), [validDefs, contactFieldKeys]);

  // ── Sender ──────────────────────────────────────────────────────────────
  const sender = senders.find((s) => s.id === senderId) ?? null;
  const usable = (s: SenderRow) => s.status === "active" && s.domainReady;
  const senderProblem = !senders.length ? "You don’t have a work email yet. Set one under Team (the owner can do this for you)." : !sender ? "Choose who this email comes from." : !usable(sender) ? (sender.status !== "active" ? `${sender.email} is deactivated.` : `The domain of ${sender.email} isn’t verified.`) : null;
  const fromLabel = sender ? `${sender.fromName} <${sender.email}>` : "";

  // ── Audience: size is counted on the server by the same rules the sender uses ──
  const selection = useMemo(() => ({ mode: audience.mode, listIds: audience.listIds, contactIds: audience.contacts.map((c) => c.id) }), [audience]);
  const selectionKey = JSON.stringify(selection);
  const [size, setSize] = useState<number | null>(null);
  const [sizing, setSizing] = useState(true);
  const [listOptions] = useState(lists);
  const { audienceSize, previewContacts } = actions;
  useEffect(() => {
    let cancelled = false;
    setSizing(true);
    const t = setTimeout(async () => {
      try {
        const res = await audienceSize(JSON.parse(selectionKey));
        if (!cancelled && res.ok) setSize(res.size);
      } catch { /* keeps the last known size */ } finally {
        if (!cancelled) setSizing(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [selectionKey, audienceSize]);

  // ── Preview-as: real people from the audience ───────────────────────────
  const [contacts, setContacts] = useState<PreviewContact[]>([]);
  const [previewAs, setPreviewAs] = useState(SAMPLE_ID);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      previewContacts(JSON.parse(selectionKey))
        .then((rows) => { if (!cancelled) { setContacts(rows); setPreviewAs((cur) => (rows.some((r) => r.id === cur) ? cur : SAMPLE_ID)); } })
        .catch(() => { if (!cancelled) setContacts((c) => c); });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [selectionKey, previewContacts]);
  const chosen = contacts.find((c) => c.id === previewAs) ?? null;
  const vars = useMemo(() => (chosen ? { first_name: chosen.first_name, last_name: chosen.last_name, email: chosen.email, custom_fields: chosen.custom_fields } : SAMPLE_VARS), [chosen]);
  const asLabel = chosen ? [chosen.first_name, chosen.last_name].filter(Boolean).join(" ") || chosen.email : "Sample person (Ada Lovelace)";

  // ── Variables check ─────────────────────────────────────────────────────
  const report = useMemo(
    () => analyzeVariables([subject, previewText, ...blockStrings(blocks)], knownKeys(contactFieldKeys, validDefs), validDefs),
    [subject, previewText, blocks, contactFieldKeys, validDefs],
  );
  const variablesOk = report.malformed.length === 0 && report.undefinedKeys.length === 0;

  // ── Preview: a separate full-width view. The editor stays mounted underneath, so nothing is lost ──
  const previewSlot = useRef<HTMLSpanElement | null>(null);
  const openPreview = () => {
    window.history.pushState({ svPreview: true }, "", "#preview");
    setView("preview");
  };
  const closePreview = () => {
    if (window.location.hash === "#preview") window.history.back();
    else setView("edit");
  };
  useEffect(() => {
    const onPop = () => setView(window.location.hash === "#preview" ? "preview" : "edit");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => { if (view === "edit") previewSlot.current?.querySelector("button")?.focus({ preventScroll: true }); }, [view]);

  // Built from the current (even unsaved) state, only while the preview is open.
  const previewDoc = useMemo(
    () => (view === "preview" ? buildPreviewDoc(blocks, { preview: previewText, workspaceName: workspace.name, businessAddress: workspace.business_address, vars, variables: validDefs }) : ""),
    [view, blocks, previewText, workspace, vars, validDefs],
  );

  // ── Save as template: uses the campaign's own title, nothing else is asked ──
  const [savingTpl, setSavingTpl] = useState(false);
  const saveAsTemplate = async () => {
    if (savingTpl) return;
    setSavingTpl(true);
    try {
      const res = await actions.saveTemplate({ name: name.trim(), subject, previewText, blocks, variables: validDefs, departmentId: departmentId || null });
      if (res.ok) toast.success(`Saved “${res.name}” to your templates.`); else toast.error(res.error);
    } catch {
      toast.error("Couldn’t save the template. Check your connection and try again.");
    } finally {
      setSavingTpl(false);
    }
  };

  // ── Autosave ────────────────────────────────────────────────────────────
  // Edits are saved a couple of seconds after you stop typing. Only one save runs at a time; edits
  // made while one is running are picked up by the next. Nothing is sent if nothing changed.
  const lastSaved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const stopped = useRef(false); // set when retrying can't help (campaign sent or deleted elsewhere)
  const mounted = useRef(false);

  const snapshot = useCallback(() => {
    const form = formRef.current;
    if (!form) return null;
    const data = new FormData(form);
    const parts: [string, string][] = [];
    data.forEach((v, k) => { if (typeof v === "string" && !NOT_SAVED_KEYS.has(k)) parts.push([k, v]); });
    return { data, key: JSON.stringify(parts) };
  }, []);

  const save = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inFlight.current || stopped.current) return;
    const snap = snapshot();
    if (!snap || snap.key === lastSaved.current) return;

    inFlight.current = true;
    try {
      const res = await actions.autosave(snap.data);
      if (res.ok) {
        lastSaved.current = snap.key;
        toast.success("Progress saved.");
      } else if (res.fatal) {
        stopped.current = true;
        toast.error(res.error);
      } else {
        toast.error(`${res.error} Retrying…`);
        timer.current = setTimeout(() => void save(), RETRY_DELAY_MS);
      }
    } catch {
      toast.error("You appear to be offline. Retrying…");
      timer.current = setTimeout(() => void save(), RETRY_DELAY_MS);
    } finally {
      inFlight.current = false;
      const next = snapshot();
      if (!stopped.current && !timer.current && next && next.key !== lastSaved.current) {
        timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
      }
    }
  }, [actions, snapshot]);

  const scheduleSave = useCallback(() => {
    if (stopped.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void save(); }, AUTOSAVE_DELAY_MS);
  }, [save]);

  // The first run records what's already saved; later runs (any edit) schedule a save.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      lastSaved.current = snapshot()?.key ?? null;
      return;
    }
    scheduleSave();
  }, [name, subject, previewText, senderId, departmentId, blocks, variables, audience, scheduleSave, snapshot]);

  // Save straight away when the tab is hidden, and warn before leaving with unsaved edits.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") void save(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (stopped.current) return;
      const snap = snapshot();
      if (inFlight.current || (snap && snap.key !== lastSaved.current)) { e.preventDefault(); e.returnValue = ""; }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("beforeunload", onBeforeUnload); };
  }, [save, snapshot]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // ── Review ──────────────────────────────────────────────────────────────
  const checks: { key: string; ok: boolean; pending?: boolean; label: string; detail: string; tab?: Tab; href?: string }[] = [
    { key: "subject", ok: !!subject.trim(), label: "Subject line", detail: subject.trim() ? previewSubject(subject, vars, validDefs) : "Add a subject line.", tab: "details" },
    { key: "sender", ok: !senderProblem, label: "Sender", detail: senderProblem ?? fromLabel, tab: "details" },
    { key: "audience", ok: (size ?? 0) > 0, pending: size === null, label: "Audience", detail: size === null ? "Counting…" : size > 0 ? `${people(size)} will receive it.` : "No subscribed people are selected.", tab: "audience" },
    { key: "content", ok: blocks.length > 0, label: "Content", detail: blocks.length ? `${blocks.length} ${blocks.length === 1 ? "block" : "blocks"}.` : "Add some content.", tab: "content" },
    { key: "variables", ok: variablesOk, label: "Variables", detail: variablesOk ? (report.used.length ? `${report.used.length} in use, all can be filled in.` : "None used.") : [report.malformed.length ? `Can’t read ${report.malformed.join(", ")}.` : "", report.undefinedKeys.length ? `No value or fallback for ${report.undefinedKeys.map((k) => `{{${k}}}`).join(", ")}.` : ""].filter(Boolean).join(" "), tab: "variables" },
    { key: "address", ok: !!workspace.business_address, label: "Business address", detail: workspace.business_address ? "Shown in the footer." : "Add it in Settings. It appears in every footer.", href: "/app/settings" },
  ];
  const ready = checks.every((c) => c.ok);
  const issues: Record<Tab, boolean> = {
    details: !checks[0].ok || !checks[1].ok,
    audience: size !== null && size === 0,
    content: !checks[3].ok,
    variables: !variablesOk,
    review: false,
  };

  const index = TABS.findIndex((t) => t.key === tab);
  const last = index === TABS.length - 1;
  const goTo = (t: Tab) => { setTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const confirmAndSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // Ask first; submit with this button (so its formAction is used) only after a yes.
    const button = e.currentTarget;
    const form = button.form;
    e.preventDefault();
    const n = size ?? 0;
    const ok = await confirm({
      title: mode === "now" ? "Send this campaign now?" : "Schedule this campaign?",
      description: mode === "now" ? `It goes to ${people(n)} straight away, from ${fromLabel || "your sender"}. Emails can’t be recalled once sent.` : `It will be sent to ${people(n)} at the time you chose, from ${fromLabel || "your sender"}.`,
      confirmLabel: mode === "now" ? "Send campaign" : "Schedule campaign",
    });
    if (ok) form?.requestSubmit(button);
  };

  const audiencePayload = JSON.stringify(selection);

  return (
    <>
      <form
        ref={formRef}
        className={view === "preview" ? "hidden" : undefined}
        // Enter in a text field must not submit the form (the first submit button would send a test).
        onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type !== "submit") e.preventDefault(); }}
        aria-hidden={view === "preview" ? true : undefined}
      >
        <input type="hidden" name="id" value={campaign.id} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="subject" value={subject} />
        <input type="hidden" name="previewText" value={previewText} />
        <input type="hidden" name="senderId" value={senderId} />
        <input type="hidden" name="departmentId" value={departmentId} />
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
        <input type="hidden" name="variables" value={JSON.stringify(validDefs)} />
        <input type="hidden" name="audience" value={audiencePayload} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="scheduledAtIso" value={iso} />

        <div role="tablist" aria-label="Campaign sections" className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              onClick={() => goTo(t.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500",
                tab === t.key ? "bg-brand-700 text-white" : "bg-white text-ink-soft ring-1 ring-mist hover:bg-mist-100",
              )}
            >
              {t.label}
              {issues[t.key] ? <><AlertTriangle className={cn("h-3.5 w-3.5", tab === t.key ? "text-white" : "text-warning")} aria-hidden="true" /><span className="sr-only">needs attention</span></> : null}
            </button>
          ))}
        </div>

        {/* ── Details ─────────────────────────────────────────────────── */}
        <div role="tabpanel" id="panel-details" aria-labelledby="tab-details" hidden={tab !== "details"} className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Card className="self-start">
            <CardHeader title="Campaign details" description="The basics: what it’s called, what recipients see, and who it comes from." />
            <div className="space-y-5 p-6">
              <Field label="Campaign name" htmlFor="c-name" hint="Only your team sees this. It’s also the title if you save this as a template."><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
              <VariableField label="Subject line" value={subject} onChange={setSubject} options={variableOptions} maxLength={200} />
              <VariableField label="Preview text" value={previewText} onChange={setPreviewText} options={variableOptions} maxLength={200} hint="The short line shown beside the subject in many inboxes." />
              <Field label="Send from" htmlFor="c-sender" error={senderProblem && senders.length ? senderProblem : undefined} hint="Your work email, or one of your aliases.">
                <Select id="c-sender" value={senderId} onChange={(e) => setSenderId(e.target.value)}>
                  <option value="">{senders.length ? "Choose where this comes from…" : "No work email yet"}</option>
                  {(["primary", "alias"] as const).map((kind) => {
                    const group = senders.filter((s) => s.kind === kind);
                    if (!group.length) return null;
                    return (
                      <optgroup key={kind} label={kind === "primary" ? "Your work email" : "Your aliases"}>
                        {group.map((s) => (
                          <option key={s.id} value={s.id} disabled={!usable(s) && s.id !== senderId}>
                            {s.fromName} &lt;{s.email}&gt;{s.status !== "active" ? " (deactivated)" : !s.domainReady ? " (domain not verified)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </Select>
              </Field>
              {departments.length > 0 ? (
                <Field label="Department" htmlFor="c-dept" hint="Only members of this department, and people with access to every department, can see this campaign.">
                  <Select id="c-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                    {orgWideAllowed ? <option value="">Whole organization</option> : null}
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
              ) : null}
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Sender" description="Who recipients see this email coming from." />
              <div className="space-y-3 p-6 text-sm">
                {sender ? (
                  <>
                    <p className="font-semibold text-ink">{sender.fromName}</p>
                    <p className="break-all text-ink-soft">{sender.email}</p>
                    <p className={cn("flex items-center gap-2 text-xs font-semibold", senderProblem ? "text-warning" : "text-success")}>
                      {senderProblem ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                      {senderProblem ?? `Ready: ${sender.domain} passed DKIM, SPF and DMARC.`}
                    </p>
                  </>
                ) : (
                  <p className="text-ink-soft">{senders.length ? "Pick a sender to see its details." : "You don’t have a work email yet. Set one under Team (the owner can do this for you)."}</p>
                )}
                <p className="flex items-start gap-2 rounded-xl bg-mist-50 p-3 text-xs text-ink-soft">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                  <span>Aliases are extra addresses on your work email’s domain. They’re added by the owner under Team, and they can’t receive email: replies go to the mailbox at your email host.</span>
                </p>
              </div>
            </Card>
            <Card>
              <CardHeader title="Variables you can use" description="Add them to the subject, preview text and content with Insert variable." />
              <ul className="flex flex-wrap gap-2 p-6">
                {variableOptions.map((o) => <li key={o.key}><code className="rounded-lg bg-mist-100 px-2 py-1 text-xs text-ink-soft">{`{{${o.key}}}`}</code></li>)}
              </ul>
              <div className="border-t border-mist px-6 py-3"><Button type="button" variant="ghost" size="sm" onClick={() => goTo("variables")}>Set values and fallbacks</Button></div>
            </Card>
          </div>
        </div>

        {/* ── Audience ────────────────────────────────────────────────── */}
        <div role="tabpanel" id="panel-audience" aria-labelledby="tab-audience" hidden={tab !== "audience"} className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Card className="self-start">
            <CardHeader title="Choose recipients" description="Combine lists, people you pick, pasted addresses and imported files. Nobody gets the email twice." />
            <div className="p-6">
              <AudiencePicker audience={audience} setAudience={setAudience} lists={listOptions} totalSubscribed={totalSubscribed} canImport={can.viewContacts} canCreateContacts={can.createContacts} actions={actions.audience} />
            </div>
          </Card>
          <div className="lg:sticky lg:top-6 lg:self-start">
            <AudienceSummary audience={audience} setAudience={setAudience} lists={listOptions} totalSubscribed={totalSubscribed} size={size} sizing={sizing} />
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div role="tabpanel" id="panel-content" aria-labelledby="tab-content" hidden={tab !== "content"} className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="self-start"><BlockEditor blocks={blocks} setBlocks={setBlocks} variableOptions={variableOptions} /></div>
          <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader title="Check your email" description="See it exactly as recipients will, on desktop and mobile." />
              <div className="p-6"><Button type="button" variant="secondary" onClick={openPreview}><Eye className="h-4 w-4" aria-hidden="true" />Open preview</Button></div>
            </Card>
            <Card>
              <CardHeader title="Variables in this email" description={report.used.length ? undefined : "None yet. Use Insert variable beside any text field."} />
              {report.used.length ? (
                <ul className="flex flex-wrap gap-2 p-6">
                  {report.used.map((k) => {
                    const bad = report.undefinedKeys.includes(k);
                    return <li key={k}><code className={cn("rounded-lg px-2 py-1 text-xs", bad ? "bg-warning-soft text-warning" : "bg-mist-100 text-ink-soft")}>{`{{${k}}}`}</code></li>;
                  })}
                </ul>
              ) : null}
              {!variablesOk ? <p className="border-t border-mist px-6 py-3 text-xs text-warning">{checks[4].detail} <button type="button" onClick={() => goTo("variables")} className="font-semibold underline underline-offset-2">Fix on the Variables tab</button></p> : null}
            </Card>
            {can.saveTemplate ? (
              <Card>
                <CardHeader title="Save as template" description="Keep this layout, with its variables, for future campaigns." />
                <div className="space-y-3 p-6">
                  <p className="text-sm text-ink-soft">It’s saved with this campaign’s title: <strong className="text-ink">{name.trim() || "Untitled template"}</strong>. Change the title on the Details tab. You can duplicate and rename it later on the Templates page.</p>
                  <Button type="button" variant="secondary" onClick={saveAsTemplate} disabled={savingTpl}><BookmarkPlus className="h-4 w-4" aria-hidden="true" />{savingTpl ? "Saving…" : "Save as template"}</Button>
                </div>
              </Card>
            ) : null}
          </div>
        </div>

        {/* ── Variables ───────────────────────────────────────────────── */}
        <div role="tabpanel" id="panel-variables" aria-labelledby="tab-variables" hidden={tab !== "variables"} className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="self-start"><VariablesEditor variables={variables} setVariables={setVariables} contactFieldKeys={contactFieldKeys} /></div>
          <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <PreviewAsCard contacts={contacts} selectedId={previewAs} onSelect={setPreviewAs} onContactSaved={(c) => setContacts((cs) => cs.map((x) => (x.id === c.id ? c : x)))} />
            <Card>
              <CardHeader title="Variables check" description="Everything the email uses must have a value or a fallback." />
              <div className="p-6 text-sm">
                {variablesOk ? (
                  <p className="flex items-center gap-2 font-semibold text-success"><Check className="h-4 w-4" aria-hidden="true" />{report.used.length ? "Every variable can be filled in." : "No variables used."}</p>
                ) : (
                  <ul className="space-y-2 text-warning">
                    {report.malformed.map((m) => <li key={m}>Can’t read <code className="rounded bg-warning-soft px-1">{m}</code>. Variable names use letters, numbers and _ only.</li>)}
                    {report.undefinedKeys.map((k) => <li key={k}><code className="rounded bg-warning-soft px-1">{`{{${k}}}`}</code> has no value or fallback. Define it here, or write {`{{${k}|friend}}`}.</li>)}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* ── Review & send ───────────────────────────────────────────── */}
        <div role="tabpanel" id="panel-review" aria-labelledby="tab-review" hidden={tab !== "review"} className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-6 self-start">
            <Card>
              <CardHeader title="Ready to send?" description={ready ? "Everything checks out." : "Fix what’s marked before sending."} />
              <ul className="divide-y divide-mist">
                {checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-3 px-6 py-3.5 text-sm">
                    <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", c.ok ? "bg-success/15 text-success" : c.pending ? "bg-mist-100 text-ink-muted" : "bg-warning-soft text-warning")} aria-hidden="true">
                      {c.ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{c.label}</p>
                      <p className={cn("break-words text-xs", c.ok ? "text-ink-muted" : "text-ink-soft")}>{c.detail}</p>
                    </div>
                    {!c.ok && c.tab ? <Button type="button" variant="ghost" size="sm" onClick={() => goTo(c.tab!)}>Fix</Button> : null}
                    {!c.ok && c.href ? <Link href={c.href} className="text-xs font-semibold text-brand-800 underline underline-offset-2">Open</Link> : null}
                  </li>
                ))}
              </ul>
            </Card>
            {can.send ? (
              <Card>
                <CardHeader title="When to send" description="The unsubscribe link and your business address are added to the footer automatically." />
                <div className="space-y-5 p-6">
                  <div className="flex flex-wrap gap-6 text-sm">
                    <label className="flex items-center gap-2"><input type="radio" checked={mode === "now"} onChange={() => setMode("now")} className="accent-brand-700" />Send now</label>
                    <label className="flex items-center gap-2"><input type="radio" checked={mode === "later"} onChange={() => setMode("later")} className="accent-brand-700" />Schedule</label>
                  </div>
                  {mode === "later" ? (
                    <Field label="Send at (your local time)" htmlFor="when">
                      <Input id="when" type="datetime-local" onChange={(e) => setIso(e.target.value ? new Date(e.target.value).toISOString() : "")} className="max-w-xs" />
                    </Field>
                  ) : null}
                </div>
              </Card>
            ) : (
              <p className="rounded-2xl border border-mist bg-mist-50 p-4 text-sm text-ink-soft">You can prepare this campaign, but sending is limited to people with permission to send. Ask a manager or administrator to send it.</p>
            )}
          </div>

          <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader title="Summary" />
              <dl className="space-y-3 p-6 text-sm">
                <div><dt className="text-xs text-ink-muted">Campaign</dt><dd className="break-words font-semibold text-ink">{name || "Untitled campaign"}</dd></div>
                <div><dt className="text-xs text-ink-muted">Subject</dt><dd className="break-words text-ink">{subject ? previewSubject(subject, vars, validDefs) : "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted">From</dt><dd className="break-words text-ink">{fromLabel || "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted">Audience</dt><dd className="text-ink">{size === null ? "Counting…" : people(size)}{audience.mode === "all" ? " (everyone subscribed)" : ""}</dd></div>
              </dl>
            </Card>
            <Card>
              <CardHeader title="Other actions" />
              <div className="flex flex-wrap gap-3 p-6">
                <Button type="submit" formAction={actions.test} variant="secondary">Send test to me</Button>
                <Button
                  type="submit"
                  formAction={actions.remove}
                  variant="ghost"
                  onClick={async (e) => {
                    const button = e.currentTarget;
                    const form = button.form;
                    e.preventDefault();
                    const ok = await confirm({ title: "Delete this draft?", description: "The draft and everything you’ve written in it are removed. This can’t be undone.", confirmLabel: "Delete draft", tone: "danger" });
                    if (ok) form?.requestSubmit(button);
                  }}
                >
                  Delete draft
                </Button>
              </div>
            </Card>
          </div>
        </div>

        {/* ── Actions: one bar, always in reach ───────────────────────── */}
        <div className="sticky bottom-4 z-20 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mist bg-white/95 p-3 shadow-lg backdrop-blur">
          <div>{index > 0 ? <Button type="button" variant="ghost" onClick={() => goTo(TABS[index - 1].key)}>Back</Button> : null}</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" formAction={actions.save} variant="secondary">Save draft</Button>
            <span ref={previewSlot}><Button type="button" variant="secondary" onClick={openPreview}><Eye className="h-4 w-4" aria-hidden="true" />Preview</Button></span>
            {last ? (
              can.send ? (
                <Button type="submit" formAction={actions.submit} onClick={confirmAndSubmit} disabled={!ready}>{mode === "now" ? "Send campaign" : "Schedule campaign"}</Button>
              ) : null
            ) : (
              <Button type="button" onClick={() => goTo(TABS[index + 1].key)}>Continue<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
            )}
          </div>
        </div>
      </form>

      {/* Sibling of the form, not a child: its buttons must never submit the campaign. */}
      {view === "preview" ? <CampaignPreview doc={previewDoc} subject={previewSubject(subject, vars, validDefs)} from={fromLabel} asLabel={asLabel} onBack={closePreview} /> : null}
    </>
  );
}
