"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { emailCanvas } from "@/config/brand";
import { BLOCK_LABELS, layoutRows, type Design, type RenderCtx, type SlotKey } from "@/lib/email/campaign";
import { cn } from "@/lib/utils";

const blockBase = "relative cursor-pointer outline outline-2 -outline-offset-2 outline-transparent hover:outline-brand-200 focus-visible:outline-brand-700";
const miniBtn = "rounded border border-mist bg-white px-2 py-0.5 text-xs text-ink hover:bg-mist-100";

type Props = {
  design: Design;
  ctx: RenderCtx;
  selBlock: string | null;
  selSlot: SlotKey | null;
  onSlot: (k: SlotKey) => void;
  onBlock: (id: string) => void;
  onInsert: (index: number) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
};

/**
 * The email being edited. The pieces of the email are drawn by the same renderer that makes the sent
 * email (with chips standing in for variables); this adds selecting, reordering and inserting around them.
 */
export function Canvas({ design, ctx, selBlock, selSlot, onSlot, onBlock, onInsert, onMove, onRemove, onReorder }: Props) {
  const rows = useMemo(() => layoutRows(design, ctx, "edit"), [design, ctx]);
  const custom = design.tpl === "custom";
  const drag = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const refocus = useRef<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  // After a block moves, the button that moved it keeps the keyboard focus.
  useEffect(() => {
    if (!refocus.current) return;
    root.current?.querySelector<HTMLElement>(`[data-mv="${refocus.current}"]`)?.focus();
    refocus.current = null;
  });

  const activate = (e: React.KeyboardEvent, fn: () => void) => {
    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fn(); }
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-2">
      <div ref={root} className="mx-auto max-w-[600px] rounded-md shadow-[0_1px_3px_rgba(0,0,0,.12)]" style={{ background: emailCanvas.card, color: emailCanvas.ink }}>
        {rows.map((r, i) => {
          const inner = <div dangerouslySetInnerHTML={{ __html: r.html }} />;
          if (r.slot) {
            const slot = r.slot;
            return (
              <div
                key={r.key}
                data-slot={slot}
                tabIndex={0}
                role="group"
                aria-label={`${slot} section`}
                onClick={() => onSlot(slot)}
                onKeyDown={(e) => activate(e, () => onSlot(slot))}
                className={cn(blockBase, selSlot === slot && "outline-brand-700")}
                style={{ padding: r.pad, background: r.bg }}
              >
                {r.cond ? <ConditionalBadge /> : null}
                {inner}
              </div>
            );
          }
          if (!r.blockId) return <div key={r.key} style={{ padding: r.pad }}>{inner}</div>;

          const id = r.blockId;
          const block = design.blocks.find((b) => b.id === id)!;
          const selected = selBlock === id;
          const label = BLOCK_LABELS[block.t];
          return (
            <div key={r.key}>
              <div className="relative z-[2] h-0 text-center">
                <button
                  type="button"
                  aria-label="Add block here"
                  onClick={() => onInsert(i)}
                  className="absolute -top-2.5 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full border border-brand-700 bg-white p-0 text-sm leading-none text-brand-700 opacity-0 hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                >+</button>
              </div>
              <div
                data-id={id}
                draggable
                tabIndex={0}
                role="group"
                aria-label={`${label} block${selected ? ", selected" : ""}`}
                onClick={() => onBlock(id)}
                onKeyDown={(e) => activate(e, () => onBlock(id))}
                onDragStart={(e) => { drag.current = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }}
                onDragOver={(e) => { if (drag.current === null) return; e.preventDefault(); setOver(id); }}
                onDrop={(e) => { if (drag.current === null) return; e.preventDefault(); const from = drag.current; drag.current = null; setOver(null); if (from !== id) onReorder(from, id); }}
                onDragEnd={() => { drag.current = null; setOver(null); }}
                className={cn(blockBase, "cursor-grab", selected && "outline-brand-700", over === id && "shadow-[0_-3px_0_rgb(var(--c-brand-700))]")}
                style={{ padding: r.pad }}
              >
                {r.cond ? <ConditionalBadge /> : null}
                {inner}
                {selected ? (
                  <div className="absolute right-1.5 top-1.5 flex gap-1">
                    <button type="button" data-mv={`${id}:-1`} aria-label="Move up" className={miniBtn} onClick={(e) => { e.stopPropagation(); refocus.current = `${id}:-1`; onMove(id, -1); }}>↑</button>
                    <button type="button" data-mv={`${id}:1`} aria-label="Move down" className={miniBtn} onClick={(e) => { e.stopPropagation(); refocus.current = `${id}:1`; onMove(id, 1); }}>↓</button>
                    <button type="button" aria-label={`Remove ${label} block`} className={cn(miniBtn, "text-danger")} onClick={(e) => { e.stopPropagation(); onRemove(id); }}>Remove</button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {custom ? (
          <div className="relative z-[2] h-0 text-center">
            <button
              type="button"
              aria-label="Add block here"
              onClick={() => onInsert(design.blocks.length)}
              className="absolute -top-2.5 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full border border-brand-700 bg-white p-0 text-sm leading-none text-brand-700 opacity-0 hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >+</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConditionalBadge() {
  return <span className="absolute left-1.5 top-[3px] z-[2] rounded-full bg-warning-soft px-1.5 text-[10px] text-warning">Conditional</span>;
}
