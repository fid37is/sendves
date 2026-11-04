"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock, Maximize2, Minimize2, Minus, PenSquare, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  discardDraftAction, loadDraftAction, saveDraftAction, scheduleEmailAction, searchContactsAction, startEmailAction, unscheduleAction, type ContactHit,
} from "@/app/(dashboard)/app/inbox/actions";
import { AttachIconButton, FileChips } from "@/components/inbox/attach-field";
import { SavedReplies } from "@/components/inbox/saved-replies";
import { parseAddressList, toImportance, type AttachmentInfo, type DraftStatus, type Importance, type SavedReply } from "@/lib/inbox";

type Identity = { id: string; email: string; fromName: string; kind: "primary" | "alias" };

/** What the composer opens with: nothing (a blank email), a contact, some words (a forward), or a saved draft. */
export type ComposeOptions = { contact?: ContactHit | null; subject?: string; body?: string; draftId?: string };

type Api = { open: (opts?: ComposeOptions) => void };
const ComposeContext = createContext<Api | null>(null);

/** Opens the composer from anywhere on the inbox page. Null when the person can't write emails. */
export const useCompose = () => useContext(ComposeContext);

type Handle = { flush: () => Promise<void>; draftId: () => string | null; reveal: () => void };

/**
 * One email to one contact, written in a window at the bottom of the screen, like a mail program. It is saved
 * as a draft while it is written, so closing it loses nothing, and it can be sent now or scheduled.
 */
export function ComposeProvider({
  identities, savedReplies = [], myName = "", initialContact = null, initialOpen = false, children,
}: {
  identities: Identity[];
  savedReplies?: SavedReply[];
  myName?: string;
  initialContact?: ContactHit | null;
  initialOpen?: boolean;
  children: ReactNode;
}) {
  const counter = useRef(1);
  const [win, setWin] = useState<{ key: number; opts: ComposeOptions } | null>(initialOpen ? { key: 1, opts: { contact: initialContact } } : null);
  const handle = useRef<Handle | null>(null);

  const open = useCallback((opts: ComposeOptions = {}) => {
    const current = handle.current;
    if (current && opts.draftId && current.draftId() === opts.draftId) return current.reveal();
    // Whatever is being written is saved as a draft first, so opening another email loses nothing.
    void (current ? current.flush() : Promise.resolve()).then(() => setWin({ key: ++counter.current, opts }));
  }, []);

  return (
    <ComposeContext.Provider value={{ open }}>
      {children}
      {win ? (
        <ComposeWindow
          key={win.key}
          opts={win.opts}
          identities={identities}
          savedReplies={savedReplies}
          myName={myName}
          register={(h) => { handle.current = h; }}
          onClose={() => setWin(null)}
        />
      ) : null}
    </ComposeContext.Provider>
  );
}

