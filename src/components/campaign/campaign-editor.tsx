"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import type { AudienceActions, AudienceState } from "@/components/dashboard/audience-panel";
import type { AutosaveResult, PreviewContact, SimpleResult, SubmitResult } from "@/app/(dashboard)/app/campaigns/actions";
import type { UploadResult } from "@/app/(dashboard)/app/campaigns/asset-actions";
import type { SaveTemplateResult } from "@/app/(dashboard)/app/templates/actions";
import type { AudienceOption, SenderRow } from "@/lib/queries";
import {
  badButtons, BLOCK_LABEL, clone, contentChecks, designStrings, hasUnsubscribeBlock, newBlock, planToTemplate, productsMissingLinks, switchTemplate, isLink,
  type BlockType, type Brand, type Cond, type DBlock, type Design, type Mode,
} from "@/lib/email/design";
import { isBuiltInVariable, sanitizeVariables, VARIABLE_TOKEN_RE, type VariableDef } from "@/lib/email/variables";
import { Canvas } from "./canvas";
import { Drawer, VarMenu, type DrawerTab } from "./drawer";
import { ReviewDialog, ScheduleDialog, SwitchDialog, AudienceDialog, type Check, type ReviewPhase, type ScheduleChoice } from "./modals";
import { PreviewView, type PreviewPerson } from "./preview-view";
import { insertAtCursor, resizeImage, variableKeys } from "./util";
import "./editor.css";

type View = "setup" | "content" | "preview";

export type EditorProps = {
  campaign: {
    id: string; name: string; subject: string; preview_text: string; from_name: string; sender_identity_id: string | null; department_id: string | null;
    design: Design; variables: VariableDef[]; audience: AudienceState;
  };
  brand: Brand;
  senders: SenderRow[];
  departments: { id: string; name: string }[];
  orgWideAllowed: boolean;
  lists: AudienceOption[];
  totalSubscribed: number;
  contactFieldKeys: string[];
  workspace: { name: string; business_address: string | null; timezone: string };
  can: { send: boolean; createContacts: boolean; viewContacts: boolean; saveTemplate: boolean };
  actions: {
    autosave: (formData: FormData) => Promise<AutosaveResult>;
    test: (formData: FormData) => Promise<SimpleResult>;
    submit: (formData: FormData) => Promise<SubmitResult>;
    remove: (formData: FormData) => Promise<void>;
    upload: (formData: FormData) => Promise<UploadResult>;
    saveTemplate: (input: { name: string; subject: string; previewText: string; design: unknown; variables: unknown; departmentId: string | null }) => Promise<SaveTemplateResult>;
    previewContacts: (selection: unknown) => Promise<PreviewContact[]>;
    audienceSize: (selection: unknown) => Promise<{ ok: true; size: number } | { ok: false; error: string }>;
    audience: AudienceActions;
  };
};

