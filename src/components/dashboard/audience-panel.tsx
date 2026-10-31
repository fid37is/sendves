"use client";

import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ClipboardPaste, FileUp, ListChecks, Search, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { AudienceOption } from "@/lib/queries";
import type { FoundContact } from "@/app/(dashboard)/app/campaigns/audience-actions";
import type { IngestResult } from "@/server/audience";

export type PickedContact = { id: string; email: string; name: string };
export type AudienceState = { mode: "all" | "custom"; listIds: string[]; contacts: PickedContact[] };

export type AudienceActions = {
  search: (query: string) => Promise<{ ok: true; contacts: FoundContact[] } | { ok: false; error: string }>;
  paste: (input: { text: string; consent: boolean }) => Promise<IngestResult>;
  importFile: (formData: FormData) => Promise<IngestResult>;
};

const MAX_PICKED = 5000;
const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

type Method = "lists" | "people" | "import" | "paste";

/** Adds people to the selection without duplicating anyone already in it. Returns how many were new. */
function mergeContacts(setAudience: Dispatch<SetStateAction<AudienceState>>, current: PickedContact[], incoming: PickedContact[]) {
  const have = new Set(current.map((c) => c.id));
  const add = incoming.filter((c) => !have.has(c.id) && have.add(c.id)).slice(0, Math.max(0, MAX_PICKED - current.length));
  setAudience((a) => {
    const now = new Set(a.contacts.map((c) => c.id));
    return { ...a, mode: "custom", contacts: [...a.contacts, ...add.filter((c) => !now.has(c.id))] };
  });
  return add.length;
}

