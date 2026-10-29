"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { AddContactsDrawer } from "@/components/dashboard/add-contacts-drawer";
import { BlockEditor, useVariableInsert } from "@/components/dashboard/block-editor";
import { EmailPreviewCard } from "@/components/dashboard/email-preview";
import { PersonalizeCard, SAMPLE_ID } from "@/components/dashboard/personalize-card";
import type { AddContactsResult } from "@/app/(dashboard)/app/contacts/actions";
import type { AutosaveResult, PreviewContact } from "@/app/(dashboard)/app/campaigns/actions";
import type { SaveTemplateResult } from "@/app/(dashboard)/app/templates/actions";
import type { AudienceOption } from "@/lib/queries";
import { type Block } from "@/lib/email/blocks";
import { buildPreviewDoc, previewSubject, SAMPLE_VARS } from "@/lib/email/preview";

type Action = (formData: FormData) => Promise<void>;
type Props = {
  campaign: { id: string; name: string; subject: string; preview_text: string; from_name: string; from_email: string; list_id: string | null; blocks: Block[] };
  domains: { id: string; domain: string; status: string }[];
  lists: AudienceOption[];
  /** Everyone subscribed in the workspace: the size of "All subscribed contacts". */
  totalSubscribed: number;
  workspace: { name: string; business_address: string | null };
  actions: {
    autosave: (formData: FormData) => Promise<AutosaveResult>;
    test: Action; submit: Action; remove: Action;
    saveTemplate: (input: { name: string; subject: string; previewText: string; blocks: unknown }) => Promise<SaveTemplateResult>;
    previewContacts: (listId: string) => Promise<PreviewContact[]>;
    audienceOptions: () => Promise<{ lists: AudienceOption[]; totalSubscribed: number }>;
  };
};

const AUTOSAVE_DELAY_MS = 2500; // pause after the last edit before saving
const RETRY_DELAY_MS = 6000; // wait before retrying a failed save
const NOT_SAVED_KEYS = new Set(["mode", "scheduledAtIso"]); // send options, not part of the draft

