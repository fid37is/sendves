"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { BUILT_IN_VARIABLES, isBuiltInVariable, sanitizeVariables, type VariableDef } from "@/lib/email/variables";
import {
  EXTRA_EDITOR_BLOCKS, newBlock, prettyKey, reviewChecks, scanContent, scheduleInstant, SCHEDULE_ZONES, switchLayout, TEMPLATE_NAMES,
  type BlockType, type Check, type ContactLike, type Design, type Layout, type Logo, type SlotKey, type Step, type Tab,
} from "@/lib/email/campaign";
import { buildCampaignDoc } from "@/lib/email/campaign-preview";
import { previewSubject } from "@/lib/email/preview";
import type { AudienceOption, SenderRow } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { EditorPayload, PreviewContact, SaveResult, SubmitInput, SubmitResult, TestResult } from "@/app/(dashboard)/app/campaigns/actions";
import { Canvas } from "@/components/editor/canvas";
import { ReviewDialog, ScheduleDialog, SwitchDialog, type ScheduleValues, type SendOutcome } from "@/components/editor/dialogs";
import { prepareImage, uploadImage } from "@/components/editor/image";
import { PreviewStep } from "@/components/editor/preview-step";
import { SidePanel } from "@/components/editor/side-panel";
import { SetupStep, senderProblem } from "@/components/editor/setup-step";
import { NO_CONTACT, type AudienceState, type Doc } from "@/components/editor/types";

export type EditorCampaign = {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  senderId: string;
  design: Design;
  variables: VariableDef[];
  audience: AudienceState;
};

type Props = {
  campaign: EditorCampaign;
  logo: Logo;
  senders: SenderRow[];
  lists: AudienceOption[];
  totalSubscribed: number;
  /** Extra contact columns (company, city…), usable as variables and in conditions. */
  contactFieldKeys: string[];
  workspace: { name: string; business_address: string | null; timezone: string };
  canSend: boolean;
  actions: {
    autosave: (p: EditorPayload) => Promise<SaveResult>;
    test: (p: EditorPayload) => Promise<TestResult>;
    submit: (p: SubmitInput) => Promise<SubmitResult>;
    previewContacts: (selection: unknown) => Promise<PreviewContact[]>;
    audienceSize: (selection: unknown) => Promise<{ ok: true; size: number } | { ok: false; error: string }>;
  };
};

const SAVE_DELAY = 2000;
const RETRY_DELAY = 8000;
const HISTORY_LIMIT = 30;

/** Built-in variables that have a default (first name → "there") start with it set, so they count as having a fallback. */
function withDefaultFallbacks(defs: VariableDef[]): VariableDef[] {
  const out = [...defs];
  for (const v of BUILT_IN_VARIABLES) {
    if (v.fallback && !out.some((d) => d.key === v.key)) out.push({ key: v.key, scope: "recipient", value: "", fallback: v.fallback });
  }
  return out;
}

