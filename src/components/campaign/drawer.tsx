"use client";

import { useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import {
  ADDABLE_BLOCKS, BLOCK_LABEL, BRAND_COLORS, CONDITIONS, FORM_BLOCKS, GRADIENTS, gradientCss, SLOT_KEY, SLOT_LABEL, TEMPLATE_BLURB, TEMPLATE_KEYS, TEMPLATE_LABEL, TEMPLATE_THUMB,
  type BlockType, type Brand, type Cond, type DBlock, type Design, type Mode, type Product,
} from "@/lib/email/design";
import type { VariableDef } from "@/lib/email/variables";
import { VARIABLE_KEY_RE, isBuiltInVariable } from "@/lib/email/variables";
import { insertAtCursor, varLabel, variableKeys } from "./util";

export type DrawerTab = "tpl" | "blocks" | "edit" | "vars" | "media" | "brand";

/** "Insert variable": a small menu that stays open while you add several, and puts each at the cursor of `target`. */
export function VarMenu({ keys, target, onPickWithoutTarget }: { keys: string[]; target: RefObject<HTMLInputElement | HTMLTextAreaElement | null>; onPickWithoutTarget?: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement | null>(null);
  return (
    <span ref={wrap} style={{ position: "relative", display: "inline-block" }}
      onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
      onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); target.current?.focus(); } }}>
      <button type="button" className="hint lnk" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ display: "inline" }}>Insert variable</button>
      <span className={`menu${open ? " open" : ""}`} style={{ bottom: "auto", top: "calc(100% + 4px)", width: 200 }} role="group" aria-label="Variables">
        {keys.map((k) => (
          <button key={k} type="button" className="it" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { if (target.current) insertAtCursor(target.current, `{{${k}}}`); else onPickWithoutTarget?.(k); }}>
            {varLabel(k)}<small>{`{{${k}}}`}</small>
          </button>
        ))}
        <button type="button" className="it" onClick={() => { setOpen(false); target.current?.focus(); }}><small>Done</small></button>
      </span>
    </span>
  );
}

function LabelRow({ id, label, keys, target }: { id: string; label: string; keys: string[]; target: RefObject<HTMLInputElement | HTMLTextAreaElement | null> }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
      <label htmlFor={id} style={{ margin: "14px 0 5px" }}>{label}</label>
      <VarMenu keys={keys} target={target} />
    </div>
  );
}

function LinkField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label htmlFor="bu">Link URL</label>
      <input type="text" id="bu" inputMode="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://example.com" />
      <p className="hint">Starts with https:// or mailto:</p>
    </>
  );
}

function TextField({ id, label, rows, value, onChange, keys }: { id: string; label: string; rows: number; value: string; onChange: (v: string) => void; keys: string[] }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return (
    <>
      <LabelRow id={id} label={label} keys={keys} target={ref} />
      <textarea ref={ref} id={id} data-var-target rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </>
  );
}

type Obj = { x?: string; y?: string; d?: string; p?: Product[]; soc?: { n: string; u: string }[] };

/** Forms for the blocks that have several fields. `obj` is a block, or the template content for countdown and products. */
function ExtendedEditor({ type, obj, onChange, keys }: { type: BlockType | "countdown" | "products"; obj: Obj; onChange: (patch: Partial<Obj>) => void; keys: string[] }) {
  if (type === "columns") {
    return (
      <>
        <TextField id="cx" label="Left column" rows={3} value={obj.x ?? ""} onChange={(v) => onChange({ x: v })} keys={keys} />
        <TextField id="cy" label="Right column" rows={3} value={obj.y ?? ""} onChange={(v) => onChange({ y: v })} keys={keys} />
      </>
    );
  }
  if (type === "countdown") {
    return (<><label htmlFor="cd">Counts down to</label><input type="date" id="cd" value={obj.d ?? ""} onChange={(e) => e.target.value && onChange({ d: e.target.value })} /></>);
  }
  if (type === "social") {
    return (
      <>
        {(obj.soc ?? []).map((s, i) => (
          <div key={i}>
            <label htmlFor={`soc${i}`}>{s.n} link</label>
            <input type="text" id={`soc${i}`} inputMode="url" value={s.u} placeholder="https://…"
              onChange={(e) => onChange({ soc: (obj.soc ?? []).map((x, j) => (j === i ? { ...x, u: e.target.value } : x)) })} />
          </div>
        ))}
        <p className="hint">Icons without a link are left out of the sent email.</p>
      </>
    );
  }
  const ps = obj.p ?? [];
  const set = (i: number, k: keyof Product, v: string) => onChange({ p: ps.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  return (
    <>
      <label>Products</label>
      {ps.map((x, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <input type="text" value={x.n} onChange={(e) => set(i, "n", e.target.value)} aria-label={`Product ${i + 1} name`} />
            <input type="text" value={x.p} onChange={(e) => set(i, "p", e.target.value)} aria-label="Price" />
          </div>
          <input type="text" inputMode="url" value={x.u} onChange={(e) => set(i, "u", e.target.value)} placeholder="Link, https://…" aria-label={`Product ${i + 1} link`} />
        </div>
      ))}
    </>
  );
}

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button type="button" key={v} className={value === v ? "on" : ""} onClick={() => onPick(v)}>{l}</button>)}</div>;
}