const AUTOSAVE_DELAY_MS = 2500;
const RETRY_DELAY_MS = 6000;
const HISTORY_LIMIT = 30;
const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "contact" : "contacts"}`;
const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width:760px)").matches;

export function CampaignEditor({ campaign, brand: initialBrand, senders, departments, orgWideAllowed, lists, totalSubscribed, contactFieldKeys, workspace, can, actions }: EditorProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const root = useRef<HTMLDivElement | null>(null);

  // ── Everything the person edits ────────────────────────────────────────────
  const [view, setView] = useState<View>(campaign.subject && campaign.sender_identity_id ? "content" : "setup");
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [preheader, setPreheader] = useState(campaign.preview_text);
  const [senderId, setSenderId] = useState(campaign.sender_identity_id ?? "");
  const [fromName, setFromName] = useState(campaign.from_name || senders.find((s) => s.id === campaign.sender_identity_id)?.fromName || "");
  const [departmentId, setDepartmentId] = useState(campaign.department_id ?? "");
  const [design, setDesign] = useState<Design>(campaign.design);
  const [brand, setBrand] = useState<Brand>(initialBrand);
  const [variables, setVariables] = useState<VariableDef[]>(campaign.variables);
  const [audience, setAudience] = useState<AudienceState>(campaign.audience);

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<DrawerTab>("tpl");
  const [selSlot, setSelSlot] = useState<string | null>(null);
  const [selBlock, setSelBlock] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [switchTo, setSwitchTo] = useState<Mode | null>(null);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [phase, setPhase] = useState<ReviewPhase>("review");
  const [sendMenu, setSendMenu] = useState(false);
  const [when, setWhen] = useState<"now" | "sched">("now");
  const [schedule, setSchedule] = useState<ScheduleChoice | null>(null);
  const [result, setResult] = useState<{ title: string; text: string; problems: string[] }>({ title: "", text: "", problems: [] });
  const [uploading, setUploading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  // preview
  const [device, setDevice] = useState<"desk" | "mob">("desk");
  const [dark, setDark] = useState(false);
  const [compare, setCompare] = useState(false);
  const [personId, setPersonId] = useState("none");

  // Latest values for handlers that must not see stale state.
  const designRef = useRef(design); designRef.current = design;
  const brandRef = useRef(brand); brandRef.current = brand;
  const history = useRef<string[]>([]);
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const preheaderRef = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const uploadKind = useRef<"logo" | "banner" | "image">("banner");
  const sendWrap = useRef<HTMLDivElement | null>(null);
  const audienceSelect = useRef<HTMLSelectElement | null>(null);

  const validDefs = useMemo(() => sanitizeVariables(variables), [variables]);
  const keys = useMemo(() => variableKeys(contactFieldKeys, validDefs), [contactFieldKeys, validDefs]);

  // ── History (undo) ─────────────────────────────────────────────────────────
  const snap = () => {
    history.current.push(JSON.stringify({ design: designRef.current, logo: brandRef.current.logo }));
    if (history.current.length > HISTORY_LIMIT) history.current.shift();
    setCanUndo(true);
  };
  const commit = (fn: (d: Design) => Design, withSnap = true) => {
    if (withSnap) snap();
    setDesign((d) => fn(clone(d)));
  };
  const undo = () => {
    const h = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (!h) return toast.info("Nothing to undo.");
    const o = JSON.parse(h) as { design: Design; logo: Brand["logo"] };
    setDesign(o.design);
    setBrand((b) => ({ ...b, logo: o.logo }));
    setSelBlock(null); setSelSlot(null);
  };
  const closeOnNarrow = () => { if (isNarrow()) setDrawerOpen(false); };

  // ── Sender and audience ─────────────────────────────────────────────────────
  const sender = senders.find((s) => s.id === senderId) ?? null;
  const usable = (s: SenderRow) => s.status === "active" && s.domainReady;
  const senderProblem = !senders.length ? "You have no work email yet. Ask an administrator to set one up." : !sender ? "Choose where this comes from." : !usable(sender) ? (sender.status !== "active" ? `${sender.email} is deactivated.` : `The domain of ${sender.email} isn’t verified.`) : null;

  const selection = useMemo(() => ({ mode: audience.mode, listIds: audience.listIds, contactIds: audience.contacts.map((c) => c.id) }), [audience]);
  const selectionKey = JSON.stringify(selection);
  const noAudience = audience.mode === "custom" && audience.listIds.length === 0 && audience.contacts.length === 0;
  const [size, setSize] = useState<number | null>(null);
  const [sizing, setSizing] = useState(false);
  const { audienceSize, previewContacts } = actions;
  useEffect(() => {
    if (noAudience) { setSize(0); setSizing(false); return; }
    let cancelled = false;
    setSizing(true);
    const t = setTimeout(async () => {
      try {
        const res = await audienceSize(JSON.parse(selectionKey));
        if (!cancelled && res.ok) setSize(res.size);
      } catch { /* keeps the last known size */ } finally { if (!cancelled) setSizing(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [selectionKey, noAudience, audienceSize]);

  const audienceValue = audience.mode === "all" ? "all" : noAudience ? "none" : audience.listIds.length === 1 && audience.contacts.length === 0 ? `list:${audience.listIds[0]}` : "custom";
  const audienceName = audience.mode === "all" ? "Everyone subscribed" : noAudience ? "No audience" : audience.listIds.length === 1 && audience.contacts.length === 0 ? lists.find((l) => l.id === audience.listIds[0])?.name ?? "1 list"
    : [audience.listIds.length ? `${audience.listIds.length} ${audience.listIds.length === 1 ? "list" : "lists"}` : "", audience.contacts.length ? `${audience.contacts.length} ${audience.contacts.length === 1 ? "person" : "people"}` : ""].filter(Boolean).join(" + ");
  const onAudienceSelect = (v: string) => {
    if (v === "none") setAudience({ mode: "custom", listIds: [], contacts: [] });
    else if (v === "all") setAudience({ mode: "all", listIds: [], contacts: [] });
    else if (v.startsWith("list:")) setAudience({ mode: "custom", listIds: [v.slice(5)], contacts: [] });
    else setAudienceOpen(true);
  };

  // ── Preview people ──────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState<PreviewContact[]>([]);
  useEffect(() => {
    if (noAudience) { setContacts([]); return; }
    let cancelled = false;
    const t = setTimeout(() => { previewContacts(JSON.parse(selectionKey)).then((r) => { if (!cancelled) setContacts(r); }).catch(() => undefined); }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [selectionKey, noAudience, previewContacts]);
  const previewPeople: PreviewPerson[] = useMemo(() => [
    ...contacts.map((c) => ({ id: c.id, label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email, data: { first_name: c.first_name, last_name: c.last_name, email: c.email, custom_fields: c.custom_fields } })),
    { id: "none", label: "No contact data (fallbacks)", data: {} },
  ], [contacts]);
  useEffect(() => { if (!previewPeople.some((p) => p.id === personId)) setPersonId(previewPeople[0].id); }, [previewPeople, personId]);

  // ── Autosave ────────────────────────────────────────────────────────────────
  const payload = useMemo(() => ({
    id: campaign.id, name, subject, previewText: preheader, fromName, senderId, departmentId,
    design: JSON.stringify(design), brand: JSON.stringify(brand), variables: JSON.stringify(validDefs), audience: JSON.stringify(selection),
  }), [campaign.id, name, subject, preheader, fromName, senderId, departmentId, design, brand, validDefs, selection]);
  const payloadKey = JSON.stringify(payload);
  const payloadRef = useRef(payload); payloadRef.current = payload;
  const toForm = (extra: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...payloadRef.current, ...extra })) fd.set(k, v);
    return fd;
  };

  const lastSaved = useRef<string>(payloadKey);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const stopped = useRef(false);
  const keyRef = useRef(payloadKey); keyRef.current = payloadKey;
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");

  const save = useCallback(async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (stopped.current) return false;
    if (inFlight.current) return false;
    if (keyRef.current === lastSaved.current) return true;
    const key = keyRef.current;
    inFlight.current = true;
    setSaveState("saving");
    try {
      const res = await actions.autosave(toForm());
      if (res.ok) { lastSaved.current = key; setSaveState("saved"); return true; }
      if (res.fatal) { stopped.current = true; toast.error(res.error); setSaveState("error"); return false; }
      setSaveState("error");
      timer.current = setTimeout(() => void save(), RETRY_DELAY_MS);
      return false;
    } catch {
      setSaveState("error");
      timer.current = setTimeout(() => void save(), RETRY_DELAY_MS);
      return false;
    } finally {
      inFlight.current = false;
      if (!stopped.current && !timer.current && keyRef.current !== lastSaved.current) timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  /** Saves right now and waits for it, so a test, a send or leaving the page uses what is on screen. */
  const flush = useCallback(async (): Promise<boolean> => {
    for (let i = 0; i < 40 && inFlight.current; i++) await new Promise((r) => setTimeout(r, 100));
    if (keyRef.current === lastSaved.current) return !stopped.current;
    return save();
  }, [save]);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (stopped.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void save(); }, AUTOSAVE_DELAY_MS);
  }, [payloadKey, save]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "hidden") void save(); };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (stopped.current) return;
      if (inFlight.current || keyRef.current !== lastSaved.current) { e.preventDefault(); e.returnValue = ""; }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onUnload);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("beforeunload", onUnload); if (timer.current) clearTimeout(timer.current); };
  }, [save]);

  // ── Which text field a variable goes into ───────────────────────────────────
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if ((t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) && t.hasAttribute("data-var-target")) lastField.current = t;
    };
    el.addEventListener("focusin", onFocus);
    return () => el.removeEventListener("focusin", onFocus);
  }, []);

  const insertVariable = (key: string) => {
    const f = lastField.current;
    if (f && f.isConnected && f.offsetParent !== null) { insertAtCursor(f, `{{${key}}}`); return; }
    // No field has been used yet: add it to the end of the selected text.
    const d = designRef.current;
    if (d.tpl !== "custom") {
      const k = ({ headline: "headline", body: "body", button: "btn", footer: "foot" } as Record<string, "headline" | "body" | "btn" | "foot">)[selSlot ?? ""];
      if (!k) return toast.info("Select a text part of the email first.");
      commit((x) => { x.C[k] = `${x.C[k]} {{${key}}}`.trim(); return x; });
    } else {
      const b = d.blocks.find((x) => x.id === selBlock);
      if (!b || b.x === undefined) return toast.info("Select a text block first.");
      commit((x) => { const t = x.blocks.find((y) => y.id === b.id)!; t.x = `${t.x} {{${key}}}`.trim(); return x; });
    }
  };

  // ── Editing the design ──────────────────────────────────────────────────────
  const selectedBlock: DBlock | null = design.blocks.find((b) => b.id === selBlock) ?? null;

  const chooseSlot = (slot: string) => { setSelSlot(slot); setDrawerOpen(true); setTab("edit"); };
  const chooseBlock = (id: number) => {
    const b = design.blocks.find((x) => x.id === id);
    if (!b) return;
    setSelBlock(id); setDrawerOpen(true);
    setTab(b.x !== undefined || ["columns", "countdown", "products", "social", "logo", "banner"].includes(b.t) ? "edit" : b.t === "image" ? "media" : "blocks");
  };

  const requestTemplate = (m: Mode) => { if (m !== design.tpl) setSwitchTo(m); };
  const confirmSwitch = () => {
    if (!switchTo) return;
    const to = switchTo;
    commit((d) => switchTemplate(d, to));
    setSwitchTo(null); setSelBlock(null); setSelSlot(null);
    toast.success(to === "custom" ? "Custom layout. Drag blocks to reorder." : "Template switched.");
    closeOnNarrow();
  };

  const addBlock = (t: BlockType) => {
    snap();
    const d0 = designRef.current;
    const b = newBlock(d0, t);
    const at = insertAt ?? (() => { const i = d0.blocks.findIndex((x) => x.id === selBlock); return i < 0 ? d0.blocks.length : i + 1; })();
    setDesign((d) => { const n = clone(d); n.blocks.splice(at, 0, b); n.nextId = Math.max(n.nextId, b.id); return n; });
    setSelBlock(b.id); setInsertAt(null);
    setTab(b.x !== undefined || ["columns", "countdown", "products", "social"].includes(t) ? "edit" : "blocks");
    closeOnNarrow();
  };
  const moveBlock = (id: number, dir: -1 | 1) => {
    const i = design.blocks.findIndex((b) => b.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= design.blocks.length) return;
    commit((d) => { const [m] = d.blocks.splice(i, 1); d.blocks.splice(j, 0, m); return d; });
  };
  const deleteBlock = (id: number) => { commit((d) => { d.blocks = d.blocks.filter((b) => b.id !== id); return d; }); setSelBlock(null); };
  const reorder = (fromId: number, toId: number) =>
    commit((d) => { const i = d.blocks.findIndex((b) => b.id === fromId); const [m] = d.blocks.splice(i, 1); const j = d.blocks.findIndex((b) => b.id === toId); d.blocks.splice(j, 0, m); return d; });

  const setCond = (c: Cond) =>
    commit((d) => {
      if (d.tpl === "custom") { const b = d.blocks.find((x) => x.id === selBlock); if (b) { if (c) b.cond = c; else delete b.cond; } }
      else if (selSlot) { if (c) d.cond[selSlot] = c; else delete d.cond[selSlot]; }
      return d;
    });

  const applyPreset = (i: number) => {
    const d = designRef.current;
    const b = d.blocks.find((x) => x.id === selBlock);
    if (d.tpl !== "custom" || b?.t === "banner") { commit((x) => { x.banner = { ...x.banner, src: `g${i}` }; return x; }); }
    else if (b?.t === "image") { commit((x) => { const t = x.blocks.find((y) => y.id === b.id)!; t.g = i; delete t.img; return x; }); }
    else { addBlock("image"); setDesign((x) => { const n = clone(x); const last = n.blocks.find((y) => y.id === n.nextId); if (last) last.g = i; return n; }); }
    closeOnNarrow();
  };

  // ── Pictures ────────────────────────────────────────────────────────────────
  const pickFile = (kind: "logo" | "banner" | "image") => { uploadKind.current = kind; fileInput.current?.click(); };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const kind = uploadKind.current;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return toast.error("Use a PNG, JPG, WebP or GIF picture.");
    setUploading(true);
    try {
      const blob = await resizeImage(file, kind === "logo" ? 400 : 1200, kind === "logo" || file.type === "image/png");
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", new File([blob], `${kind}.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type }));
      const res = await actions.upload(fd);
      if (!res.ok) return toast.error(res.error);
      if (kind === "logo") { snap(); setBrand((b) => ({ ...b, logo: { ...b.logo, src: res.url } })); }
      else if (kind === "banner") commit((d) => { d.banner = { src: res.url, fx: 50, fy: 50, alt: d.banner.alt }; return d; });
      else if (selBlock !== null) commit((d) => { const t = d.blocks.find((y) => y.id === selBlock); if (t) t.img = res.url; return d; });
      toast.success("Picture added.");
    } catch (e) {
      toast.error((e as Error).message || "Couldn’t upload that picture. Try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const saveAsTemplate = async () => {
    if (savingTemplate) return;
    setSavingTemplate(true);
    try {
      const res = await actions.saveTemplate({ name: name.trim(), subject, previewText: preheader, design: designRef.current, variables: validDefs, departmentId: departmentId || null });
      if (res.ok) toast.success(`Saved “${res.name}” to your templates.`); else toast.error(res.error);
    } catch { toast.error("Couldn’t save the template. Check your connection and try again."); } finally { setSavingTemplate(false); }
  };

  // ── Sending ─────────────────────────────────────────────────────────────────
  const sendTest = async () => {
    if (!(await flush())) return toast.error("Couldn’t save your changes, so no test was sent.");
    const res = await actions.test(toForm());
    if (res.ok) toast.success(res.message); else toast.error(res.error);
  };

  const used = useMemo(() => {
    const bare = new Map<string, boolean>(); // variable → used at least once without an inline fallback
    for (const t of [subject, preheader, ...designStrings(design)]) {
      for (const m of (t ?? "").matchAll(new RegExp(VARIABLE_TOKEN_RE.source, "g"))) {
        const k = m[1].toLowerCase();
        bare.set(k, (bare.get(k) ?? false) || m[2] === undefined);
      }
    }
    return bare;
  }, [subject, preheader, design]);
  const hasFallback = (k: string) => {
    const d = validDefs.find((v) => v.key === k);
    if (d?.scope === "campaign" && d.value.trim()) return true;
    if (d?.fallback.trim()) return true;
    return k === "first_name" && !d; // built-in default
  };
  const noFallback = [...used].filter(([k, bare]) => bare && !hasFallback(k) && k !== "email").map(([k]) => k);
  const bad = badButtons(design);
  const prodMissing = productsMissingLinks(design);
  const content = useMemo(() => contentChecks(design, subject, preheader), [design, subject, preheader]);

  const checks: Check[] = [
    { ok: !!subject.trim(), title: "Subject is filled in", fix: "Add a subject", onFix: () => { closeReview(); setView("setup"); } },
    { ok: !senderProblem, title: senderProblem ?? "Sender is ready", detail: sender && !senderProblem ? `${fromName || sender.fromName} <${sender.email}>` : undefined, fix: "Choose sender", onFix: () => { closeReview(); setView("setup"); } },
    { ok: !noAudience && (size ?? 0) > 0, title: !noAudience && (size ?? 0) > 0 ? "Audience selected" : "No audience selected", detail: !noAudience && (size ?? 0) > 0 ? `${audienceName} · ${people(size ?? 0)}` : "Choose who receives this campaign", fix: "Choose audience", onFix: () => { closeReview(); setView("setup"); setTimeout(() => audienceSelect.current?.focus(), 50); } },
    { ok: true, warn: !brand.logo.src, title: brand.logo.src ? "Logo added" : "No logo added", detail: brand.logo.src ? undefined : "You can still send, but it will go without a logo" },
    { ok: hasUnsubscribeBlock(design), title: "Unsubscribe link present", detail: hasUnsubscribeBlock(design) ? undefined : "Required before you can send", fix: "Add a footer block", onFix: () => { addFooter(); } },
    { ok: noFallback.length === 0, title: "Variables used have fallbacks", detail: noFallback.length ? `Missing for: ${noFallback.map((k) => k.replace(/_/g, " ")).join(", ")}` : undefined, fix: "Add fallbacks", onFix: () => { closeReview(); setView("content"); setDrawerOpen(true); setTab("vars"); } },
    { ok: bad.length === 0, title: "Button links are set", detail: bad.length ? `${bad.length} ${bad.length > 1 ? "buttons have" : "button has"} no valid link (https:// or mailto:)` : undefined, fix: "Add link", onFix: () => { closeReview(); setView("content"); setDrawerOpen(true); setTab("edit"); if (bad[0].slot) setSelSlot(bad[0].slot); if (bad[0].id) setSelBlock(bad[0].id); } },
    ...(prodMissing ? [{ ok: true, warn: true, title: "Some products have no link", detail: `${prodMissing} ${prodMissing > 1 ? "products won’t" : "product won’t"} be clickable` }] : []),
    { ok: !!workspace.business_address, title: workspace.business_address ? "Business address set" : "Business address missing", detail: workspace.business_address ? undefined : "It appears in every email footer. Add it in Settings.", fix: "Open Settings", onFix: () => { void flush().then(() => router.push("/app/settings")); } },
  ];

  const addFooter = () => {
    closeReview();
    setView("content");
    if (designRef.current.tpl !== "custom") { setSwitchTo("custom"); return; }
    commit((d) => { const b = newBlock(d, "footer"); d.blocks.push(b); d.nextId = Math.max(d.nextId, b.id); return d; });
    toast.success("Footer added.");
  };

  const openReview = (w: "now" | "sched") => {
    setWhen(w); setPhase("review"); setReviewOpen(true); setSendMenu(false);
    // Pictures, text and the rest were saved a moment ago; this makes sure the review is of what is on screen.
    void flush();
  };
  const closeReview = () => setReviewOpen(false);

  const finalSend = async () => {
    setPhase("busy");
    if (!(await flush())) { setResult({ title: "", text: "", problems: ["Couldn’t save your changes. Check your connection and try again."] }); setPhase("failed"); return; }
    try {
      const res = await actions.submit(toForm({ mode: when === "sched" ? "later" : "now", scheduledAtIso: when === "sched" && schedule ? schedule.iso : "" }));
      if (res.ok) { setResult({ title: res.title, text: res.message, problems: [] }); setPhase("done"); }
      else { setResult({ title: "", text: "", problems: res.problems }); setPhase("failed"); }
    } catch {
      setResult({ title: "", text: "", problems: ["Couldn’t reach the server. Nothing was sent; check your connection and try again."] });
      setPhase("failed");
    }
  };
  const afterSend = () => { stopped.current = true; router.push(`/app/campaigns/${campaign.id}`); router.refresh(); };

  const deleteCampaign = async () => {
    const ok = await confirm({ title: "Delete this campaign?", description: "The draft and everything you’ve written in it are removed. This can’t be undone.", confirmLabel: "Delete campaign", tone: "danger" });
    if (!ok) return;
    stopped.current = true;
    const fd = new FormData(); fd.set("id", campaign.id);
    await actions.remove(fd);
  };

  // The send menu closes on an outside click or Escape.
  useEffect(() => {
    if (!sendMenu) return;
    const away = (e: PointerEvent) => { if (sendWrap.current && !sendWrap.current.contains(e.target as Node)) setSendMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSendMenu(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [sendMenu]);

  const goView = (v: View) => { setView(v); setSendMenu(false); if (v === "preview" && !compare) window.scrollTo({ top: 0 }); };
  const planNote = design.tpl === "custom" ? planToTemplate(design) : null; void planNote;
  const modeLabel = design.tpl === "custom" ? "Custom layout" : `${design.tpl.charAt(0).toUpperCase()}${design.tpl.slice(1)} template`;
  const savedText = saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn’t save, retrying…" : keyRef.current !== lastSaved.current ? "Unsaved changes" : "Saved just now";

  return (
    <div className="ce" ref={root}>
      <header>
        <Link href="/app/campaigns" className="back" aria-label="Back to campaigns" onClick={(e) => { if (keyRef.current !== lastSaved.current) { e.preventDefault(); void flush().then(() => router.push("/app/campaigns")); } }}>‹</Link>
        <h1 className="sr-only">Campaign editor</h1>
        <input className="title" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Campaign name" />
        <nav className="steps" aria-label="Steps">
          {(["setup", "content", "preview"] as View[]).map((v) => (
            <button key={v} type="button" className={view === v ? "on" : ""} aria-current={view === v ? "step" : undefined} onClick={() => goView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </nav>
        <span className={`saved${saveState === "error" ? " err" : ""}`} role="status" aria-live="polite">{savedText}</span>
      </header>

      {/* ── Setup ─────────────────────────────────────────────────────────── */}
      <section className={`view setup${view === "setup" ? " on" : ""}`} aria-label="Setup">
        <div className="card">
          <h2>Campaign setup</h2>
          <p>Who it’s from, who gets it, and what they see in the inbox.</p>
          <div className="row">
            <div><label htmlFor="from">Sender name</label><input type="text" id="from" value={fromName} maxLength={80} onChange={(e) => setFromName(e.target.value)} /></div>
            <div>
              <label htmlFor="mail">Sender email</label>
              <select id="mail" value={senderId} onChange={(e) => { setSenderId(e.target.value); const s = senders.find((x) => x.id === e.target.value); if (s) setFromName(s.fromName); }}>
                <option value="">{senders.length ? "Choose where this comes from…" : "No work email yet"}</option>
                {(["primary", "alias"] as const).map((kind) => {
                  const group = senders.filter((s) => s.kind === kind);
                  return group.length ? (
                    <optgroup key={kind} label={kind === "primary" ? "Your work email" : "Your aliases"}>
                      {group.map((s) => <option key={s.id} value={s.id} disabled={!usable(s) && s.id !== senderId}>{s.email}{s.status !== "active" ? " (deactivated)" : !s.domainReady ? " (domain not verified)" : ""}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </div>
          </div>
          {senderProblem ? <div className="hint bad">{senderProblem}</div> : <div className="hint"><span>A sender is an alias we send as; it can’t receive replies unless that address has a mailbox.</span></div>}

          <label htmlFor="aud">Audience</label>
          <select id="aud" ref={audienceSelect} value={audienceValue} onChange={(e) => onAudienceSelect(e.target.value)}>
            <option value="none">Choose an audience…</option>
            <option value="all">Everyone subscribed ({totalSubscribed.toLocaleString("en-US")})</option>
            {lists.map((l) => <option key={l.id} value={`list:${l.id}`}>{l.name} ({l.subscribed.toLocaleString("en-US")})</option>)}
            {audienceValue === "custom" ? <option value="custom">Custom: {audienceName}</option> : <option value="custom">Combine lists and people…</option>}
          </select>
          <div className={`hint${!noAudience && size === 0 ? " bad" : ""}`}>
            <span>{noAudience ? "Choose who receives this campaign" : `Estimated reach: ${size === null || sizing ? "…" : people(size)}`}</span>
            <button type="button" className="lnk" onClick={() => setAudienceOpen(true)}>Customize audience</button>
          </div>

          {departments.length > 0 ? (
            <>
              <label htmlFor="dept">Department</label>
              <select id="dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                {orgWideAllowed ? <option value="">Whole organization</option> : null}
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <div className="hint"><span>Only members of this department, and people with access to every department, can see this campaign.</span></div>
            </>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label htmlFor="subj">Subject</label>
            <VarMenu keys={keys} target={subjectRef} />
          </div>
          <input type="text" id="subj" data-var-target ref={subjectRef} value={subject} maxLength={200} placeholder="What’s this email about?" onChange={(e) => setSubject(e.target.value)} />
          <div className="hint"><span>Aim for under 60 characters</span><span>{subject.length}</span></div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label htmlFor="pre">Preheader</label>
            <VarMenu keys={keys} target={preheaderRef} />
          </div>
          <input type="text" id="pre" data-var-target ref={preheaderRef} value={preheader} maxLength={200} placeholder="A short line that follows the subject" onChange={(e) => setPreheader(e.target.value)} />
          <div className="hint"><span>Shown after the subject in most inboxes</span><span>{preheader.length}</span></div>

          <div className="inbox" aria-label="Inbox preview"><b>{subject || "Your subject appears here"}</b><span>{preheader || "Preheader text follows"}</span></div>
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn danger" onClick={deleteCampaign}>Delete campaign</button>
            <button type="button" className="btn pri" onClick={() => goView("content")}>Next: Content</button>
          </div>
        </div>
      </section>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <section className={`view${view === "content" ? " on" : ""}`} aria-label="Content">
        <div className="editor">
          <div className="stage">
            <div className="tools">
              <button type="button" className="btn" onClick={undo} disabled={!canUndo}>Undo</button>
              <button type="button" className="btn" onClick={() => { setDrawerOpen(true); setTab(design.tpl === "custom" ? "blocks" : "tpl"); }}>Add content</button>
              <span className="sp" />
              <button type="button" className="btn" onClick={sendTest}>Send test</button>
            </div>
            <div className="modeRow"><span className="modeLbl">{modeLabel}</span></div>
            <div className="canvas">
              <Canvas
                design={design} brand={brand} selBlock={selBlock} selSlot={selSlot}
                onSlot={chooseSlot} onBlock={chooseBlock}
                onInsert={(i) => { setInsertAt(i); setSelBlock(null); setDrawerOpen(true); setTab("blocks"); }}
                onMove={moveBlock} onDelete={deleteBlock} onReorder={reorder}
              />
            </div>
          </div>
          <Drawer
            design={design} brand={brand} tab={tab} setTab={setTab} open={drawerOpen} onClose={() => setDrawerOpen(false)}
            selBlock={selectedBlock} selSlot={selSlot} variables={variables} setVariables={setVariables} contactFieldKeys={contactFieldKeys}
            uploading={uploading} canSaveTemplate={can.saveTemplate} savingTemplate={savingTemplate} onSaveTemplate={saveAsTemplate}
            onTemplate={requestTemplate} onAddBlock={addBlock}
            onPatchC={(patch) => commit((d) => { Object.assign(d.C, patch); return d; }, false)}
            onPatchBlock={(id, patch) => commit((d) => { const b = d.blocks.find((x) => x.id === id); if (b) Object.assign(b, patch); return d; }, false)}
            onBanner={(patch, s) => commit((d) => { d.banner = { ...d.banner, ...patch }; return d; }, s)}
            onLogo={(patch) => { snap(); setBrand((b) => ({ ...b, logo: { ...b.logo, ...patch } })); }}
            onCond={setCond}
            onColor={(c) => { commit((d) => { d.color = c; return d; }); closeOnNarrow(); }}
            onUpload={pickFile}
            onClear={(k) => { if (k === "logo") { snap(); setBrand((b) => ({ ...b, logo: { ...b.logo, src: "" } })); } else commit((d) => { d.banner = { ...d.banner, src: "" }; return d; }); }}
            onPreset={applyPreset} onInsertVar={insertVariable} mark={() => undefined}
          />
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        <div className="bar">
          <button type="button" className="btn" onClick={() => goView("preview")}>Preview</button>
          {can.send ? (
            <div className="split" ref={sendWrap}>
              <button type="button" className="btn pri" onClick={() => openReview("now")}>Send now</button>
              <button type="button" className="btn pri" aria-label="Send options" aria-haspopup="menu" aria-expanded={sendMenu} onClick={() => setSendMenu((o) => !o)}>▾</button>
              <div className={`menu${sendMenu ? " open" : ""}`} role="menu">
                <button type="button" className="it" role="menuitem" onClick={() => openReview("now")}>Send now<small>Review, then send right away</small></button>
                <button type="button" className="it" role="menuitem" onClick={() => { setSendMenu(false); setScheduleOpen(true); }}>Schedule<small>Pick a date, time and timezone</small></button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Preview ───────────────────────────────────────────────────────── */}
      {view === "preview" ? (
        <PreviewView
          design={design} brand={brand} subject={subject} preheader={preheader} variables={validDefs} people={previewPeople} personId={personId} setPersonId={setPersonId}
          businessAddress={workspace.business_address} timezone={workspace.timezone} dark={dark} setDark={setDark} device={device} setDevice={setDevice} compare={compare} setCompare={setCompare}
          onBack={() => goView("content")} onContinue={can.send ? () => openReview("now") : null}
        />
      ) : null}

      <SwitchDialog target={switchTo} design={design} onCancel={() => setSwitchTo(null)} onConfirm={confirmSwitch} />
      <ScheduleDialog open={scheduleOpen} timezone={workspace.timezone} onClose={() => setScheduleOpen(false)} onContinue={(c) => { setSchedule(c); setScheduleOpen(false); openReview("sched"); }} />
      <AudienceDialog open={audienceOpen} onClose={() => setAudienceOpen(false)} audience={audience} setAudience={setAudience} lists={lists} totalSubscribed={totalSubscribed} size={size} sizing={sizing} canImport={can.viewContacts} canCreateContacts={can.createContacts} actions={actions.audience} />
      <ReviewDialog
        open={reviewOpen} phase={phase} onClose={closeReview} checks={checks} subject={subject} preheader={preheader} fromName={fromName} audienceName={audienceName} reach={size}
        when={when} scheduleLabel={schedule?.label ?? ""} content={content} hasLogo={!!brand.logo.src}
        onDevice={(v) => { closeReview(); setDark(v === "dark"); setDevice(v === "mob" ? "mob" : "desk"); setView("preview"); }}
        onSend={finalSend} resultTitle={result.title} resultText={result.text} problems={result.problems} onDone={afterSend} onBack={() => setPhase("review")}
      />
    </div>
  );
}