const contactLabel = (c: PreviewContact) => `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email;
const asContact = (c: PreviewContact | null): ContactLike | null => (c ? { first_name: c.first_name, last_name: c.last_name, email: c.email, custom_fields: c.custom_fields } : null);

/** The campaign editor: Setup, Content and Preview, then a review before anything is sent. */
export function CampaignEditor(props: Props) {
  const { campaign, actions, workspace, lists } = props;
  const router = useRouter();

  // ── Where the person is ──
  const [step, setStep] = useState<Step>("setup");
  const [tab, setTab] = useState<Tab>("blocks");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotKey | null>(null);
  const [pend, setPend] = useState<number | null>(null);

  // ── What is being edited ──
  const [senderId, setSenderId] = useState(campaign.senderId);
  const [subject, setSubject] = useState(campaign.subject);
  const [preheader, setPreheader] = useState(campaign.preheader);
  const [audience, setAudience] = useState<AudienceState>(campaign.audience);
  const [variables, setVariables] = useState<VariableDef[]>(() => withDefaultFallbacks(campaign.variables));
  const [doc, setDoc] = useState<Doc>({ design: campaign.design, logo: props.logo });
  const design = doc.design;

  // Undo goes back through the design and the logo (text typed in between isn't a step of its own, as in the prototype).
  const docRef = useRef(doc);
  docRef.current = doc;
  const history = useRef<string[]>([]);
  const [historyLength, setHistoryLength] = useState(0);
  const snap = useCallback(() => {
    history.current.push(JSON.stringify(docRef.current));
    if (history.current.length > HISTORY_LIMIT) history.current.shift();
    setHistoryLength(history.current.length);
  }, []);
  const mutate = useCallback((fn: (d: Doc) => Doc, record = true) => {
    if (record) snap();
    setDoc(fn);
  }, [snap]);
  const undo = () => {
    const last = history.current.pop();
    setHistoryLength(history.current.length);
    if (!last) return;
    setDoc(JSON.parse(last) as Doc);
    setSel(null);
    setSlot(null);
  };

  // ── Variables ──
  const variableList = useMemo(() => [
    ...BUILT_IN_VARIABLES.map((v) => ({ key: v.key as string, label: v.label as string })),
    ...props.contactFieldKeys.filter((k) => !isBuiltInVariable(k)).map((k) => ({ key: k, label: prettyKey(k) })),
  ], [props.contactFieldKeys]);
  const labels = useMemo(() => Object.fromEntries(variableList.map((v) => [v.key, v.label])), [variableList]);
  const fallbacks = useMemo(() => Object.fromEntries(variables.filter((v) => v.scope === "recipient").map((v) => [v.key, v.fallback])), [variables]);
  const setFallback = (key: string, value: string) => setVariables((cur) => {
    const existing = cur.find((v) => v.key === key);
    const rest = cur.filter((v) => v.key !== key);
    if (!value && (!existing || existing.scope === "recipient")) return rest; // an empty fallback is no fallback
    return [...rest, { key, scope: existing?.scope ?? "recipient", value: existing?.value ?? "", fallback: value }];
  });

  const ctx = useMemo(() => ({ logo: doc.logo, tz: workspace.timezone, labels }), [doc.logo, workspace.timezone, labels]);
  const selBlock = useMemo(() => design.blocks.find((b) => b.id === sel) ?? null, [design.blocks, sel]);

  // ── Audience ──
  const legacy = useRef(campaign.audience).current;
  const legacyIsCustom = legacy.mode === "custom" && (legacy.contacts.length > 0 || legacy.listIds.length > 1);
  const legacyLabel = `Your selection (${[
    legacy.listIds.length ? `${legacy.listIds.length} ${legacy.listIds.length === 1 ? "list" : "lists"}` : "",
    legacy.contacts.length ? `${legacy.contacts.length} ${legacy.contacts.length === 1 ? "person" : "people"}` : "",
  ].filter(Boolean).join(", ")})`;
  const audienceValue = audience.mode === "all" ? "all"
    : audience.contacts.length === 0 && audience.listIds.length === 0 ? ""
    : audience.contacts.length === 0 && audience.listIds.length === 1 ? `list:${audience.listIds[0]}`
    : "keep";
  const audienceOptions = useMemo(() => [
    { value: "", label: "Choose an audience…" },
    { value: "all", label: "All subscribers" },
    ...lists.map((l) => ({ value: `list:${l.id}`, label: l.name })),
    ...(legacyIsCustom ? [{ value: "keep", label: legacyLabel }] : []),
  ], [lists, legacyIsCustom, legacyLabel]);
  const onAudience = (v: string) => {
    if (v === "all") setAudience({ mode: "all", listIds: [], contacts: [] });
    else if (v.startsWith("list:")) setAudience({ mode: "custom", listIds: [v.slice(5)], contacts: [] });
    else if (v === "keep") setAudience(legacy);
    else setAudience({ mode: "custom", listIds: [], contacts: [] });
  };
  const audienceName = audienceOptions.find((o) => o.value === audienceValue)?.label ?? "";
  const chosen = audienceValue !== "";
  const selection = useMemo(() => ({ mode: audience.mode, listIds: audience.listIds, contactIds: audience.contacts.map((c) => c.id) }), [audience]);
  const selectionKey = JSON.stringify(selection);
  const estimate = audienceValue === "all" ? props.totalSubscribed : audienceValue.startsWith("list:") ? lists.find((l) => l.id === audience.listIds[0])?.subscribed ?? null : null;
  const [serverSize, setServerSize] = useState<number | null>(null);
  useEffect(() => {
    setServerSize(null);
    if (!chosen) return;
    let live = true;
    const t = setTimeout(async () => {
      try { const r = await actions.audienceSize(JSON.parse(selectionKey)); if (live && r.ok) setServerSize(r.size); } catch { /* the estimate stays */ }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [selectionKey, chosen, actions]);
  const reach: number | null = chosen ? serverSize ?? estimate : 0;

  // ── Saving ──
  const payload: EditorPayload = useMemo(() => ({
    id: campaign.id, senderId, subject, preheader, audience: selection, design: doc.design, logo: doc.logo, variables: sanitizeVariables(variables),
  }), [campaign.id, senderId, subject, preheader, selection, doc, variables]);
  const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const lastSaved = useRef(payloadKey);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const stopped = useRef(false);
  const [status, setStatus] = useState<"saved" | "saving" | "just">("saved");

  const save = useCallback((): void => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (running.current || stopped.current) return;
    const p = payloadRef.current;
    const key = JSON.stringify(p);
    if (key === lastSaved.current) { setStatus((s) => (s === "saving" ? "just" : s)); return; }
    running.current = (async () => {
      let retry = false;
      try {
        const r = await actions.autosave(p);
        if (r.ok) lastSaved.current = key;
        else if (r.fatal) { stopped.current = true; toast.error(r.error); }
        else { retry = true; toast.error(r.error); }
      } catch {
        retry = true;
        toast.warning("Couldn’t reach the server. We’ll keep trying to save your changes.");
      } finally {
        running.current = null;
      }
      if (stopped.current) return;
      if (JSON.stringify(payloadRef.current) === lastSaved.current) setStatus("just");
      else timer.current = setTimeout(save, retry ? RETRY_DELAY : SAVE_DELAY);
    })();
  }, [actions]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (stopped.current) return;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY);
  }, [payloadKey, save]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Leaving the tab saves what is pending; closing the page asks first if that couldn't finish.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (stopped.current) return;
      if (running.current || JSON.stringify(payloadRef.current) !== lastSaved.current) { save(); e.preventDefault(); e.returnValue = ""; }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("beforeunload", onUnload); };
  }, [save]);

  /** Saves right now and waits for it. False when it couldn't be saved. */
  const saveNow = async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (running.current) await running.current;
    const p = payloadRef.current;
    const key = JSON.stringify(p);
    if (key === lastSaved.current) return true;
    try {
      const r = await actions.autosave(p);
      if (r.ok) { lastSaved.current = key; setStatus("just"); return true; }
      toast.error(r.error);
    } catch { toast.error("Couldn’t reach the server. Check your connection and try again."); }
    return false;
  };

  // ── Moving around and changing the email ──
  const mclose = () => { if (typeof window !== "undefined" && window.matchMedia("(max-width:760px)").matches) setOpen(false); };
  const focusLater = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 60);

  const selectBlock = (id: string) => {
    const b = design.blocks.find((x) => x.id === id);
    if (!b) return;
    setSel(id); setSlot(null); setPend(null); setOpen(true);
    setTab(b.x !== undefined || EXTRA_EDITOR_BLOCKS.has(b.t) || b.t === "logo" || b.t === "banner" ? "edit" : b.t === "image" ? "media" : "blocks");
  };
  const selectSlot = (k: SlotKey) => { setSlot(k); setSel(null); setOpen(true); setTab("edit"); };
  const openPanel = (t: Tab) => { setTab(t); setOpen(true); };

  const insertBlock = (b: ReturnType<typeof newBlock>) => {
    mutate((d) => {
      const blocks = [...d.design.blocks];
      let at = pend;
      if (at === null) { const i = blocks.findIndex((x) => x.id === sel); at = i < 0 ? blocks.length : i + 1; }
      blocks.splice(Math.min(at, blocks.length), 0, b);
      return { ...d, design: { ...d.design, blocks } };
    });
    setPend(null); setSel(b.id); setSlot(null);
    setTab(b.x !== undefined || EXTRA_EDITOR_BLOCKS.has(b.t) ? "edit" : "blocks");
  };
  const addBlock = (t: BlockType) => { insertBlock(newBlock(t, design)); mclose(); };
  const removeBlock = (id: string) => { mutate((d) => ({ ...d, design: { ...d.design, blocks: d.design.blocks.filter((b) => b.id !== id) } })); setSel(null); };
  const moveBlock = (id: string, delta: -1 | 1) => mutate((d) => {
    const blocks = [...d.design.blocks];
    const i = blocks.findIndex((b) => b.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= blocks.length) return d;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    return { ...d, design: { ...d.design, blocks } };
  });
  const reorder = (fromId: string, toId: string) => mutate((d) => {
    const blocks = [...d.design.blocks];
    const i = blocks.findIndex((b) => b.id === fromId);
    if (i < 0) return d;
    const [moved] = blocks.splice(i, 1);
    const to = blocks.findIndex((b) => b.id === toId);
    blocks.splice(to < 0 ? blocks.length : to, 0, moved);
    return { ...d, design: { ...d.design, blocks } };
  });

  const [switchTo, setSwitchTo] = useState<Layout | null>(null);
  const applyLayout = (k: Layout) => {
    mutate((d) => ({ ...d, design: switchLayout(d.design, k) }));
    setSel(null); setSlot(null); setSwitchTo(null); mclose();
  };
  const askLayout = (k: Layout) => {
    if (k === design.tpl) return;
    if (design.tpl !== "custom" && k !== "custom") applyLayout(k); // template to template: nothing to explain
    else setSwitchTo(k);
  };

  const pickPreset = (g: number) => {
    if (design.tpl !== "custom" || selBlock?.t === "banner") {
      mutate((d) => ({ ...d, design: { ...d.design, banner: { ...d.design.banner, src: `g${g}` } } }));
    } else if (selBlock?.t === "image") {
      const id = selBlock.id;
      mutate((d) => ({ ...d, design: { ...d.design, blocks: d.design.blocks.map((b) => (b.id === id ? { id: b.id, t: "image" as const, g, ...(b.cond ? { cond: b.cond } : {}) } : b)) } }));
    } else {
      const b = newBlock("image", design);
      b.g = g;
      insertBlock(b);
    }
    setTimeout(mclose, 0);
  };

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    const join = (text: string) => `${text}${text && !/\s$/.test(text) ? " " : ""}${token}`;
    if (design.tpl !== "custom") {
      const field = slot === "headline" ? "headline" : slot === "body" ? "body" : slot === "button" ? "btn" : slot === "footer" ? "foot" : null;
      if (!field) { toast.info("Select a text block first"); return; }
      mutate((d) => ({ ...d, design: { ...d.design, C: { ...d.design.C, [field]: join(d.design.C[field]) } } }), false);
    } else if (selBlock && selBlock.x !== undefined) {
      const id = selBlock.id;
      mutate((d) => ({ ...d, design: { ...d.design, blocks: d.design.blocks.map((b) => (b.id === id ? { ...b, x: join(b.x ?? "") } : b)) } }), false);
    } else { toast.info("Select a text block first"); return; }
    toast.success(`Inserted ${labels[key] ?? key}`);
  };

  // ── Pictures ──
  const fileInput = useRef<HTMLInputElement | null>(null);
  const fileKind = useRef<"logo" | "banner">("logo");
  const [uploading, setUploading] = useState(false);
  const pickImage = (kind: "logo" | "banner") => { fileKind.current = kind; fileInput.current?.click(); };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind = fileKind.current;
    setUploading(true);
    try {
      const img = await prepareImage(file, kind);
      const url = await uploadImage(img.blob, kind);
      if (kind === "logo") mutate((d) => ({ ...d, logo: { ...d.logo, src: url, w: img.w, h: img.h } }));
      else mutate((d) => ({ ...d, design: { ...d.design, banner: { ...d.design.banner, src: url, fx: 50, fy: 50 } } }));
    } catch (err) {
      toast.error((err as Error).message || "Couldn’t add that picture.");
    } finally {
      setUploading(false);
    }
  };

  // ── Preview ──
  const [device, setDevice] = useState<"desk" | "mob">("desk");
  const [dark, setDark] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [contacts, setContacts] = useState<PreviewContact[]>([]);
  const [contactId, setContactId] = useState(NO_CONTACT);
  const pickedNone = useRef(false);
  useEffect(() => {
    if (step !== "preview" || !chosen) { setContacts([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const rows = await actions.previewContacts(JSON.parse(selectionKey));
        if (!live) return;
        setContacts(rows);
        setContactId((cur) => ((cur !== NO_CONTACT && rows.some((r) => r.id === cur)) || (cur === NO_CONTACT && pickedNone.current) ? cur : rows[0]?.id ?? NO_CONTACT));
      } catch { if (live) setContacts([]); }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [step, chosen, selectionKey, actions]);

  const preview = useMemo(() => {
    if (step !== "preview") return null;
    const variant = (id: string, label: string, c: PreviewContact | null) => ({
      id, label,
      subject: previewSubject(subject, asContact(c) ?? {}, variables),
      doc: buildCampaignDoc(design, { logo: doc.logo, tz: workspace.timezone }, { preheader, contact: asContact(c), variables, businessAddress: workspace.business_address, dark }),
    });
    const current = contacts.find((c) => c.id === contactId) ?? null;
    const single = variant(contactId, current ? contactLabel(current) : "No contact data (fallbacks)", current);
    const compare = comparing
      ? [...contacts.slice(0, 2).map((c) => variant(c.id, contactLabel(c), c)), variant(NO_CONTACT, "No contact data (fallbacks)", null)]
      : [];
    return { single, compare };
  }, [step, contacts, contactId, comparing, design, doc.logo, subject, preheader, variables, dark, workspace]);

  // ── Review, schedule and send ──
  const sender = props.senders.find((s) => s.id === senderId) ?? null;
  const problem = senderProblem(props.senders, senderId);
  const checks: Check[] = useMemo(() => reviewChecks({
    subject, design, logo: doc.logo, variables, extraTexts: [subject, preheader],
    audience: { chosen, name: audienceName, size: chosen ? reach : 0 },
    sender: { ok: !problem, label: sender ? `${sender.fromName} <${sender.email}>` : "", problem },
    addressSet: Boolean(workspace.business_address?.trim()),
  }), [subject, preheader, design, doc.logo, variables, chosen, audienceName, reach, problem, sender, workspace.business_address]);
  const scan = useMemo(() => scanContent(subject, preheader, design), [subject, preheader, design]);

  const [review, setReview] = useState<{ mode: "now" | "sched" } | null>(null);
  const [phase, setPhase] = useState<"review" | "sending" | "done">("review");
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [sched, setSched] = useState<{ label: string; iso: string } | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const onClick = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  const openReview = (mode: "now" | "sched") => { setPhase("review"); setReview({ mode }); setMenu(false); };
  const continueSchedule = (v: ScheduleValues) => {
    if (!v.date) { toast.error("Pick a date"); return; }
    const at = scheduleInstant(v.date, v.time || "09:00", v.zone);
    if (at === null) { toast.error("Pick a valid date and time"); return; }
    if (at < Date.now() + 60_000) { toast.error("Pick a time at least a minute from now"); return; }
    if (at > Date.now() + 90 * 86400_000) { toast.error("You can schedule up to 90 days ahead"); return; }
    const zone = SCHEDULE_ZONES.find((z) => z.key === v.zone)!;
    setSched({ label: `${v.date} at ${v.time || "09:00"}, ${zone.label}`, iso: new Date(at).toISOString() });
    setScheduling(false);
    openReview("sched");
  };

  const fix = async (c: Check) => {
    if (c.href) { if (await saveNow()) router.push(c.href); return; }
    setReview(null);
    if (c.go === "setup") { setStep("setup"); focusLater(c.focus === "aud" ? "aud" : c.focus === "sender" ? "fromMail" : "subject"); return; }
    setStep("content");
    if (c.sel) { setSel(c.sel); setSlot(null); }
    else if (c.slot) { setSlot(c.slot); setSel(null); }
    else if (c.tab === "blocks" || c.tab === "vars") setSel(null);
    if (c.tab) { setTab(c.tab); setOpen(true); }
  };

  const send = async () => {
    if (!review) return;
    const mode = review.mode;
    setPhase("sending");
    // Nothing may save over the campaign while it is being queued.
    stopped.current = true;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (running.current) await running.current;
    try {
      const res = await actions.submit({ ...payloadRef.current, mode: mode === "sched" ? "later" : "now", scheduledAtIso: mode === "sched" ? sched?.iso : undefined });
      if (!res.ok) { stopped.current = false; setPhase("review"); toast.error(res.error); return; }
      setOutcome(
        res.inReview ? { title: "Submitted for review", body: "New accounts have their first campaign checked before it goes out, usually within a day." }
        : res.mode === "later" ? { title: "Campaign scheduled", body: sched?.label ?? "" }
        : { title: "Campaign sent", body: `${res.recipients.toLocaleString("en-US")} ${res.recipients === 1 ? "contact" : "contacts"} will receive it shortly.` },
      );
      setPhase("done");
    } catch {
      stopped.current = false;
      setPhase("review");
      toast.error("Couldn’t reach the server. Nothing was sent. Check your connection and try again.");
    }
  };

  const [testing, setTesting] = useState(false);
  const sendTest = async () => {
    if (testing) return;
    setTesting(true);
    const p = payloadRef.current;
    try {
      const r = await actions.test(p);
      if (r.ok) { lastSaved.current = JSON.stringify(p); toast.success(`Test email sent to ${r.to}`); }
      else toast.error(r.error);
    } catch { toast.error("Couldn’t send the test. Check your connection and try again."); }
    finally { setTesting(false); }
  };

  const steps: [Step, string][] = [["setup", "Setup"], ["content", "Content"], ["preview", "Preview"]];
  const statusText = status === "saving" ? "Saving…" : status === "just" ? "Saved just now" : "Saved";
  const custom = design.tpl === "custom";

  return (
    <section
      aria-label="Campaign editor"
      className="flex h-[calc(100dvh-8rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-mist bg-mist-50 text-sm text-ink sm:h-[calc(100dvh-9rem)] lg:h-[calc(100dvh-5rem)]"
    >
      {step !== "preview" ? (
        <header className="flex items-center gap-3 border-b border-mist bg-white px-4 py-2.5 sm:px-5">
          <h1 className="max-w-[40%] truncate text-[15px] font-bold text-ink max-[760px]:hidden">{campaign.name}</h1>
          <nav aria-label="Steps" className="flex gap-1">
            {steps.map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-current={step === k ? "step" : undefined}
                onClick={() => setStep(k)}
                className={cn("rounded-full px-3.5 py-1.5 text-[13px]", step === k ? "bg-brand-50 font-semibold text-brand-800" : "text-ink-soft hover:bg-mist-100")}
              >
                {label}
              </button>
            ))}
          </nav>
          <span role="status" className="ml-auto text-xs text-ink-muted max-[760px]:hidden">{statusText}</span>
        </header>
      ) : null}

      {step === "setup" ? (
        <SetupStep
          senders={props.senders} senderId={senderId} onSender={setSenderId}
          audienceValue={audienceValue} audienceOptions={audienceOptions} onAudience={onAudience} reach={reach}
          subject={subject} onSubject={setSubject} preheader={preheader} onPreheader={setPreheader}
          onNext={() => setStep("content")}
        />
      ) : null}

      {step === "content" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 px-4 pb-1 pt-3">
                <Button size="sm" variant="outline" disabled={historyLength === 0} onClick={undo}>Undo</Button>
                <Button size="sm" variant="outline" onClick={() => openPanel(custom ? "blocks" : "tpl")}>{custom ? "Add content" : "Change template"}</Button>
                <span className="flex-1" />
                <Button size="sm" variant="outline" loading={testing} onClick={sendTest}>Send test</Button>
              </div>
              <div className="mx-auto mb-2 mt-1 rounded-full border border-mist bg-white px-3 py-0.5 text-xs text-ink-muted">
                {design.tpl === "custom" ? "Custom layout" : `${TEMPLATE_NAMES[design.tpl]} template`}
              </div>
              <Canvas
                design={design} ctx={ctx} selBlock={sel} selSlot={slot}
                onSlot={selectSlot} onBlock={selectBlock}
                onInsert={(i) => { setPend(i); setSel(null); setSlot(null); openPanel("blocks"); }}
                onMove={moveBlock} onRemove={removeBlock} onReorder={reorder}
              />
            </div>
            <SidePanel
              open={open} tab={tab} setTab={setTab} onClose={() => setOpen(false)}
              design={design} logo={doc.logo} selBlock={selBlock} slot={slot}
              mutate={mutate} addBlock={addBlock} askLayout={askLayout}
              pickImage={pickImage} uploading={uploading}
              variables={variableList} fallbacks={fallbacks} setFallback={setFallback} insertVariable={insertVariable}
              pickPreset={pickPreset}
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-mist bg-white px-4 py-2.5">
            {!props.canSend ? <span className="mr-auto text-xs text-ink-muted">You can prepare this campaign, but sending is limited to people with permission to send. Ask a manager or administrator to send it.</span> : null}
            <Button size="sm" variant="outline" onClick={() => setStep("preview")}>Preview</Button>
            {props.canSend ? (
              <div ref={menuRef} className="relative flex">
                <Button size="sm" className="rounded-r-none" onClick={() => openReview("now")}>Send now</Button>
                <Button size="sm" className="rounded-l-none border-l border-white/30 !px-2.5" aria-label="More send options" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>▾</Button>
                {menu ? (
                  <div role="menu" className="absolute bottom-[calc(100%+6px)] right-0 z-20 w-60 rounded-xl border border-mist bg-white p-1 shadow-lg shadow-night/10">
                    <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-mist-100" onClick={() => openReview("now")}>
                      Send now<small className="block text-xs text-ink-muted">Review, then send right away</small>
                    </button>
                    <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-mist-100" onClick={() => { setMenu(false); setScheduling(true); }}>
                      Schedule<small className="block text-xs text-ink-muted">Pick a date, time and timezone</small>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "preview" && preview ? (
        <PreviewStep
          single={preview.single} compare={preview.compare} preheader={preheader}
          contacts={[...contacts.map((c) => ({ id: c.id, label: contactLabel(c) })), { id: NO_CONTACT, label: "No contact data (fallbacks)" }]}
          contactId={contactId}
          onContact={(id) => { pickedNone.current = id === NO_CONTACT; setContactId(id); }}
          comparing={comparing} onCompare={() => setComparing((c) => !c)}
          device={device} onDevice={setDevice} dark={dark} onDark={() => setDark((d) => !d)}
          onBack={() => setStep("content")}
          onContinue={props.canSend ? () => { setStep("content"); openReview("now"); } : undefined}
        />
      ) : null}

      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onFile} aria-hidden="true" tabIndex={-1} />

      <ScheduleDialog open={scheduling} onClose={() => setScheduling(false)} onContinue={continueSchedule} />
      <SwitchDialog target={switchTo} design={design} onClose={() => setSwitchTo(null)} onConfirm={() => { if (switchTo) applyLayout(switchTo); }} />
      <ReviewDialog
        open={review !== null} mode={review?.mode ?? "now"} onClose={() => setReview(null)}
        checks={checks} onFix={fix}
        subject={subject} preheader={preheader} senderName={sender?.fromName ?? ""} audienceName={audienceName}
        size={chosen ? reach : 0} scheduleLabel={sched?.label ?? null} scan={scan} hasLogo={Boolean(doc.logo.src)}
        onCheckOn={(v) => { setReview(null); setStep("preview"); if (v === "dark") setDark(true); else setDevice(v); }}
        phase={phase} outcome={outcome} onSend={send} onDone={() => router.refresh()}
      />
    </section>
  );
}