export type DrawerProps = {
  design: Design;
  brand: Brand;
  tab: DrawerTab;
  setTab: (t: DrawerTab) => void;
  open: boolean;
  onClose: () => void;
  selBlock: DBlock | null;
  selSlot: string | null;
  variables: VariableDef[];
  setVariables: Dispatch<SetStateAction<VariableDef[]>>;
  contactFieldKeys: string[];
  uploading: boolean;
  canSaveTemplate: boolean;
  savingTemplate: boolean;
  onSaveTemplate: () => void;
  onTemplate: (m: Mode) => void;
  onAddBlock: (t: BlockType) => void;
  onPatchC: (patch: Partial<Design["C"]>) => void;
  onPatchBlock: (id: number, patch: Partial<DBlock>) => void;
  onBanner: (patch: Partial<Design["banner"]>, snap: boolean) => void;
  onLogo: (patch: Partial<Brand["logo"]>) => void;
  onCond: (c: Cond) => void;
  onColor: (c: string) => void;
  onUpload: (kind: "logo" | "banner" | "image") => void;
  onClear: (kind: "logo" | "banner") => void;
  onPreset: (i: number) => void;
  onInsertVar: (key: string) => void;
  mark: () => void;
};

/** The side panel: templates, blocks, editing the selection, variables, media and brand. */
export function Drawer(p: DrawerProps) {
  const { design: d, brand, tab } = p;
  const custom = d.tpl === "custom";
  const keys = variableKeys(p.contactFieldKeys, p.variables);
  const sb = p.selBlock;

  const tabs: [DrawerTab, string][] = [["tpl", "Templates"], ...(custom ? ([["blocks", "Blocks"]] as [DrawerTab, string][]) : []), ["edit", "Edit"], ["vars", "Variables"], ["media", "Media"], ["brand", "Brand"]];
  const active: DrawerTab = tab === "blocks" && !custom ? "tpl" : tab;

  const fallbackOf = (k: string) => p.variables.find((v) => v.key === k)?.fallback ?? (k === "first_name" ? "there" : "");
  const setFallback = (k: string, fb: string) =>
    p.setVariables((vs) => (vs.some((v) => v.key === k) ? vs.map((v) => (v.key === k ? { ...v, fallback: fb } : v)) : [...vs, { key: k, scope: "recipient", value: "", fallback: fb }]));
  const campaignVars = p.variables.filter((v) => v.scope === "campaign");

  const bannerCtl = () => {
    const B = d.banner;
    const uploaded = B.src && B.src[0] !== "g";
    return (
      <>
        <label>Banner</label>
        <button type="button" className="btn" disabled={p.uploading} onClick={() => p.onUpload("banner")}>{p.uploading ? "Uploading…" : B.src ? "Replace image" : "Upload banner"}</button>
        {B.src ? <button type="button" className="btn" onClick={() => p.onClear("banner")}>Remove</button> : null}
        {uploaded ? (
          <>
            <label htmlFor="fx">Focus left–right</label>
            <input type="range" id="fx" min={0} max={100} value={B.fx} onChange={(e) => p.onBanner({ fx: +e.target.value }, false)} />
            <label htmlFor="fy">Focus up–down</label>
            <input type="range" id="fy" min={0} max={100} value={B.fy} onChange={(e) => p.onBanner({ fy: +e.target.value }, false)} />
            <label htmlFor="balt">Alt text</label>
            <input type="text" id="balt" value={B.alt} onChange={(e) => p.onBanner({ alt: e.target.value }, false)} placeholder="Describe the image" maxLength={300} />
          </>
        ) : null}
        <p className="hint"><span><b>Shared asset.</b> Every banner in this email shows this same image. Cropped to 600×200 automatically.</span></p>
      </>
    );
  };

  const logoCtl = () => {
    const L = brand.logo;
    return (
      <>
        <label>Logo</label>
        <button type="button" className="btn" disabled={p.uploading} onClick={() => p.onUpload("logo")}>{p.uploading ? "Uploading…" : L.src ? "Replace logo" : "Upload logo"}</button>
        {L.src ? <button type="button" className="btn" onClick={() => p.onClear("logo")}>Remove</button> : null}
        <label>Alignment</label>
        <Seg value={L.align} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} onPick={(v) => p.onLogo({ align: v })} />
        <label>Size</label>
        <Seg value={L.size} options={[["s", "Small"], ["m", "Medium"], ["l", "Large"]]} onPick={(v) => p.onLogo({ size: v })} />
        <p className="hint"><span><b>Shared asset.</b> One logo for the whole email, wherever a logo appears, and reused in every campaign. Fitted automatically.</span></p>
      </>
    );
  };

  const condField = (cond: Cond | undefined) => (
    <>
      <label htmlFor="cond">Show to</label>
      <select id="cond" value={cond ?? ""} onChange={(e) => p.onCond(e.target.value as Cond)}>{CONDITIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
      <p className="hint">Everyone else won’t see this block.</p>
    </>
  );

  let body: ReactNode = null;

  if (active === "tpl") {
    const tile = (k: Mode & keyof typeof TEMPLATE_LABEL) => (
      <button type="button" key={k} className={`tplc${d.tpl === k ? " on" : ""}`} aria-current={d.tpl === k ? "true" : undefined} onClick={() => p.onTemplate(k)}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="th">{[...TEMPLATE_THUMB[k]].map((c, i) => <i key={i} className={c} />)}</div>
          <div><b>{TEMPLATE_LABEL[k]}</b><small>{TEMPLATE_BLURB[k]}</small></div>
        </div>
      </button>
    );
    body = (
      <>
        <p className="empty">{custom ? "You’re in a custom layout. Pick a template to switch; you’ll see what carries over first." : "Templates have a fixed layout. You edit their content, not their structure."}</p>
        {TEMPLATE_KEYS.map((k) => tile(k))}
        {custom ? (
          <button type="button" className="tplc on" aria-current="true"><b>Custom layout</b><small>Free blocks, drag to reorder</small></button>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => p.onTemplate("custom")}>Customize layout…</button>
            <p className="hint">Switches to free-form blocks. You’ll see what carries over first.</p>
          </>
        )}
        {d.tray.length ? <p className="hint">Set aside from your custom layout: {d.tray.map((b) => BLOCK_LABEL[b.t]).join(", ")}. They return if you customize the layout again.</p> : null}
        {p.canSaveTemplate ? (
          <>
            <label>Saved templates</label>
            <button type="button" className="btn" disabled={p.savingTemplate} onClick={p.onSaveTemplate}>{p.savingTemplate ? "Saving…" : "Save as template"}</button>
            <p className="hint">Saved with this campaign’s title. Duplicate or rename it on the Templates page.</p>
          </>
        ) : null}
      </>
    );
  }

  if (active === "blocks") {
    body = (
      <>
        <div className="grid">{ADDABLE_BLOCKS.map((t) => <button type="button" key={t} className="tile" onClick={() => p.onAddBlock(t)}>{BLOCK_LABEL[t]}</button>)}</div>
        <p className="empty">Click a block to add it below the selected one, or use + between blocks.</p>
      </>
    );
  }

  if (active === "edit") {
    if (!custom) {
      const slot = p.selSlot;
      const k = slot ? SLOT_KEY[slot] : undefined;
      if (slot === "countdown" || slot === "products") body = <ExtendedEditor type={slot} obj={d.C} onChange={(patch) => p.onPatchC(patch as Partial<Design["C"]>)} keys={keys} />;
      else if (slot === "logo") body = logoCtl();
      else if (slot === "banner") body = bannerCtl();
      else if (k) {
        body = (
          <>
            <TextField id="sx" label={SLOT_LABEL[slot!]} rows={k === "body" ? 6 : 3} value={String(d.C[k])} onChange={(v) => p.onPatchC({ [k]: v })} keys={keys} />
            {slot === "button" ? <LinkField value={d.C.u} onChange={(v) => p.onPatchC({ u: v })} /> : null}
            <p className="hint">The layout is fixed by the template.</p>
          </>
        );
      } else body = <p className="empty">Select a part of the email to edit its content.</p>;
      if (slot && slot !== "footer") body = <>{body}{condField(d.cond[slot])}</>;
    } else if (!sb) {
      body = <p className="empty">Select a block in the email to edit it.</p>;
    } else {
      let inner: ReactNode;
      if (FORM_BLOCKS.includes(sb.t)) inner = <ExtendedEditor type={sb.t} obj={sb} onChange={(patch) => p.onPatchBlock(sb.id, patch)} keys={keys} />;
      else if (sb.x !== undefined) {
        inner = (
          <>
            <TextField id="bx" label="Text" rows={5} value={sb.x} onChange={(v) => p.onPatchBlock(sb.id, { x: v })} keys={keys} />
            {sb.t === "button" ? <LinkField value={sb.u ?? ""} onChange={(v) => p.onPatchBlock(sb.id, { u: v })} /> : null}
            <p className="hint">Insert variables with the link above, or from the Variables tab.</p>
          </>
        );
      } else if (sb.t === "logo") inner = logoCtl();
      else if (sb.t === "banner") inner = bannerCtl();
      else if (sb.t === "image") inner = <p className="empty">Pick or upload an image in the Media tab.</p>;
      else inner = <p className="empty">Nothing to edit on this block.</p>;
      body = <>{inner}{condField(sb.cond)}</>;
    }
  }

  if (active === "vars") {
    body = (
      <>
        <p className="empty">Click a variable to insert it. The fallback shows when a contact has no value.</p>
        {keys.map((k) => (
          <div className="var" key={k}>
            <button type="button" className="chip" onClick={() => p.onInsertVar(k)}>{varLabel(k)}</button>
            <input type="text" value={fallbackOf(k)} onChange={(e) => setFallback(k, e.target.value.slice(0, 100))} placeholder="Fallback" aria-label={`Fallback for ${varLabel(k)}`} />
          </div>
        ))}
        <label>Campaign variables</label>
        <p className="hint"><span>Values you set once, the same in every email (a promo code, an event date).</span></p>
        {campaignVars.map((v, i) => (
          <div className="var" key={i}>
            <input type="text" value={v.key} aria-label="Variable name" placeholder="offer_code" maxLength={40}
              onChange={(e) => { const key = e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z]+/, "").slice(0, 40); p.setVariables((vs) => vs.map((x) => (x === v ? { ...x, key } : x))); }} />
            <input type="text" value={v.value} aria-label={`Value for ${v.key || "variable"}`} placeholder="Value" maxLength={500}
              onChange={(e) => p.setVariables((vs) => vs.map((x) => (x === v ? { ...x, value: e.target.value } : x)))} />
            <button type="button" className="btn" aria-label={`Remove ${v.key || "variable"}`} onClick={() => p.setVariables((vs) => vs.filter((x) => x !== v))}>×</button>
          </div>
        ))}
        {campaignVars.some((v) => v.key && (!VARIABLE_KEY_RE.test(v.key) || isBuiltInVariable(v.key) || p.contactFieldKeys.includes(v.key) || p.variables.filter((x) => x.key === v.key).length > 1)) ? (
          <p className="hint bad">Each name must be unique, start with a letter, and not match a contact field.</p>
        ) : null}
        <button type="button" className="btn" onClick={() => p.setVariables((vs) => [...vs, { key: "", scope: "campaign", value: "", fallback: "" }])}>Add variable</button>
      </>
    );
  }

  if (active === "media") {
    body = (
      <>
        {bannerCtl()}
        {custom && sb?.t === "image" ? (
          <>
            <label>Selected image</label>
            <button type="button" className="btn" disabled={p.uploading} onClick={() => p.onUpload("image")}>{p.uploading ? "Uploading…" : sb.img ? "Replace image" : "Upload image"}</button>
            {sb.img ? <button type="button" className="btn" onClick={() => p.onPatchBlock(sb.id, { img: undefined })}>Remove</button> : null}
          </>
        ) : null}
        <label>Presets</label>
        <div className="grid">
          {GRADIENTS.map((_, i) => <button type="button" key={i} className={`media${sb && sb.g === i && !sb.img ? " on" : ""}`} style={{ background: gradientCss(i) }} aria-label={`Image ${i + 1}`} onClick={() => p.onPreset(i)} />)}
        </div>
        <p className="empty">Selecting one changes the selected image, or adds a new image block. A selected banner, or any template, uses the shared banner image.</p>
      </>
    );
  }

  if (active === "brand") {
    body = (
      <>
        {logoCtl()}
        <label>Brand color</label>
        <div className="sw">{BRAND_COLORS.map((c) => <button type="button" key={c} className={d.color === c ? "on" : ""} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => p.onColor(c)} />)}</div>
      </>
    );
  }

  return (
    <aside className={`drawer${p.open ? "" : " shut"}`} id="drawer" aria-label="Editor panel">
      <div className="dtabs" role="tablist">
        {tabs.map(([k, l]) => <button type="button" key={k} role="tab" aria-selected={active === k} className={`t${active === k ? " on" : ""}`} onClick={() => p.setTab(k)}>{l}</button>)}
        <button type="button" className="x" aria-label="Close panel" onClick={p.onClose}>×</button>
      </div>
      <div className="dbody">{body}</div>
    </aside>
  );
}
