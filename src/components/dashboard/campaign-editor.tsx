"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { AddContactsDrawer } from "@/components/dashboard/add-contacts-drawer";
import type { AddContactsResult } from "@/app/(dashboard)/app/contacts/actions";
import type { AutosaveResult } from "@/app/(dashboard)/app/campaigns/actions";
import { personalize, renderBlocks, type Block } from "@/lib/email/blocks";
import { emailTheme } from "@/config/brand";

type Action = (formData: FormData) => Promise<void>;
type Props = {
  campaign: { id: string; name: string; subject: string; preview_text: string; from_name: string; from_email: string; list_id: string | null; blocks: Block[] };
  domains: { id: string; domain: string; status: string }[];
  lists: { id: string; name: string }[];
  workspace: { name: string; business_address: string | null };
  actions: { autosave: (formData: FormData) => Promise<AutosaveResult>; test: Action; submit: Action; remove: Action };
};

const AUTOSAVE_DELAY_MS = 2500; // pause after the last edit before saving
const RETRY_DELAY_MS = 6000; // wait before retrying a failed save
const NOT_SAVED_KEYS = new Set(["mode", "scheduledAtIso"]); // send options, not part of the draft

const uid = () => Math.random().toString(36).slice(2, 10);
const LABELS: Record<Block["type"], string> = { heading: "Heading", text: "Text", image: "Image", button: "Button", divider: "Divider", spacer: "Spacer", html: "HTML" };

function blank(type: Exclude<Block["type"], "html">): Block {
  switch (type) {
    case "heading": return { id: uid(), type, text: "Your headline" };
    case "text": return { id: uid(), type, text: "Hi {{first_name|there}},\n\nWrite your message here." };
    case "image": return { id: uid(), type, url: "https://", alt: "" };
    case "button": return { id: uid(), type, label: "Learn more", url: "https://" };
    case "divider": return { id: uid(), type };
    case "spacer": return { id: uid(), type, height: 24 };
  }
}