/** The button that opens a blank email. */
export function ComposeButton({ className }: { className?: string }) {
  const compose = useCompose();
  if (!compose) return null;
  return (
    // On a phone it is just the icon (a round button the height of the search bar); from "sm" up it shows the word too.
    <Button onClick={() => compose.open()} aria-label="Compose" title="Compose" className={cn("!h-12 !w-12 !gap-0 !px-0 sm:!h-11 sm:!w-auto sm:!gap-2 sm:!px-6", className)}>
      <PenSquare className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Compose</span>
    </Button>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const when = (d: Date) => d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function quickTimes(now: Date) {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const toMonday = ((8 - now.getDay()) % 7) || 7;
  const list = [{ label: "Tomorrow morning", at: at(1, 8) }, { label: "Tomorrow afternoon", at: at(1, 13) }, { label: "Monday morning", at: at(toMonday, 8) }];
  return list.filter((o, i) => list.findIndex((x) => x.at.getTime() === o.at.getTime()) === i);
}

/** "Schedule send": a few good times, or any time up to a year ahead. */
function ScheduleMenu({ mode, onMode, onPick, onClose }: { mode: "send" | "pick"; onMode: (m: "send" | "pick") => void; onPick: (d: Date) => void; onClose: () => void }) {
  const [now] = useState(() => new Date());
  const tomorrow8 = quickTimes(now)[0].at;
  const [value, setValue] = useState(toLocalInput(tomorrow8));
  const min = toLocalInput(new Date(now.getTime() + 2 * 60_000));
  const max = toLocalInput(new Date(now.getTime() + 364 * 86_400_000));
  const picked = new Date(value);
  const valid = !Number.isNaN(picked.getTime()) && picked.getTime() >= now.getTime() + 60_000;

  return (
    <div role="menu" aria-label="Send options" className="absolute bottom-full right-0 z-20 mb-2 w-72 rounded-2xl border border-mist bg-white p-2 shadow-xl">
      <p className="px-3 pb-1 pt-2 text-sm font-bold text-ink">Schedule send</p>
      {mode === "send" ? (
        <>
          {quickTimes(now).map((o) => (
            <button key={o.label} type="button" role="menuitem" onClick={() => onPick(o.at)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm text-ink hover:bg-mist-100">
              <span>{o.label}</span>
              <span className="text-xs text-ink-muted">{when(o.at)}</span>
            </button>
          ))}
          <button type="button" role="menuitem" onClick={() => onMode("pick")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Pick date and time
          </button>
        </>
      ) : (
        <div className="space-y-3 px-3 pb-2 pt-1">
          <label htmlFor="schedule-at" className="sr-only">Date and time</label>
          <input
            id="schedule-at"
            type="datetime-local"
            value={value}
            min={min}
            max={max}
            onChange={(e) => setValue(e.target.value)}
            className="h-10 w-full rounded-xl border border-mist bg-white px-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <p className="text-xs text-ink-muted">{valid ? `Goes out ${when(picked)}.` : "Choose a time at least a minute from now."}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => onMode("send")}>Back</Button>
            <Button size="sm" disabled={!valid} onClick={() => onPick(picked)}>Schedule send</Button>
          </div>
        </div>
      )}
      <button type="button" onClick={onClose} className="sr-only">Close</button>
    </div>
  );
}

/** Cc or Bcc: an address becomes a chip when you press Enter, type a comma, or leave the box. */
export function RecipientField({
  id, label, list, onChange, max, disabled, className,
}: {
  id: string;
  label: string;
  list: string[];
  onChange: (next: string[]) => void;
  /** How many addresses this field may hold (To, Cc and Bcc share ten). */
  max: number;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function commit(raw: string) {
    const t = raw.trim();
    if (!t) return setProblem(null);
    const parsed = parseAddressList(t);
    if ("error" in parsed) return setProblem(parsed.error);
    const next = Array.from(new Set([...list, ...parsed.list]));
    if (next.length > max) return setProblem("That’s more people than To, Cc and Bcc can hold together (10).");
    onChange(next);
    setText("");
    setProblem(null);
  }

  return (
    <div>
      <div className={className}>
        <label htmlFor={id} className="w-12 shrink-0 text-ink-muted">{label}</label>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {list.map((a) => (
            <span key={a} className="inline-flex max-w-full items-center gap-1 rounded-full bg-mist-100 py-0.5 pl-2.5 pr-1 text-xs text-ink">
              <span className="truncate">{a}</span>
              {disabled ? null : (
                <button type="button" aria-label={`Remove ${a}`} onClick={() => onChange(list.filter((x) => x !== a))} className="rounded-full p-0.5 text-ink-muted hover:bg-mist hover:text-ink">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
          <input
            id={id}
            value={text}
            readOnly={disabled}
            onChange={(e) => { const v = e.target.value; if (/[,;\n]$/.test(v) && v.trim().length > 1) commit(v); else { setText(v); if (problem) setProblem(null); } }}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === "," || e.key === ";") && text.trim()) { e.preventDefault(); commit(text); }
              else if (e.key === "Backspace" && !text && list.length > 0 && !disabled) onChange(list.slice(0, -1));
            }}
            onBlur={() => commit(text)}
            placeholder={list.length ? "" : "name@example.com"}
            autoComplete="off"
            className="min-w-[8rem] flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          />
        </div>
      </div>
      {problem ? <p role="alert" className="border-b border-mist px-4 py-1.5 text-xs font-medium text-danger">{problem}</p> : null}
    </div>
  );
}

/** How important the email is marked when it arrives. */
export function ImportanceSelect({ value, onChange, disabled }: { value: Importance; onChange: (v: Importance) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(toImportance(e.target.value))}
      disabled={disabled}
      aria-label="Importance"
      title="Importance"
      className={cn("h-9 rounded-full border-0 bg-transparent px-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60", value === "high" ? "text-danger" : "text-ink-soft")}
    >
      <option value="normal">Normal importance</option>
      <option value="high">High importance</option>
      <option value="low">Low importance</option>
    </select>
  );
}

function ComposeWindow({
  opts, identities, savedReplies, myName, register, onClose,
}: {
  opts: ComposeOptions;
  identities: Identity[];
  savedReplies: SavedReply[];
  myName: string;
  register: (h: Handle | null) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<"normal" | "min" | "max">("normal");

  const [contact, setContact] = useState<ContactHit | null>(opts.contact ?? null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [identityId, setIdentityId] = useState(identities[0]?.id ?? "");
  const [subject, setSubject] = useState(opts.subject ?? "");
  const [body, setBody] = useState(opts.body ?? "");
  const [alsoTo, setAlsoTo] = useState<string[]>([]);
  const [toFocus, setToFocus] = useState(false);
  const [toProblem, setToProblem] = useState<string | null>(null);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [importance, setImportance] = useState<Importance>("normal");
  const [files, setFiles] = useState<File[]>([]);
  const [kept, setKept] = useState<AttachmentInfo[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [status, setStatus] = useState<DraftStatus | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(opts.draftId));
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [menu, setMenu] = useState<null | "send" | "pick">(null);

  const toRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  const dirty = useRef(false);
  const touched = useRef(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const sendingRef = useRef(false);
  sendingRef.current = sending;

  // The newest values, for saves that run later than the render that started them.
  const latest = useRef({ contact, identityId, subject, body, files, kept, draftId, status, cc, bcc, importance, alsoTo });
  latest.current = { contact, identityId, subject, body, files, kept, draftId, status, cc, bcc, importance, alsoTo };

  useEffect(() => setMounted(true), []);

  const locked = status === "scheduled" || status === "sending";
  const noSender = identities.length === 0;
  const canSend = Boolean(contact && contact.status === "subscribed" && identityId && subject.trim() && body.trim()) && !loading && !sending && status !== "sending";

  const edit = () => { dirty.current = true; touched.current = true; setSaved("idle"); };

  /** Saves what is written as a draft. Saves run one after the other, so a slow one never overwrites a newer one. */
  const save = useCallback((): Promise<void> => {
    const task = async () => {
      const s = latest.current;
      const has = Boolean(s.contact || s.subject.trim() || s.body.trim() || s.files.length || s.kept.length || s.cc.length || s.bcc.length || s.alsoTo.length);
      if (!dirty.current || !has || s.status === "scheduled" || s.status === "sending" || sendingRef.current) return;
      dirty.current = false;
      setSaved("saving");
      const fd = new FormData();
      if (s.draftId) fd.set("draftId", s.draftId);
      if (s.contact) fd.set("contactId", s.contact.id);
      if (s.contact && !s.contact.id) fd.set("primary", s.contact.email);
      if (s.identityId) fd.set("identityId", s.identityId);
      fd.set("subject", s.subject);
      fd.set("body", s.body);
      fd.set("to", s.alsoTo.join(","));
      fd.set("cc", s.cc.join(","));
      fd.set("bcc", s.bcc.join(","));
      fd.set("importance", s.importance);
      fd.set("keep", JSON.stringify(s.kept.map((a) => a.id)));
      for (const f of s.files) fd.append("files", f);
      try {
        const res = await saveDraftAction(fd);
        if (res.ok && res.id) {
          setDraftId(res.id);
          setStatus("draft");
          setFailure(null);
          setKept(res.attachments ?? []);
          setFiles((cur) => cur.filter((f) => !s.files.includes(f)));
          setSaved("saved");
        } else {
          // The draft was removed somewhere else: the next change starts a new one.
          if (res.gone) setDraftId(null);
          else toast.error(res.error ?? "That draft didn’t save.");
          dirty.current = true;
          setSaved("idle");
        }
      } catch {
        dirty.current = true;
        setSaved("idle");
      }
    };
    const next = chain.current.then(task, task);
    chain.current = next;
    return next as Promise<void>;
  }, []);

  useEffect(() => {
    register({ flush: async () => { await save(); if (latest.current.draftId && touched.current) router.refresh(); }, draftId: () => latest.current.draftId, reveal: () => setView("normal") });
    return () => register(null);
  }, [register, save, router]);

  // A saved draft, or a scheduled email, opens with everything it held.
  useEffect(() => {
    if (!opts.draftId) return;
    let live = true;
    loadDraftAction(opts.draftId)
      .then((res) => {
        if (!live) return;
        if (!res.ok) { toast.error(res.error); onClose(); return; }
        const d = res.draft;
        setDraftId(d.id);
        setStatus(d.status);
        setScheduledAt(d.scheduledAt);
        setFailure(d.error);
        // A draft for someone who isn't a contact keeps them as the first address in "To".
        const loose = !d.contactId && d.toEmails.length > 0;
        setContact(d.contactId ? { id: d.contactId, email: d.contactEmail, name: d.contactName, status: d.contactStatus ?? "subscribed" } : loose ? { id: "", email: d.toEmails[0], name: "", status: "subscribed" } : null);
        if (d.identityId && identities.some((i) => i.id === d.identityId)) setIdentityId(d.identityId);
        setSubject(d.subject);
        setBody(d.body);
        setAlsoTo(!d.contactId && d.toEmails.length > 0 ? d.toEmails.slice(1) : d.toEmails);
        setCc(d.ccEmails);
        setBcc(d.bccEmails);
        setShowCc(d.ccEmails.length > 0);
        setShowBcc(d.bccEmails.length > 0);
        setImportance(d.importance);
        setKept(d.attachments);
        setLoading(false);
      })
      .catch(() => { if (live) { toast.error("That draft didn’t open. Try again."); onClose(); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.draftId]);

  // Saved a moment after the last change.
  const signature = `${contact?.id || contact?.email || ""}|${identityId}|${subject}|${body}|${files.length}|${kept.length}|${alsoTo.join(",")}|${cc.join(",")}|${bcc.join(",")}|${importance}`;
  useEffect(() => {
    if (!dirty.current || loading || sending || locked) return;
    const t = setTimeout(() => { void save(); }, 1500);
    return () => clearTimeout(t);
  }, [signature, loading, sending, locked, save]);

  // Search contacts as they type; the latest search wins.
  useEffect(() => {
    if (locked || loading || !toFocus) return;
    const mine = ++run.current;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchContactsAction(query);
        if (run.current === mine) setHits(found);
      } catch {
        if (run.current === mine) setHits([]);
      } finally {
        if (run.current === mine) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query, locked, loading, toFocus]);

  useEffect(() => {
    if (!mounted || loading) return;
    (contact ? bodyRef : toRef).current?.focus();
    // Only when the window first opens (or its draft has loaded).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, loading]);

  // The send menu closes on a click anywhere else.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  /** A contact chosen from the suggestions: the first one is who the conversation is with, the rest are added to To. */
  function pickContact(h: ContactHit) {
    const address = h.email.toLowerCase();
    setToProblem(null);
    if (!contact) {
      setContact(h);
      setAlsoTo((cur) => cur.filter((a) => a !== address));
    } else if (address !== contact.email.toLowerCase() && !alsoTo.includes(address)) {
      if (alsoTo.length + cc.length + bcc.length >= 10) { setToProblem("To, Cc and Bcc can hold ten people together."); return; }
      setAlsoTo((cur) => [...cur, address]);
    }
    setQuery("");
    setHits([]);
    edit();
    if (contact) setTimeout(() => toRef.current?.focus(), 0);
  }

  /** Typed addresses become chips. Any address will do: a contact is matched when there is one, otherwise it is used as typed. */
  async function commitTo(raw: string) {
    const typed = raw.trim();
    if (!typed) return;
    const parsed = parseAddressList(typed);
    if ("error" in parsed) {
      // Not an address: take the first suggestion instead.
      const first = hits.find((h) => h.status === "subscribed");
      if (first) return pickContact(first);
      return setToProblem(parsed.error);
    }
    let primary = contact;
    let list = alsoTo;
    for (const a of parsed.list) {
      if (!primary) {
        const hit = hits.find((h) => h.email.toLowerCase() === a) ?? (await searchContactsAction(a).catch(() => [] as ContactHit[])).find((h) => h.email.toLowerCase() === a);
        if (hit && hit.status !== "subscribed") return setToProblem("This contact isn’t subscribed, so a new email to them can’t be sent.");
        // Not one of the contacts: that is fine, the address is used as typed (an empty id means "not a contact").
        primary = hit ?? { id: "", email: a, name: "", status: "subscribed" };
      } else if (a !== primary.email.toLowerCase() && !list.includes(a)) {
        if (list.length + cc.length + bcc.length >= 10) return setToProblem("To, Cc and Bcc can hold ten people together.");
        list = [...list, a];
      }
    }
    if (primary !== contact) setContact(primary);
    setAlsoTo(list);
    setQuery("");
    setToProblem(null);
    edit();
  }

  async function close() {
    if (sending) return;
    if (!locked) {
      await save();
      if (latest.current.draftId && touched.current) { toast.success("Draft saved."); router.refresh(); }
    }
    onClose();
  }

  async function discard() {
    if (sending) return;
    setSending(true);
    try {
      await chain.current;
      const id = latest.current.draftId;
      if (id) {
        const res = await discardDraftAction(id);
        if (!res.ok) return void toast.error(res.error ?? "That didn’t work. Try again.");
        toast.success(res.message ?? "Draft discarded.");
        router.refresh();
      }
      dirty.current = false;
      onClose();
    } catch (e) {
      toast.fail("That didn’t work. Try again.", e);
    } finally {
      setSending(false);
    }
  }

  function form(): FormData {
    const s = latest.current;
    const fd = new FormData();
    if (s.draftId) fd.set("draftId", s.draftId);
    fd.set("contactId", s.contact?.id ?? "");
    fd.set("primary", s.contact && !s.contact.id ? s.contact.email : "");
    fd.set("identityId", s.identityId);
    fd.set("subject", s.subject);
    fd.set("body", s.body);
    fd.set("to", s.alsoTo.join(","));
    fd.set("cc", s.cc.join(","));
    fd.set("bcc", s.bcc.join(","));
    fd.set("importance", s.importance);
    fd.set("keep", JSON.stringify(s.kept.map((a) => a.id)));
    for (const f of s.files) fd.append("files", f);
    return fd;
  }

  async function send() {
    if (!canSend) return;
    setSending(true);
    setMenu(null);
    try {
      await chain.current; // a save that is still running tells us which draft this is
      const res = await startEmailAction(form());
      if (!res.ok) {
        toast.error(res.error ?? "That didn’t send. Try again.");
        // Refused by the email provider: it is in the thread as "Not sent", ready to send again.
        if (res.id) { dirty.current = false; onClose(); router.push(`/app/inbox?c=${res.id}&folder=sent`); router.refresh(); }
        return;
      }
      toast.success(res.message ?? "Email sent.");
      dirty.current = false;
      onClose();
      router.push(`/app/inbox?c=${res.id}&folder=sent`);
      router.refresh();
    } catch (e) {
      toast.fail("That didn’t send. Try again.", e);
    } finally {
      setSending(false);
    }
  }

  async function schedule(at: Date) {
    if (!canSend) return;
    setSending(true);
    setMenu(null);
    try {
      await chain.current;
      const fd = form();
      fd.set("scheduledAt", at.toISOString());
      const res = await scheduleEmailAction(fd);
      if (!res.ok) return void toast.error(res.error ?? "That didn’t schedule. Try again.");
      toast.success(`Email scheduled for ${when(at)}.`);
      dirty.current = false;
      onClose();
      router.refresh();
    } catch (e) {
      toast.fail("That didn’t schedule. Try again.", e);
    } finally {
      setSending(false);
    }
  }

  async function cancelSchedule() {
    if (!draftId || sending) return;
    setSending(true);
    try {
      const res = await unscheduleAction(draftId);
      if (!res.ok) return void toast.error(res.error ?? "That didn’t work. Try again.");
      setStatus("draft");
      setScheduledAt(null);
      toast.success(res.message ?? "Schedule cancelled.");
      router.refresh();
    } catch (e) {
      toast.fail("That didn’t work. Try again.", e);
    } finally {
      setSending(false);
    }
  }

  if (!mounted) return null;

  const row = "flex items-center gap-3 border-b border-mist px-4 py-2 text-sm";
  const label = "w-12 shrink-0 text-ink-muted";
  const frame = {
    normal: "inset-0 sm:inset-auto sm:bottom-0 sm:right-6 sm:h-[34rem] sm:max-h-[calc(100vh-1.5rem)] sm:w-[34rem] sm:rounded-t-2xl",
    min: "inset-x-0 bottom-0 sm:inset-x-auto sm:right-6 sm:w-80 rounded-t-2xl",
    max: "inset-0 sm:inset-x-[8%] sm:bottom-4 sm:top-14 sm:rounded-2xl",
  }[view];

  return createPortal(
    <div
      role="dialog"
      aria-label="New message"
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); if (menu) setMenu(null); else void close(); }
      }}
      className={cn("fixed z-40 flex flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-ink/10", frame)}
    >
      <div className="flex h-11 shrink-0 items-center gap-1 bg-mist-100 pl-4 pr-2">
        <button type="button" onClick={() => view === "min" && setView("normal")} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink" aria-label={view === "min" ? "Restore the message window" : undefined}>
          {subject.trim() || (status === "scheduled" ? "Scheduled email" : "New Message")}
        </button>
        <button type="button" onClick={() => setView(view === "min" ? "normal" : "min")} aria-label={view === "min" ? "Restore" : "Minimize"} title={view === "min" ? "Restore" : "Minimize"} className="rounded-full p-1.5 text-ink-soft hover:bg-mist hover:text-ink">
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setView(view === "max" ? "normal" : "max")} aria-label={view === "max" ? "Exit full screen" : "Full screen"} title={view === "max" ? "Exit full screen" : "Full screen"} className="hidden rounded-full p-1.5 text-ink-soft hover:bg-mist hover:text-ink sm:inline-flex">
          {view === "max" ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button type="button" onClick={() => void close()} disabled={sending} aria-label="Save and close" title="Save and close" className="rounded-full p-1.5 text-ink-soft hover:bg-mist hover:text-ink disabled:opacity-60">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col", view === "min" && "hidden")}>
        {noSender ? (
          <p className="px-4 py-5 text-sm text-ink-muted">
            To send email you need a work email (or an alias) on a verified domain. An organization owner can set one up for you under Team.
          </p>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-ink-muted"><Spinner className="h-6 w-6" /></div>
        ) : (
          <>
            {status === "scheduled" ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mist bg-brand-50 px-4 py-2 text-sm text-brand-800">
                <span className="inline-flex items-center gap-2 font-semibold"><Clock className="h-4 w-4" aria-hidden="true" />Scheduled for {scheduledAt ? when(new Date(scheduledAt)) : "later"}</span>
                <Button size="sm" variant="outline" onClick={cancelSchedule} loading={sending}>Cancel schedule</Button>
              </div>
            ) : null}
            {status === "sending" ? <p className="border-b border-mist bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-800">This email is being sent right now.</p> : null}
            {status === "failed" || (failure && status === "draft") ? <p className="border-b border-mist bg-danger-soft px-4 py-2 text-sm font-medium text-danger">Not sent: {failure ?? "it couldn’t be sent."} Check it, then send or schedule it again.</p> : null}

            <div className={row}>
              <label htmlFor={`${uid}-from`} className={label}>From</label>
              {identities.length === 1 ? (
                <span className="min-w-0 flex-1 truncate text-ink">{identities[0].fromName} &lt;{identities[0].email}&gt;</span>
              ) : (
                <select
                  id={`${uid}-from`}
                  value={identityId}
                  disabled={locked}
                  onChange={(e) => { setIdentityId(e.target.value); edit(); }}
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink focus:outline-none disabled:opacity-60"
                >
                  {identities.map((i) => <option key={i.id} value={i.id}>{i.fromName} &lt;{i.email}&gt;</option>)}
                </select>
              )}
            </div>

            <div className="relative">
              <div className={row}>
                <label htmlFor={`${uid}-to`} className={label}>To</label>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {contact ? (
                    <>
                      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-mist-100 py-0.5 pl-3 pr-1 text-sm text-ink">
                        <span className="truncate font-semibold">{contact.name || contact.email}</span>
                        {contact.name ? <span className="hidden truncate text-xs text-ink-muted sm:inline">{contact.email}</span> : null}
                        {locked ? null : (
                          <button type="button" aria-label="Remove recipient" onClick={() => { setContact(null); setQuery(""); edit(); }} className="rounded-full p-1 text-ink-muted hover:bg-mist hover:text-ink">
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                      {contact.status !== "subscribed" ? <StatusBadge status={contact.status} /> : null}
                    </>
                  ) : null}
                  {alsoTo.map((a) => (
                    <span key={a} className="inline-flex max-w-full items-center gap-1 rounded-full bg-mist-100 py-0.5 pl-2.5 pr-1 text-xs text-ink">
                      <span className="truncate">{a}</span>
                      {locked ? null : (
                        <button type="button" aria-label={`Remove ${a}`} onClick={() => { setAlsoTo((cur) => cur.filter((x) => x !== a)); edit(); }} className="rounded-full p-0.5 text-ink-muted hover:bg-mist hover:text-ink">
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  ))}
                  {locked ? null : (
                    <input
                      id={`${uid}-to`}
                      ref={toRef}
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); if (toProblem) setToProblem(null); }}
                      onFocus={() => setToFocus(true)}
                      onBlur={() => { setToFocus(false); if (query.trim()) void commitTo(query); }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === "," || e.key === ";") && query.trim()) { e.preventDefault(); void commitTo(query); }
                        else if (e.key === "Backspace" && !query && alsoTo.length > 0) { setAlsoTo((cur) => cur.slice(0, -1)); edit(); }
                      }}
                      placeholder={contact || alsoTo.length ? "Add another" : "Name or email"}
                      autoComplete="off"
                      className="min-w-[8rem] flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
                    />
                  )}
                </div>
                {locked ? null : (
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-xs font-semibold text-ink-muted">
                    {showCc ? null : <button type="button" onClick={() => setShowCc(true)} className="hover:text-ink">Cc</button>}
                    {showBcc ? null : <button type="button" onClick={() => setShowBcc(true)} className="hover:text-ink">Bcc</button>}
                  </span>
                )}
              </div>
              {toProblem ? <p role="alert" className="border-b border-mist px-4 py-1.5 text-xs font-medium text-danger">{toProblem}</p> : null}
              {toFocus && !locked ? (
                // Keeps the box focused while a suggestion is clicked.
                <ul onMouseDown={(e) => e.preventDefault()} className="absolute inset-x-3 top-full z-10 max-h-56 overflow-y-auto rounded-xl border border-mist bg-white shadow-lg" aria-label={query.trim() ? "Matching contacts" : "Recent recipients"} aria-busy={searching}>
                  {!query.trim() && hits.length > 0 ? <li className="px-4 pb-1 pt-2 text-xs font-semibold text-ink-muted">Recent</li> : null}
                  {hits.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-ink-muted">{searching ? "Searching…" : query.trim() ? "No contacts match. Press Enter to send to this address anyway." : "Type a name or email to find a contact."}</li>
                  ) : hits.map((h) => {
                    const ok = h.status === "subscribed";
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          disabled={!ok}
                          onClick={() => pickContact(h)}
                          className={cn("flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left", ok ? "hover:bg-mist-50" : "cursor-not-allowed opacity-60")}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink">{h.name || h.email}</span>
                            {h.name ? <span className="block truncate text-xs text-ink-muted">{h.email}</span> : null}
                          </span>
                          {ok ? null : <StatusBadge status={h.status} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            {showCc || cc.length > 0 ? (
              <RecipientField id={`${uid}-cc`} label="Cc" list={cc} onChange={(next) => { setCc(next); edit(); }} max={10 - alsoTo.length - bcc.length} disabled={locked} className={row} />
            ) : null}
            {showBcc || bcc.length > 0 ? (
              <RecipientField id={`${uid}-bcc`} label="Bcc" list={bcc} onChange={(next) => { setBcc(next); edit(); }} max={10 - alsoTo.length - cc.length} disabled={locked} className={row} />
            ) : null}
            {contact && contact.status !== "subscribed" ? <p className="border-b border-mist px-4 py-2 text-xs font-medium text-danger">This contact isn’t subscribed, so a new email to them can’t be sent.</p> : null}

            <div className={row}>
              <label htmlFor={`${uid}-subject`} className="sr-only">Subject</label>
              <input
                id={`${uid}-subject`}
                value={subject}
                readOnly={locked}
                onChange={(e) => { setSubject(e.target.value); edit(); }}
                maxLength={200}
                placeholder="Subject"
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
              />
            </div>

            <label htmlFor={`${uid}-body`} className="sr-only">Message</label>
            <textarea
              id={`${uid}-body`}
              ref={bodyRef}
              value={body}
              readOnly={locked}
              onChange={(e) => { setBody(e.target.value); edit(); }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void send(); }
              }}
              maxLength={20000}
              className="min-h-[9rem] flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-ink focus:outline-none"
            />

            {files.length + kept.length > 0 ? (
              <div className="px-4 pb-2">
                <FileChips
                  files={files}
                  kept={kept}
                  disabled={locked || sending}
                  onRemoveFile={(i) => { setFiles((cur) => cur.filter((_, j) => j !== i)); edit(); }}
                  onRemoveKept={(id) => { setKept((cur) => cur.filter((a) => a.id !== id)); edit(); }}
                />
              </div>
            ) : null}

            <p className="px-4 pb-2 text-xs text-ink-muted">Plain text. A short unsubscribe footer is added to the first email you send someone.</p>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-mist px-3 py-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <AttachIconButton files={files} kept={kept} onChange={(next) => { setFiles(next); edit(); }} disabled={locked || sending} />
                <SavedReplies
                  replies={savedReplies}
                  vars={{ firstName: contact?.name?.split(/\s+/)[0] ?? "", name: contact?.name ?? "", myName }}
                  onInsert={(t) => { setBody((cur) => (cur.trim() ? `${cur.replace(/\s+$/, "")}\n\n${t}` : t)); edit(); }}
                  disabled={locked || sending}
                />
                <ImportanceSelect value={importance} onChange={(v) => { setImportance(v); edit(); }} disabled={locked || sending} />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-xs text-ink-muted sm:inline" aria-live="polite">{saved === "saving" ? "Saving…" : saved === "saved" ? "Draft saved" : ""}</span>
                <button type="button" onClick={() => void discard()} disabled={sending} title="Discard draft" aria-label="Discard draft" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-mist-100 hover:text-danger disabled:pointer-events-none disabled:opacity-60">
                  <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
                <div ref={menuRef} className="relative inline-flex">
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!canSend}
                    className="inline-flex h-9 items-center gap-2 rounded-l-full bg-brand-700 pl-5 pr-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? <Spinner className="h-4 w-4" /> : null}
                    {status === "scheduled" ? "Send now" : "Send"}
                  </button>
                  <span className="w-px bg-white/30" aria-hidden="true" />
                  <button
                    type="button"
                    aria-label="More send options"
                    aria-haspopup="menu"
                    aria-expanded={menu !== null}
                    onClick={() => setMenu(menu ? null : "send")}
                    disabled={!canSend}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-r-full bg-brand-700 text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {menu ? <ScheduleMenu mode={menu} onMode={setMenu} onPick={(d) => void schedule(d)} onClose={() => setMenu(null)} /> : null}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}