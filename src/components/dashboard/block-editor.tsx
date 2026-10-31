"use client";

import type { Dispatch, SetStateAction } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VariableField, type VariableOption } from "@/components/dashboard/variable-field";
import type { Block } from "@/lib/email/blocks";

const uid = () => Math.random().toString(36).slice(2, 10);
const LABELS: Record<Block["type"], string> = { heading: "Heading", text: "Text", image: "Image", button: "Button", divider: "Divider", spacer: "Spacer", html: "HTML" };

function blank(type: Exclude<Block["type"], "html">): Block {
  switch (type) {
    case "heading": return { id: uid(), type, text: "Your headline" };
    case "text": return { id: uid(), type, text: "Hi {{first_name}},\n\nWrite your message here." };
    case "image": return { id: uid(), type, url: "https://", alt: "" };
    case "button": return { id: uid(), type, label: "Learn more", url: "https://" };
    case "divider": return { id: uid(), type };
    case "spacer": return { id: uid(), type, height: 24 };
  }
}

/** The block list with add / move / delete. The parent owns the blocks. */
export function BlockEditor({ blocks, setBlocks, variableOptions }: { blocks: Block[]; setBlocks: Dispatch<SetStateAction<Block[]>>; variableOptions: VariableOption[] }) {
  const patch = (id: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)));
  const move = (i: number, d: -1 | 1) =>
    setBlocks((bs) => { const n = [...bs]; const j = i + d; if (j < 0 || j >= n.length) return bs; [n[i], n[j]] = [n[j], n[i]]; return n; });

  return (
    <Card>
      <CardHeader title="Content" description="Build your email from blocks. Use Insert variable to personalise headings, text and button labels." />
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
            {b.type === "heading" ? <VariableField label="Heading text" value={b.text} onChange={(v) => patch(b.id, { text: v })} options={variableOptions} /> : null}
            {b.type === "text" ? <VariableField label="Text" multiline rows={6} value={b.text} onChange={(v) => patch(b.id, { text: v })} options={variableOptions} /> : null}
            {b.type === "image" ? (
              <div className="space-y-3">
                <Input value={b.url} onChange={(e) => patch(b.id, { url: e.target.value })} placeholder="https://…/image.jpg" aria-label="Image URL" />
                <Input value={b.alt} onChange={(e) => patch(b.id, { alt: e.target.value })} placeholder="Describe the image" aria-label="Alt text" />
                <Input value={b.link ?? ""} onChange={(e) => patch(b.id, { link: e.target.value })} placeholder="Optional link when clicked" aria-label="Image link" />
              </div>
            ) : null}
            {b.type === "button" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <VariableField label="Button label" value={b.label} onChange={(v) => patch(b.id, { label: v })} options={variableOptions} />
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-ink">Button link</label>
                  <Input value={b.url} onChange={(e) => patch(b.id, { url: e.target.value })} placeholder="https://" aria-label="Button link" />
                </div>
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
  );
}