/** What happened to each address, so nothing is dropped silently. */
function Feedback({ result }: { result: IngestResult }) {
  return (
    <div role="status" aria-live="polite" className={cn("mt-4 rounded-2xl border p-4 text-sm", result.ok ? "border-brand-200 bg-brand-50" : "border-danger/30 bg-danger-soft")}>
      <p className={cn("font-semibold", result.ok ? "text-ink" : "text-danger")}>{result.ok ? result.message : result.error}</p>
      {result.ok && result.roleAddresses > 0 ? <p className="mt-1 text-xs text-ink-muted">{result.roleAddresses} role addresses like info@ were included; they often perform poorly.</p> : null}
      {!result.ok && result.message && result.message !== result.error ? <p className="mt-1 text-xs text-ink-muted">{result.message}</p> : null}
      {result.skipped.length > 0 || result.invalid > 0 || result.duplicates > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-xs font-semibold text-brand-800">See what was skipped</summary>
          <ul className="mt-2 space-y-1 text-xs text-ink-soft">
            {result.invalid > 0 ? <li>{result.invalid.toLocaleString("en-US")} not valid email addresses (or disposable addresses).</li> : null}
            {result.duplicates > 0 ? <li>{result.duplicates.toLocaleString("en-US")} duplicates in what you provided, counted once.</li> : null}
            {result.skipped.map((s) => <li key={s.email}><span className="font-semibold text-ink">{s.email}</span>: {s.reason}</li>)}
            {result.skippedCount > result.skipped.length ? <li>…and {(result.skippedCount - result.skipped.length).toLocaleString("en-US")} more.</li> : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function AudiencePicker({
  audience, setAudience, lists, totalSubscribed, canImport, canCreateContacts, actions,
}: {
  audience: AudienceState;
  setAudience: Dispatch<SetStateAction<AudienceState>>;
  lists: AudienceOption[];
  totalSubscribed: number;
  /** May use the People/Import/Paste tabs (needs permission to see contacts and edit campaigns). */
  canImport: boolean;
  /** May create contacts that don't exist yet. Without it, only people already in Contacts are matched. */
  canCreateContacts: boolean;
  actions: AudienceActions;
}) {
  const uid = useId();
  const [method, setMethod] = useState<Method>("lists");
  const custom = audience.mode === "custom";

  const toggleList = (id: string) =>
    setAudience((a) => ({ ...a, mode: "custom", listIds: a.listIds.includes(id) ? a.listIds.filter((x) => x !== id) : [...a.listIds, id] }));

  // ── People search ───────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundContact[] | null>(null);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (method !== "people" || !canImport) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await actions.search(query);
        if (mine !== seq.current) return;
        if (res.ok) setFound(res.contacts); else toast.error(res.error);
      } catch {
        if (mine === seq.current) toast.error("Search failed.");
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, method, canImport, actions]);
  const picked = new Set(audience.contacts.map((c) => c.id));

  // ── Paste and import ────────────────────────────────────────────────
  const [pasted, setPasted] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (res: IngestResult) => {
    setResult(res);
    if (res.contacts.length > 0) {
      const fresh = mergeContacts(setAudience, audience.contacts, res.contacts);
      const already = res.contacts.length - fresh;
      toast.success(already > 0 ? `${people(fresh)} added to the audience; ${already} were already selected.` : `${people(fresh)} added to the audience.`);
    } else if (!res.ok) toast.error(res.error ?? "Nothing was added.");
  };

  const runPaste = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await actions.paste({ text: pasted, consent });
      apply(res);
      if (res.contacts.length > 0) setPasted("");
    } catch {
      toast.error("Couldn’t add addresses.");
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Choose a CSV or text file first.");
    if (busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (consent) fd.set("consent", "on");
      const res = await actions.importFile(fd);
      apply(res);
      if (res.contacts.length > 0 && fileRef.current) fileRef.current.value = "";
    } catch {
      toast.error("Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: Method, label: string, Icon: typeof Users, disabled = false) => (
    <button
      key={m}
      type="button"
      role="tab"
      aria-selected={method === m}
      aria-controls={`${uid}-${m}`}
      disabled={disabled}
      onClick={() => { setMethod(m); setResult(null); }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        method === m ? "bg-brand-700 text-white" : "bg-mist-100 text-ink-soft hover:bg-mist-200",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />{label}
    </button>
  );

  const consentBox = canCreateContacts ? (
    <label className="mt-3 flex items-start gap-3 text-sm text-ink-soft">
      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-brand-700" />
      <span>Anyone who isn’t in my contacts yet agreed to receive my emails.</span>
    </label>
  ) : (
    <p className="mt-3 text-xs text-ink-muted">You can add people who are already in your contacts. Adding new contacts needs the “contacts” permission.</p>
  );

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Who should get this campaign?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["all", `Everyone subscribed`, `${people(totalSubscribed)}`],
            ["custom", "Specific lists and people", "Mix lists, individual contacts, pasted addresses or a file"],
          ] as const).map(([value, title, note]) => (
            <label key={value} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors", audience.mode === value ? "border-brand-500 bg-brand-50" : "border-mist hover:border-ink/30")}>
              <input type="radio" name={`${uid}-mode`} checked={audience.mode === value} onChange={() => setAudience((a) => ({ ...a, mode: value }))} className="mt-1 h-4 w-4 accent-brand-700" />
              <span><span className="block text-sm font-bold text-ink">{title}</span><span className="block text-xs text-ink-muted">{note}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      {custom ? (
        <div className="rounded-2xl border border-mist">
          <div role="tablist" aria-label="Ways to choose recipients" className="flex flex-wrap gap-2 border-b border-mist p-3">
            {tab("lists", "Lists", ListChecks)}
            {tab("people", "Pick people", Search, !canImport)}
            {tab("import", "Import file", FileUp, !canImport)}
            {tab("paste", "Paste emails", ClipboardPaste, !canImport)}
          </div>

          <div className="p-4" role="tabpanel" id={`${uid}-${method}`}>
            {method === "lists" ? (
              lists.length === 0 ? <p className="text-sm text-ink-muted">You have no lists you can use yet. Create one on the Contacts page, or pick people or paste emails instead.</p> : (
                <ul className="divide-y divide-mist rounded-xl border border-mist">
                  {lists.map((l) => (
                    <li key={l.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-mist-50">
                        <input type="checkbox" checked={audience.listIds.includes(l.id)} onChange={() => toggleList(l.id)} className="h-4 w-4 accent-brand-700" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{l.name}</span>
                        <span className="text-xs text-ink-muted">{people(l.subscribed)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {method === "people" ? (
              <div>
                <label htmlFor={`${uid}-q`} className="sr-only">Search contacts</label>
                <Input id={`${uid}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" autoComplete="off" />
                <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-mist" aria-busy={searching}>
                  {found === null ? <p className="p-4 text-sm text-ink-muted">Loading…</p> : found.length === 0 ? <p className="p-4 text-sm text-ink-muted">No contacts match.</p> : (
                    <ul className="divide-y divide-mist">
                      {found.map((c) => {
                        const isPicked = picked.has(c.id);
                        return (
                          <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-ink">{c.name || c.email}</p>
                              {c.name ? <p className="truncate text-xs text-ink-muted">{c.email}</p> : null}
                            </div>
                            {!c.subscribed ? <span className="text-xs text-ink-muted">Not subscribed</span> : isPicked ? (
                              <Button type="button" size="sm" variant="ghost" onClick={() => setAudience((a) => ({ ...a, contacts: a.contacts.filter((x) => x.id !== c.id) }))}>Remove</Button>
                            ) : (
                              <Button type="button" size="sm" variant="secondary" onClick={() => mergeContacts(setAudience, audience.contacts, [{ id: c.id, email: c.email, name: c.name }])}><UserPlus className="h-4 w-4" aria-hidden="true" />Add</Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}

            {method === "import" ? (
              <div>
                <label htmlFor={`${uid}-file`} className="mb-1.5 block text-sm font-semibold text-ink">CSV or text file</label>
                <Input ref={fileRef} id={`${uid}-file`} type="file" accept=".csv,.txt,text/csv,text/plain" className="py-2.5" />
                <p className="mt-1.5 text-xs text-ink-muted">CSV with an email column (first_name and last_name optional; other columns become variables), or a .txt file with one address per line. Up to 5 MB.</p>
                {consentBox}
                <Button type="button" className="mt-4" onClick={runImport} disabled={busy || (canCreateContacts && !consent)}><FileUp className="h-4 w-4" aria-hidden="true" />{busy ? "Importing…" : "Import and add"}</Button>
              </div>
            ) : null}

            {method === "paste" ? (
              <div>
                <label htmlFor={`${uid}-paste`} className="mb-1.5 block text-sm font-semibold text-ink">Email addresses</label>
                <Textarea id={`${uid}-paste`} value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} placeholder={"ada@example.com\nGrace Hopper <grace@example.com>"} />
                <p className="mt-1.5 text-xs text-ink-muted">One per line, or separated by commas. A name next to an address is kept.</p>
                {consentBox}
                <Button type="button" className="mt-4" onClick={runPaste} disabled={busy || !pasted.trim() || (canCreateContacts && !consent)}><ClipboardPaste className="h-4 w-4" aria-hidden="true" />{busy ? "Adding…" : "Add to audience"}</Button>
              </div>
            ) : null}

            {result && (method === "import" || method === "paste") ? <Feedback result={result} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The chosen audience and how many people it reaches. Overlaps are counted once. */
export function AudienceSummary({
  audience, setAudience, lists, totalSubscribed, size, sizing,
}: {
  audience: AudienceState;
  setAudience: Dispatch<SetStateAction<AudienceState>>;
  lists: AudienceOption[];
  totalSubscribed: number;
  /** People reached, from the server; null while it's being counted. */
  size: number | null;
  sizing: boolean;
}) {
  const custom = audience.mode === "custom";
  const chosenLists = lists.filter((l) => audience.listIds.includes(l.id));
  const rawTotal = custom ? chosenLists.reduce((n, l) => n + l.subscribed, 0) + audience.contacts.length : totalSubscribed;
  const overlap = size !== null && custom ? Math.max(0, rawTotal - size) : 0;
  const shown = audience.contacts.slice(0, 50);

  return (
    <Card>
      <CardHeader title="Selected audience" description={custom ? "Lists and people you chose. Each person is counted once." : "Everyone currently subscribed."} />
      <div className="p-6">
        <div role="status" aria-live="polite" className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3", size === 0 ? "border-warning/30 bg-warning-soft" : "border-brand-200 bg-brand-50")}>
          <Users className="h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
          <div>
            <p className="text-2xl font-extrabold leading-none text-ink">{size === null ? "…" : size.toLocaleString("en-US")}</p>
            <p className="mt-1 text-xs text-ink-soft">{sizing ? "Counting…" : size === 0 ? "No subscribed people yet" : size === 1 ? "person will receive it" : "people will receive it"}</p>
          </div>
        </div>
        {overlap > 0 ? <p className="mt-2 text-xs text-ink-muted">{overlap.toLocaleString("en-US")} {overlap === 1 ? "selection overlaps" : "selections overlap"} with another, so those people get one email.</p> : null}

        {custom ? (
          <div className="mt-5 space-y-4">
            {chosenLists.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Lists ({chosenLists.length})</p>
                <ul className="flex flex-wrap gap-2">
                  {chosenLists.map((l) => (
                    <li key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-mist-100 py-1 pl-3 pr-1.5 text-xs font-semibold text-ink">
                      {l.name}<span className="font-normal text-ink-muted">· {l.subscribed.toLocaleString("en-US")}</span>
                      <button type="button" aria-label={`Remove list ${l.name}`} onClick={() => setAudience((a) => ({ ...a, listIds: a.listIds.filter((x) => x !== l.id) }))} className="rounded-full p-0.5 hover:bg-mist-200"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {audience.contacts.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">People ({audience.contacts.length.toLocaleString("en-US")})</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-mist p-2">
                  {shown.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-mist-50">
                      <span className="min-w-0 flex-1 truncate text-ink">{c.name ? `${c.name} · ` : ""}<span className="text-ink-muted">{c.email}</span></span>
                      <button type="button" aria-label={`Remove ${c.email}`} onClick={() => setAudience((a) => ({ ...a, contacts: a.contacts.filter((x) => x.id !== c.id) }))} className="rounded-full p-1 hover:bg-mist-200"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                  {audience.contacts.length > shown.length ? <li className="px-2 py-1 text-xs text-ink-muted">…and {(audience.contacts.length - shown.length).toLocaleString("en-US")} more</li> : null}
                </ul>
              </div>
            ) : null}
            {chosenLists.length === 0 && audience.contacts.length === 0 ? <p className="text-sm text-ink-muted">Nothing selected yet.</p> : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAudience((a) => ({ ...a, listIds: [], contacts: [] }))}>Clear selection</Button>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
