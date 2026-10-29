"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { personalize, renderBlocks, type Block } from "@/lib/email/blocks";

type Action = (formData: FormData) => Promise<void>;
type Props = {
  campaign: { id: string; name: string; subject: string; preview_text: string; from_name: string; from_email: string; list_id: string | null; blocks: Block[] };
  domains: { id: string; domain: string; status: string }[];
  lists: { id: string; name: string }[];
  workspace: { name: string; business_address: string | null };
  actions: { save: Action; test: Action; submit: Action; remove: Action };
};

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

export function CampaignEditor({ campaign, domains, lists, workspace, actions }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(campaign.blocks);
  const [previewText, setPreviewText] = useState(campaign.preview_text);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [iso, setIso] = useState("");

  const [local, domain] = campaign.from_email.split("@");
  const patch = (id: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)));
  const move = (i: number, d: -1 | 1) =>
    setBlocks((bs) => { const n = [...bs]; const j = i + d; if (j < 0 || j >= n.length) return bs; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const srcDoc = useMemo(() => {
    const footer = `<p style="margin:16px 0 0;font-size:12px;color:#6B7290;text-align:center;">You are receiving this email because you subscribed to ${workspace.name.replace(/</g, "")}.<br><u>Unsubscribe</u><br>${(workspace.business_address ?? "Your business address").replace(/</g, "")}</p>`;
    return personalize(renderBlocks(blocks, { preview: previewText }), { first_name: "Ada" }).replace("<!--FOOTER-->", footer);
  }, [blocks, previewText, workspace]);

  return (
    <form className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
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
            <Field label="Audience" htmlFor="listId">
              <Select id="listId" name="listId" defaultValue={campaign.list_id ?? ""}>
                <option value="">All subscribed contacts</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
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
                    <button type="button" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))} className="rounded-full p-1.5 text-danger hover:bg-red-50" aria-label="Delete block"><Trash2 className="h-4 w-4" /></button>
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
              <Button type="submit" formAction={actions.save} variant="outline">Save draft</Button>
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
  );
}