export function CampaignEditor({ campaign, domains, lists: initialLists, workspace, actions }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(campaign.blocks);
  const [lists, setLists] = useState(initialLists);
  const [listId, setListId] = useState(campaign.list_id ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const [audienceNote, setAudienceNote] = useState("");


  // People added from the drawer land in a list; make that list this campaign's audience.
  const onContactsAdded = (res: AddContactsResult) => {
    if (!res.list) return;
    const added = res.list;
    setLists((ls) => (ls.some((l) => l.id === added.id) ? ls : [...ls, { id: added.id, name: added.name }]));
    setListId(added.id);
    setAudienceNote(`Sending to “${added.name}”, which now has ${added.count} ${added.count === 1 ? "person" : "people"}.`);
  };
  const [previewText, setPreviewText] = useState(campaign.preview_text);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [iso, setIso] = useState("");

  // ── Autosave ────────────────────────────────────────────────────────────
  // Edits are saved a couple of seconds after you stop typing. Only one save runs at a time; edits
  // made while one is running are picked up by the next. Nothing is sent if nothing changed.
  const formRef = useRef<HTMLFormElement | null>(null);
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
  const patch = (id: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)));
  const move = (i: number, d: -1 | 1) =>
    setBlocks((bs) => { const n = [...bs]; const j = i + d; if (j < 0 || j >= n.length) return bs; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const srcDoc = useMemo(() => {
    const footer = `<p style="margin:16px 0 0;font-size:12px;color:${emailTheme.muted};text-align:center;">You are receiving this email because you subscribed to ${workspace.name.replace(/</g, "")}.<br><u>Unsubscribe</u><br>${(workspace.business_address ?? "Your business address").replace(/</g, "")}</p>`;
    return personalize(renderBlocks(blocks, { preview: previewText }), { first_name: "Ada" }).replace("<!--FOOTER-->", footer);
  }, [blocks, previewText, workspace]);

  return (
    <>
    <form ref={formRef} onInput={() => setTick((t) => t + 1)} onChange={() => setTick((t) => t + 1)} className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
      <input type="hidden" name="id" value={campaign.id} />
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
      <input type="hidden" name="scheduledAtIso" value={iso} />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Details" />
          <div className="space-y-5 p-6">
            <Field label="Campaign name" htmlFor="name" hint="Only you see this."><Input id="name" name="name" defaultValue={campaign.name} /></Field>
            <Field label="Subject line" htmlFor="subject" hint="You can use {{first_name|there}}."><Input id="subject" name="subject" defaultValue={campaign.subject} /></Field>
            <Field label="Preview text" htmlFor="previewText" hint="The short line shown beside the subject in many inboxes.">
              <Input id="previewText" name="previewText" value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
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
              <Field label="Audience" htmlFor="listId" hint={audienceNote ? undefined : "Choose who gets this campaign, or add people who aren’t on a list yet."}>
                <Select id="listId" name="listId" value={listId} onChange={(e) => { setListId(e.target.value); setAudienceNote(""); }}>
                  <option value="">All subscribed contacts</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
              {audienceNote ? <p className="mt-1.5 text-xs font-medium text-brand-800" role="status">{audienceNote}</p> : null}
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setAddOpen(true)} aria-haspopup="dialog">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Add new contacts
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Content" description="Build your email from blocks. Use {{first_name|there}} to personalise." />
          <div className="space-y-4 p-6">
            {blocks.length === 0 ? <p className="rounded-xl bg-mist-50 p-4 text-sm text-ink-muted">No blocks yet. Add one below.</p> : null}
            {blocks.map((b, i) => (
              <div key={b.id} className="rounded-2xl border border-mist p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-ink">{LABELS[b.type]}</span>
                  <span className="flex gap-1">
                    <button type="button" onClick={() => move(i, -1)} className="rounded-full p-1.5 hover:bg-mist-100" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => move(i, 1)} className="rounded-full p-1.5 hover:bg-mist-100" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))} className="rounded-full p-1.5 text-danger hover:bg-danger-soft" aria-label="Delete block"><Trash2 className="h-4 w-4" /></button>
                  </span>
                </div>
                {b.type === "heading" ? <Input value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })} aria-label="Heading text" /> : null}
                {b.type === "text" ? <Textarea value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })} aria-label="Text" /> : null}
                {b.type === "image" ? (
                  <div className="space-y-3">
                    <Input value={b.url} onChange={(e) => patch(b.id, { url: e.target.value })} placeholder="https://…/image.jpg" aria-label="Image URL" />
                    <Input value={b.alt} onChange={(e) => patch(b.id, { alt: e.target.value })} placeholder="Describe the image" aria-label="Alt text" />
                    <Input value={b.link ?? ""} onChange={(e) => patch(b.id, { link: e.target.value })} placeholder="Optional link when clicked" aria-label="Image link" />
                  </div>
                ) : null}
                {b.type === "button" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input value={b.label} onChange={(e) => patch(b.id, { label: e.target.value })} aria-label="Button label" />
                    <Input value={b.url} onChange={(e) => patch(b.id, { url: e.target.value })} placeholder="https://" aria-label="Button link" />
                  </div>
                ) : null}
                {b.type === "spacer" ? <Input type="number" min={4} max={120} value={b.height} onChange={(e) => patch(b.id, { height: Number(e.target.value) })} aria-label="Height in pixels" className="max-w-[140px]" /> : null}
                {b.type === "divider" ? <p className="text-sm text-ink-muted">A thin horizontal line.</p> : null}
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              {(["heading", "text", "image", "button", "divider", "spacer"] as const).map((t) => (
                <Button key={t} type="button" variant="secondary" size="sm" onClick={() => setBlocks((bs) => [...bs, blank(t)])}>+ {LABELS[t]}</Button>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Send" description="The unsubscribe link and your business address are added to the footer automatically." />
          <div className="space-y-5 p-6">
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
              <Button type="submit" formAction={actions.submit} onClick={(e) => { if (!window.confirm(mode === "now" ? "Send this campaign to your audience?" : "Schedule this campaign?")) e.preventDefault(); }}>
                {mode === "now" ? "Send campaign" : "Schedule campaign"}
              </Button>
              <Button type="submit" formAction={actions.remove} variant="ghost" onClick={(e) => { if (!window.confirm("Delete this draft?")) e.preventDefault(); }}>Delete draft</Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader title="Preview" description="Shown with a sample first name." />
          <iframe title="Email preview" srcDoc={srcDoc} sandbox="" className="h-[640px] w-full rounded-b-2xl bg-white" />
        </Card>
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