export function CampaignEditor({ campaign, domains, lists: initialLists, totalSubscribed: initialTotal, workspace, actions }: Props) {
  const confirm = useConfirm();
  const [blocks, setBlocks] = useState<Block[]>(campaign.blocks);
  const [lists, setLists] = useState(initialLists);
  const [totalSubscribed, setTotalSubscribed] = useState(initialTotal);
  const [listId, setListId] = useState(campaign.list_id ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const [subject, setSubject] = useState(campaign.subject);
  const [previewText, setPreviewText] = useState(campaign.preview_text);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [iso, setIso] = useState("");

  // Who will receive this campaign, and how many people that is (subscribed contacts only).
  const selectedList = lists.find((l) => l.id === listId) ?? null;
  const audienceName = selectedList ? selectedList.name : "All subscribed contacts";
  const audienceLabel = selectedList ? `“${selectedList.name}”` : "all subscribed contacts";
  const audienceCount = selectedList ? selectedList.subscribed : totalSubscribed;
  const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

  // People added from the drawer land in a list: refresh the sizes and make that list this campaign's audience.
  const onContactsAdded = async (res: AddContactsResult) => {
    if (!res.list) return;
    const added = res.list;
    try {
      const fresh = await actions.audienceOptions();
      setLists(fresh.lists);
      setTotalSubscribed(fresh.totalSubscribed);
    } catch {
      setLists((ls) => (ls.some((l) => l.id === added.id) ? ls : [...ls, { id: added.id, name: added.name, subscribed: added.count }]));
    }
    setListId(added.id);
  };

  // ── Personalisation ─────────────────────────────────────────────────────
  // Real people from the chosen audience, so the preview can be filled in as any of them.
  const { onFocusCapture, insert } = useVariableInsert();
  const [contacts, setContacts] = useState<PreviewContact[] | undefined>(undefined);
  const [previewAs, setPreviewAs] = useState(SAMPLE_ID);
  const { previewContacts } = actions;
  useEffect(() => {
    let cancelled = false;
    previewContacts(listId)
      .then((rows) => {
        if (cancelled) return;
        setContacts(rows);
        setPreviewAs((cur) => (rows.some((r) => r.id === cur) ? cur : SAMPLE_ID));
      })
      .catch(() => { if (!cancelled) setContacts((c) => c ?? []); });
    return () => { cancelled = true; };
  }, [listId, audienceCount, previewContacts]);
  const chosen = contacts?.find((c) => c.id === previewAs) ?? null;
  const vars = useMemo(() => (chosen ? { first_name: chosen.first_name, last_name: chosen.last_name, email: chosen.email } : SAMPLE_VARS), [chosen]);

  const formRef = useRef<HTMLFormElement | null>(null);

  // ── Save as template ────────────────────────────────────────────────────
  const [tplName, setTplName] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);
  const saveAsTemplate = async () => {
    if (savingTpl) return;
    const campaignName = (formRef.current?.elements.namedItem("name") as HTMLInputElement | null)?.value ?? "";
    setSavingTpl(true);
    try {
      const res = await actions.saveTemplate({ name: tplName.trim() || campaignName.trim(), subject, previewText, blocks });
      if (res.ok) { toast.success(`Saved “${res.name}” to your templates.`); setTplName(""); } else toast.error(res.error);
    } catch {
      toast.error("Couldn’t save the template. Check your connection and try again.");
    } finally {
      setSavingTpl(false);
    }
  };

  // ── Autosave ────────────────────────────────────────────────────────────
  // Edits are saved a couple of seconds after you stop typing. Only one save runs at a time; edits
  // made while one is running are picked up by the next. Nothing is sent if nothing changed.
  const [tick, setTick] = useState(0); // bumped by any form input, so the effect below re-checks
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
      // Anything typed while this save was running still needs saving.
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
  }, [blocks, previewText, listId, tick, scheduleSave, snapshot]);

  // Save straight away when the tab is hidden, and warn before leaving with unsaved edits.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") void save(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (stopped.current) return;
      const snap = snapshot();
      if (inFlight.current || (snap && snap.key !== lastSaved.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [save, snapshot]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const [local, domain] = campaign.from_email.split("@");

  const srcDoc = useMemo(
    () => buildPreviewDoc(blocks, { preview: previewText, workspaceName: workspace.name, businessAddress: workspace.business_address, vars }),
    [blocks, previewText, workspace, vars],
  );
  const previewName = chosen ? [chosen.first_name, chosen.last_name].filter(Boolean).join(" ") || chosen.email : "";

  return (
    <>
    <form
      ref={formRef}
      onInput={() => setTick((t) => t + 1)}
      onChange={() => setTick((t) => t + 1)}
      onFocusCapture={onFocusCapture}
      // Enter in a text field must not submit the form: the first submit button is "Send test to me".
      onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }}
      className="grid gap-6 xl:grid-cols-[1.1fr_1fr]"
    >
      <input type="hidden" name="id" value={campaign.id} />
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
      <input type="hidden" name="scheduledAtIso" value={iso} />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Details" />
          <div className="space-y-5 p-6">
            <Field label="Campaign name" htmlFor="name" hint="Only you see this."><Input id="name" name="name" defaultValue={campaign.name} /></Field>
            <Field label="Subject line" htmlFor="subject" hint="You can use {{first_name|there}}."><Input id="subject" name="subject" data-var="true" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
            <Field label="Preview text" htmlFor="previewText" hint="The short line shown beside the subject in many inboxes.">
              <Input id="previewText" name="previewText" data-var="true" value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
            </Field>
            <Field label="From name" htmlFor="fromName"><Input id="fromName" name="fromName" defaultValue={campaign.from_name} /></Field>
            <div>
              <label htmlFor="fromLocal" className="mb-1.5 block text-sm font-semibold text-ink">From address</label>
              <div className="flex items-center gap-2">
                <Input id="fromLocal" name="fromLocal" defaultValue={local ?? ""} placeholder="hello" className="max-w-[150px]" />
                <span className="text-ink-muted">@</span>
                <Select name="fromDomain" defaultValue={domain ?? domains[0]?.domain ?? ""} aria-label="From domain">
                  {domains.length === 0 ? <option value="">Add a domain first</option> : null}
                  {domains.map((d) => <option key={d.id} value={d.domain}>{d.domain}{d.status !== "verified" ? " (not verified)" : ""}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Field label="Audience" htmlFor="listId" hint="Choose who gets this campaign, or add people who aren’t on a list yet.">
                <Select id="listId" name="listId" value={listId} onChange={(e) => setListId(e.target.value)}>
                  <option value="">All subscribed contacts ({totalSubscribed.toLocaleString("en-US")})</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.subscribed.toLocaleString("en-US")})</option>)}
                </Select>
              </Field>
              <div
                role="status"
                aria-live="polite"
                className={cn("mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm text-ink", audienceCount === 0 ? "border-warning/30 bg-warning-soft" : "border-brand-200 bg-brand-50")}
              >
                <Users className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                <span>
                  Sending to <strong className="font-bold">{audienceName}</strong>
                  {" · "}
                  {audienceCount === 0 ? "no subscribed contacts yet. Add people below." : people(audienceCount)}
                </span>
                {selectedList ? (
                  <button type="button" onClick={() => setListId("")} className="ml-auto text-xs font-semibold text-brand-800 underline underline-offset-2 hover:text-brand-900">
                    Use all contacts
                  </button>
                ) : null}
              </div>
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setAddOpen(true)} aria-haspopup="dialog">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Add new contacts
              </Button>
            </div>
          </div>
        </Card>

        <PersonalizeCard onInsert={insert} contacts={contacts ?? []} selectedId={previewAs} onSelect={setPreviewAs} onContactSaved={(c) => setContacts((cs) => cs?.map((x) => (x.id === c.id ? c : x)))} />

        <BlockEditor blocks={blocks} setBlocks={setBlocks} />

        <Card>
          <CardHeader title="Save as template" description="Keep this layout so you can start future campaigns from it." />
          <div className="flex flex-wrap items-end gap-3 p-6">
            <div className="min-w-[220px] flex-1">
              <Field label="Template name" htmlFor="tpl-name">
                <Input id="tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Defaults to the campaign name" maxLength={120} />
              </Field>
            </div>
            <Button type="button" variant="secondary" onClick={saveAsTemplate} disabled={savingTpl}>
              <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
              {savingTpl ? "Saving…" : "Save as template"}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Send" description="The unsubscribe link and your business address are added to the footer automatically." />
          <div className="space-y-5 p-6">
            <p className="flex items-center gap-2 rounded-xl bg-mist-50 px-4 py-3 text-sm text-ink">
              <Users className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
              <span>Audience: <strong className="font-bold">{audienceName}</strong> · {people(audienceCount)}</span>
            </p>
            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="mode" value="now" checked={mode === "now"} onChange={() => setMode("now")} className="accent-brand-700" />Send now</label>
              <label className="flex items-center gap-2"><input type="radio" name="mode" value="later" checked={mode === "later"} onChange={() => setMode("later")} className="accent-brand-700" />Schedule</label>
            </div>
            {mode === "later" ? (
              <Field label="Send at (your local time)" htmlFor="when">
                <Input id="when" type="datetime-local" onChange={(e) => setIso(e.target.value ? new Date(e.target.value).toISOString() : "")} className="max-w-xs" />
              </Field>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" formAction={actions.test} variant="secondary">Send test to me</Button>
              <Button
                type="submit"
                formAction={actions.submit}
                onClick={async (e) => {
                  // Ask first; submit with this button (so its formAction is used) only after a yes.
                  const button = e.currentTarget;
                  const form = button.form;
                  e.preventDefault();
                  const ok = await confirm({
                    title: mode === "now" ? "Send this campaign now?" : "Schedule this campaign?",
                    description: mode === "now" ? `It goes to ${people(audienceCount)} (${audienceLabel}) straight away. Emails can’t be recalled once sent.` : `It will be sent to ${people(audienceCount)} (${audienceLabel}) at the time you chose.`,
                    confirmLabel: mode === "now" ? "Send campaign" : "Schedule campaign",
                  });
                  if (ok) form?.requestSubmit(button);
                }}
              >
                {mode === "now" ? "Send campaign" : "Schedule campaign"}
              </Button>
              <Button
                type="submit"
                formAction={actions.remove}
                variant="ghost"
                onClick={async (e) => {
                  const button = e.currentTarget;
                  const form = button.form;
                  e.preventDefault();
                  const ok = await confirm({
                    title: "Delete this draft?",
                    description: "The draft and everything you’ve written in it are removed. This can’t be undone.",
                    confirmLabel: "Delete draft",
                    tone: "danger",
                  });
                  if (ok) form?.requestSubmit(button);
                }}
              >
                Delete draft
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <EmailPreviewCard doc={srcDoc} subject={previewSubject(subject, vars)} description={chosen ? `Shown as ${previewName}.` : "Shown with a sample person: Ada Lovelace."} />
      </div>
    </form>

    {/* Sibling of the form, not a child: portal events bubble through the React tree. */}
    <AddContactsDrawer
      open={addOpen}
      onOpenChange={setAddOpen}
      lists={lists}
      newListName={`${campaign.name} audience`}
      defaultListId={listId}
      title="Add contacts to this campaign"
      onAdded={onContactsAdded}
    />
    </>
  );
}