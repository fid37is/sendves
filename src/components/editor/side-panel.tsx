"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { emailCanvas } from "@/config/brand";
import {
  ADDABLE_BLOCKS, BLOCK_LABELS, blankGalleryImage, CONDITIONS, EXTRA_EDITOR_BLOCKS, GRADIENT_COUNT, hasFmt, IMAGE_WIDTHS, MAX_GALLERY_IMAGES,
  TEMPLATE_BLURBS, TEMPLATE_KEYS, TEMPLATE_NAMES,
  type BlockType, type Cond, type Design, type EmailBlock, type Fmt, type FmtSlot, type GalleryImage, type Layout, type Logo, type Product, type SlotKey, type Tab,
} from "@/lib/email/campaign";
import { cleanHex, DARK_TEXT } from "@/lib/email/color";
import { cn } from "@/lib/utils";
import { Hint, Lbl, LayoutThumb, Seg, SelectBox, TextArea, TextInput } from "@/components/editor/controls";
import type { Doc, UploadTarget } from "@/components/editor/types";

const SLOT_FIELD: Partial<Record<SlotKey, "headline" | "body" | "btn" | "foot">> = { headline: "headline", body: "body", button: "btn", footer: "foot" };
const SLOT_LABEL: Partial<Record<SlotKey, string>> = { headline: "Headline", body: "Body", button: "Button label", footer: "Footer" };
const SOCIAL_NAMES: Record<string, string> = { IG: "IG", X: "X", FB: "FB", YT: "YT" };

export type PanelProps = {
  open: boolean;
  tab: Tab;
  setTab: (t: Tab) => void;
  onClose: () => void;
  design: Design;
  logo: Logo;
  selBlock: EmailBlock | null;
  slot: SlotKey | null;
  mutate: (fn: (d: Doc) => Doc, record?: boolean) => void;
  addBlock: (t: BlockType) => void;
  askLayout: (k: Layout) => void;
  pickImage: (target: UploadTarget) => void;
  uploading: boolean;
  /** Called after a choice that changes the email (on a phone this closes the panel so the result is visible). */
  afterPick: () => void;
  /** Every variable the email can use, with how it is named. */
  variables: { key: string; label: string }[];
  fallbacks: Record<string, string>;
  setFallback: (key: string, value: string) => void;
  insertVariable: (key: string) => void;
  pickPreset: (g: number) => void;
};

/** An on/off button (Bold, Italic). */
function Toggle({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1.5 text-[13px] transition-colors", on ? "border-brand-700 bg-brand-50 font-semibold text-brand-800" : "border-mist bg-white text-ink-soft hover:bg-mist-100")}
    >
      {children}
    </button>
  );
}

/** Any brand colour: a field for the #rrggbb code that accepts it once it is complete. */
function HexField({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(draft);
  return (
    <TextInput
      id="bhex" value={draft} maxLength={7} placeholder="#164e63" aria-label="Hex color code" aria-invalid={!valid && draft !== value ? true : undefined} className="w-28"
      onChange={(e) => { const v = e.target.value.trim(); setDraft(v); if (/^#[0-9a-f]{6}$/i.test(v)) onCommit(v.toLowerCase()); }}
      onBlur={() => setDraft(valid ? draft.toLowerCase() : value)}
    />
  );
}

/** The right-hand panel: Templates, Blocks, Edit, Variables, Media and Brand. */
export function SidePanel(p: PanelProps) {
  const { design: D, logo } = p;
  const custom = D.tpl === "custom";
  const tab: Tab = p.tab === "blocks" && !custom ? "tpl" : p.tab;
  const tabs: [Tab, string][] = [["tpl", "Templates"], ...(custom ? ([["blocks", "Blocks"]] as [Tab, string][]) : []), ["edit", "Edit"], ["vars", "Variables"], ["media", "Media"], ["brand", "Brand"]];

  // ── Ways to change the design (typing is not recorded for Undo; structural changes are) ──
  const setDesign = (fn: (d: Design) => Design, record = false) => p.mutate((doc) => ({ ...doc, design: fn(doc.design) }), record);
  const setC = (patch: Partial<Design["C"]>) => setDesign((d) => ({ ...d, C: { ...d.C, ...patch } }));
  const setBlock = (patch: Partial<EmailBlock>, record = false) => { const id = p.selBlock?.id; if (id) setDesign((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }), record); };
  const setBanner = (patch: Partial<Design["banner"]>, record = false) => setDesign((d) => ({ ...d, banner: { ...d.banner, ...patch } }), record);
  const setLogo = (patch: Partial<Logo>) => p.mutate((doc) => ({ ...doc, logo: { ...doc.logo, ...patch } }), true);
  const setCond = (v: Cond) => {
    if (!custom && p.slot) { const slot = p.slot; setDesign((d) => ({ ...d, cond: { ...d.cond, [slot]: v } })); }
    else setBlock({ cond: v });
  };

  // ── Pieces shared by several tabs ──
  const linkField = (url: string | undefined, onChange: (v: string) => void, id = "bu", label = "Link URL") => (
    <>
      <Lbl htmlFor={id}>{label}</Lbl>
      <TextInput id={id} inputMode="url" value={url ?? ""} placeholder="https://example.com" onChange={(e) => onChange(e.target.value)} />
      <Hint>Starts with https:// or mailto:</Hint>
    </>
  );

  /**
   * Alignment, bold, italic and colour for a whole block (not part of a sentence). `current` is the block's
   * formatting and `change` stores the new one; an empty formatting removes it.
   */
  const fmtControls = (current: Fmt | undefined, change: (next: Fmt | undefined) => void, record = true) => {
    const f: Fmt = current ?? {};
    const set = (patch: Partial<Fmt>, rec = record) => { const next: Fmt = { ...f, ...patch }; (Object.keys(next) as (keyof Fmt)[]).forEach((k) => { if (!next[k]) delete next[k]; }); changeRec(hasFmt(next) ? next : undefined, rec); };
    const changeRec = (next: Fmt | undefined, rec: boolean) => { if (rec) p.mutate((d) => d, true); change(next); };
    return (
      <>
        <Lbl>Alignment</Lbl>
        <Seg label="Text alignment" value={(f.al ?? "") as "" | "left" | "center" | "right"} onChange={(v) => set({ al: f.al === v ? undefined : (v as "left" | "center" | "right") })}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
        <Lbl>Style</Lbl>
        <div className="flex gap-1.5">
          <Toggle on={Boolean(f.b)} label="Bold" onClick={() => set({ b: !f.b })}><b>Bold</b></Toggle>
          <Toggle on={Boolean(f.i)} label="Italic" onClick={() => set({ i: !f.i })}><i>Italic</i></Toggle>
        </div>
        <Lbl htmlFor="fcol">Text color</Lbl>
        <div className="flex flex-wrap items-center gap-2">
          <input id="fcol" type="color" aria-label="Text color" className="h-9 w-12 cursor-pointer rounded-lg border border-mist bg-white p-1" value={f.col ?? DARK_TEXT} onChange={(e) => set({ col: cleanHex(e.target.value) }, false)} />
          <Button size="sm" variant="outline" disabled={!hasFmt(current)} onClick={() => changeRec(undefined, record)}>Reset formatting</Button>
        </div>
        <Hint>Applies to the whole block. {f.col ? "" : "Without a chosen color, the default is used."}</Hint>
      </>
    );
  };

  const slotFmt = (slot: FmtSlot) => fmtControls(D.fmt[slot], (next) => setDesign((d) => {
    const fmt = { ...d.fmt };
    if (next) fmt[slot] = next; else delete fmt[slot];
    return { ...d, fmt };
  }));
  const blockFmt = (b: EmailBlock) => fmtControls(b.f, (next) => setBlock({ f: next }));

  const logoControls = (
    <>
      <Lbl>Logo</Lbl>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={p.uploading} onClick={() => p.pickImage({ kind: "logo" })}>{logo.src ? "Replace logo" : "Upload logo"}</Button>
        {logo.src ? <Button size="sm" variant="outline" onClick={() => p.mutate((d) => ({ ...d, logo: { ...d.logo, src: "", w: 0, h: 0 } }), true)}>Remove</Button> : null}
      </div>
      <Lbl>Alignment</Lbl>
      <Seg label="Logo alignment" value={logo.align} onChange={(v) => setLogo({ align: v })} options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
      <Lbl>Size</Lbl>
      <Seg label="Logo size" value={logo.size} onChange={(v) => setLogo({ size: v })} options={[{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }]} />
      <Hint><b>Shared asset.</b> One logo for the whole email, wherever a logo appears, and reused in every campaign. Fitted automatically.</Hint>
    </>
  );

  const uploaded = Boolean(D.banner.src) && D.banner.src[0] !== "g";
  const bannerControls = (
    <>
      <Lbl>Banner</Lbl>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={p.uploading} onClick={() => p.pickImage({ kind: "banner" })}>{D.banner.src ? "Replace image" : "Upload banner"}</Button>
        {D.banner.src ? <Button size="sm" variant="outline" onClick={() => setBanner({ src: "" }, true)}>Remove</Button> : null}
      </div>
      {uploaded ? (
        <>
          <Lbl>Focus left–right</Lbl>
          <input type="range" className="w-full accent-brand-700" min={0} max={100} value={D.banner.fx} aria-label="Focus left to right" onChange={(e) => setBanner({ fx: +e.target.value })} />
          <Lbl>Focus up–down</Lbl>
          <input type="range" className="w-full accent-brand-700" min={0} max={100} value={D.banner.fy} aria-label="Focus up to down" onChange={(e) => setBanner({ fy: +e.target.value })} />
          <Lbl htmlFor="balt">Alt text</Lbl>
          <TextInput id="balt" value={D.banner.alt} maxLength={300} placeholder="Describe the image" onChange={(e) => setBanner({ alt: e.target.value })} />
        </>
      ) : null}
      <Hint><b>Shared asset.</b> Every banner in this email shows this same image. Cropped to 600×200 automatically.</Hint>
    </>
  );

  /** An Image block: its own picture, width, description and link. */
  const imageEditor = (b: EmailBlock) => (
    <>
      <Lbl>Image</Lbl>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={p.uploading} onClick={() => p.pickImage({ kind: "image", blockId: b.id })}>{b.url ? "Replace image" : "Upload image"}</Button>
        {b.url ? <Button size="sm" variant="outline" onClick={() => setBlock({ url: undefined }, true)}>Remove</Button> : null}
      </div>
      <Lbl>Width</Lbl>
      <Seg label="Image width" value={String(b.w ?? 100) as "100" | "75" | "50"} onChange={(v) => setBlock({ w: Number(v) as 100 | 75 | 50 }, true)}
        options={IMAGE_WIDTHS.map((w) => ({ value: String(w) as "100" | "75" | "50", label: w === 100 ? "Full" : w === 75 ? "Medium" : "Small" }))} />
      <Lbl htmlFor="ialt">Alt text</Lbl>
      <TextInput id="ialt" value={b.alt ?? ""} maxLength={300} placeholder="Describe the image" onChange={(e) => setBlock({ alt: e.target.value })} />
      <Hint>Read aloud by screen readers and shown when pictures are blocked.</Hint>
      {linkField(b.link, (v) => setBlock({ link: v }), "iu", "Link URL (optional)")}
      <Hint>Or pick a placeholder in the Media tab.</Hint>
    </>
  );

  /** An Image grid: 2 or 3 pictures per row, up to six, each with its own description and link. */
  const galleryEditor = (b: EmailBlock) => {
    const imgs = b.imgs ?? [];
    const setImg = (i: number, patch: Partial<GalleryImage>, record = false) => setBlock({ imgs: imgs.map((x, j) => (j === i ? { ...x, ...patch } : x)) }, record);
    return (
      <>
        <Lbl>Columns</Lbl>
        <Seg label="Pictures per row" value={String(b.cols ?? 2) as "2" | "3"} onChange={(v) => setBlock({ cols: Number(v) as 2 | 3 }, true)} options={[{ value: "2", label: "2 per row" }, { value: "3", label: "3 per row" }]} />
        {imgs.map((x, i) => (
          <fieldset key={i} className="my-2.5 rounded-lg border border-mist p-2">
            <legend className="px-1 text-xs font-semibold text-ink">Image {i + 1}</legend>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" disabled={p.uploading} onClick={() => p.pickImage({ kind: "grid", blockId: b.id, index: i })}>{x.url ? "Replace" : "Upload"}</Button>
              {imgs.length > 1 ? <Button size="sm" variant="outline" aria-label={`Remove image ${i + 1}`} onClick={() => setBlock({ imgs: imgs.filter((_, j) => j !== i) }, true)}>Remove</Button> : null}
            </div>
            <Lbl htmlFor={`ga${i}`}>Alt text</Lbl>
            <TextInput id={`ga${i}`} value={x.alt} maxLength={300} placeholder="Describe the image" onChange={(e) => setImg(i, { alt: e.target.value })} />
            <Lbl htmlFor={`gu${i}`}>Link URL (optional)</Lbl>
            <TextInput id={`gu${i}`} inputMode="url" value={x.link} placeholder="https://example.com" onChange={(e) => setImg(i, { link: e.target.value })} />
          </fieldset>
        ))}
        {imgs.length < MAX_GALLERY_IMAGES
          ? <Button size="sm" variant="outline" onClick={() => setBlock({ imgs: [...imgs, blankGalleryImage()] }, true)}>Add another image</Button>
          : <Hint>Up to {MAX_GALLERY_IMAGES} images per grid.</Hint>}
        <Hint>Images are cropped to squares so the grid stays tidy.</Hint>
      </>
    );
  };

  const productList = (list: Product[], onChange: (next: Product[]) => void) => (
    <>
      <Lbl>Products</Lbl>
      {list.map((x, i) => {
        const set = (patch: Partial<Product>) => onChange(list.map((y, j) => (j === i ? { ...y, ...patch } : y)));
        return (
          <div key={i} className="mb-2.5">
            <div className="mb-1.5 flex gap-3">
              <TextInput className="min-w-0 flex-1" value={x.n} maxLength={120} aria-label={`Product ${i + 1} name`} onChange={(e) => set({ n: e.target.value })} />
              <TextInput className="min-w-0 flex-1" value={x.p} maxLength={60} aria-label="Price" onChange={(e) => set({ p: e.target.value })} />
            </div>
            <TextInput inputMode="url" value={x.u} placeholder="Link, https://…" aria-label={`Product ${i + 1} link`} onChange={(e) => set({ u: e.target.value })} />
          </div>
        );
      })}
    </>
  );

  /** The editors of the blocks that are more than one text box (the same for a template part and a custom block). */
  const extraEditor = (kind: string) => {
    const tpl = !custom;
    const date = tpl ? D.C.d : p.selBlock?.d ?? D.C.d;
    if (kind === "image" && p.selBlock) return imageEditor(p.selBlock);
    if (kind === "gallery" && p.selBlock) return galleryEditor(p.selBlock);
    if (kind === "columns") {
      const b = p.selBlock!;
      return (
        <>
          <Lbl htmlFor="colx">Left column</Lbl>
          <TextArea id="colx" rows={3} value={b.x ?? ""} maxLength={4000} onChange={(e) => setBlock({ x: e.target.value })} />
          <Lbl htmlFor="coly">Right column</Lbl>
          <TextArea id="coly" rows={3} value={b.y ?? ""} maxLength={4000} onChange={(e) => setBlock({ y: e.target.value })} />
        </>
      );
    }
    if (kind === "countdown") {
      return (
        <>
          <Lbl htmlFor="cdd">Counts down to</Lbl>
          <TextInput id="cdd" type="date" value={date} onChange={(e) => { if (!e.target.value) return; if (tpl) setC({ d: e.target.value }); else setBlock({ d: e.target.value }); }} />
        </>
      );
    }
    if (kind === "social") {
      return (
        <>
          {(p.selBlock?.soc ?? []).map((x, i) => (
            <div key={x.n}>
              <Lbl htmlFor={`soc${i}`}>{SOCIAL_NAMES[x.n] ?? x.n} link</Lbl>
              <TextInput id={`soc${i}`} inputMode="url" value={x.u} placeholder="https://…" onChange={(e) => setBlock({ soc: (p.selBlock?.soc ?? []).map((y, j) => (j === i ? { ...y, u: e.target.value } : y)) })} />
            </div>
          ))}
          <Hint>Icons without a link are left out of the sent email.</Hint>
        </>
      );
    }
    return productList(tpl ? D.C.p : p.selBlock?.p ?? [], (next) => (tpl ? setC({ p: next }) : setBlock({ p: next })));
  };

  const condField = (value: Cond | undefined) => (
    <>
      <Lbl htmlFor="cond">Show to</Lbl>
      <SelectBox id="cond" value={value ?? ""} onChange={(e) => setCond(e.target.value as Cond)}>
        {CONDITIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </SelectBox>
      <Hint>Everyone else won’t see this block.</Hint>
    </>
  );

  // ── The tabs ──
  const tplTab = (
    <>
      <p className="text-ink-muted">{custom ? "You’re in a custom layout. Pick a template to switch; you’ll see what carries over first." : "Templates have a fixed layout. You edit their content, not their structure."}</p>
      <div className="mt-3">
        {TEMPLATE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => p.askLayout(k)}
            aria-current={D.tpl === k ? "true" : undefined}
            className={cn("mb-2 block w-full rounded-lg border p-2.5 text-left", D.tpl === k ? "border-brand-700 bg-brand-50" : "border-mist bg-white hover:border-brand-500")}
          >
            <div className="flex items-center gap-3">
              <LayoutThumb layout={k} />
              <div><b className="text-ink">{TEMPLATE_NAMES[k]}</b><small className="block text-xs text-ink-muted">{TEMPLATE_BLURBS[k]}</small></div>
            </div>
          </button>
        ))}
        {custom ? (
          <button type="button" aria-current="true" onClick={() => p.askLayout("custom")} className="mb-2 block w-full rounded-lg border border-brand-700 bg-brand-50 p-2.5 text-left">
            <b className="text-ink">Custom layout</b><small className="block text-xs text-ink-muted">Free blocks, drag to reorder</small>
          </button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => p.askLayout("custom")}>Customize layout…</Button>
            <Hint>Switches to free-form blocks. You’ll see what carries over first.</Hint>
          </>
        )}
        {D.tray.length ? <Hint>Set aside from your custom layout: {D.tray.map((b) => BLOCK_LABELS[b.t]).join(", ")}. They return if you customize the layout again.</Hint> : null}
      </div>
    </>
  );

  const blocksTab = (
    <>
      <div className="grid grid-cols-2 gap-2">
        {ADDABLE_BLOCKS.map((t) => (
          <button key={t} type="button" onClick={() => p.addBlock(t)} className="rounded-lg border border-mist bg-white px-2 py-3 text-center text-[13px] text-ink hover:border-brand-700">{BLOCK_LABELS[t]}</button>
        ))}
      </div>
      <p className="mt-3 text-ink-muted">Click a block to add it below the selected one, or use + between blocks.</p>
    </>
  );

  let editTab: React.ReactNode;
  if (!custom) {
    const slot = p.slot;
    const field = slot ? SLOT_FIELD[slot] : undefined;
    let body: React.ReactNode;
    if (slot === "countdown" || slot === "products") body = extraEditor(slot);
    else if (slot === "logo") body = logoControls;
    else if (slot === "banner") body = bannerControls;
    else if (slot && field) {
      body = (
        <>
          <Lbl htmlFor="sx">{SLOT_LABEL[slot]}</Lbl>
          <TextArea id="sx" rows={field === "body" ? 6 : 3} value={D.C[field]} maxLength={field === "body" ? 8000 : 500} onChange={(e) => setC({ [field]: e.target.value } as Partial<Design["C"]>)} />
          {slot === "button" ? linkField(D.C.u, (v) => setC({ u: v })) : null}
          {slotFmt(slot as FmtSlot)}
          <Hint>The layout is fixed by the template.</Hint>
        </>
      );
    } else body = <p className="text-ink-muted">Select a part of the email to edit its content.</p>;
    editTab = <>{body}{slot && slot !== "footer" ? condField(D.cond[slot]) : null}</>;
  } else if (!p.selBlock) {
    editTab = <p className="text-ink-muted">Select a block in the email to edit it.</p>;
  } else {
    const b = p.selBlock;
    let body: React.ReactNode;
    if (EXTRA_EDITOR_BLOCKS.has(b.t)) body = <>{extraEditor(b.t)}{b.t === "columns" ? blockFmt(b) : null}</>;
    else if (b.x !== undefined) {
      body = (
        <>
          <Lbl htmlFor="bx">Text</Lbl>
          <TextArea id="bx" rows={5} value={b.x} maxLength={b.t === "text" ? 8000 : 500} onChange={(e) => setBlock({ x: e.target.value })} />
          {b.t === "button" ? linkField(b.u, (v) => setBlock({ u: v })) : null}
          {blockFmt(b)}
          <Hint>Insert variables from the Variables tab.</Hint>
        </>
      );
    } else if (b.t === "logo") body = logoControls;
    else if (b.t === "banner") body = bannerControls;
    else body = <p className="text-ink-muted">Nothing to edit on this block.</p>;
    editTab = <>{body}{b.t !== "footer" ? condField(b.cond) : null}</>;
  }

  const varsTab = (
    <>
      <p className="text-ink-muted">Click a variable to insert it. The fallback shows when a contact has no value.</p>
      <div className="mt-3">
        {p.variables.map((v) => (
          <div key={v.key} className="mb-2.5 flex items-center gap-2">
            <button type="button" onClick={() => p.insertVariable(v.key)} className="flex-none rounded-full px-2.5 py-0.5 text-[.92em]" style={{ background: emailCanvas.chipBg, color: emailCanvas.chipInk }}>{v.label}</button>
            <TextInput size="xs" className="min-w-0 flex-1" value={p.fallbacks[v.key] ?? ""} maxLength={100} placeholder="Fallback" aria-label={`Fallback for ${v.label}`} onChange={(e) => p.setFallback(v.key, e.target.value)} />
          </div>
        ))}
      </div>
    </>
  );

  const selectedPreset = p.selBlock?.t === "image" && !p.selBlock.url ? p.selBlock.g : undefined;
  const mediaTab = (
    <>
      {custom ? (
        <>
          <Lbl>Images</Lbl>
          <Button size="sm" variant="outline" disabled={p.uploading} onClick={() => p.pickImage({ kind: "image" })}>Upload a new image</Button>
          <Hint>Adds an image block. Each image block holds its own picture, so a campaign can carry as many as it needs.</Hint>
        </>
      ) : <Hint className="mb-1">Templates have one banner image. Choose Customize layout to add more images.</Hint>}
      {bannerControls}
      <Lbl>Presets</Lbl>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: GRADIENT_COUNT }, (_, i) => {
          const [a, b] = emailCanvas.gradients[i];
          return (
            <button
              key={i}
              type="button"
              aria-label={`Image ${i + 1}`}
              onClick={() => p.pickPreset(i)}
              className={cn("h-16 rounded-lg border-2 p-0", selectedPreset === i ? "border-brand-700" : "border-transparent")}
              style={{ background: `linear-gradient(135deg,${a},${b})` }}
            />
          );
        })}
      </div>
      <p className="mt-3 text-ink-muted">Selecting one changes the selected image, or adds a new image block. A selected banner, or any template, uses the shared banner image.</p>
    </>
  );

  const setColor = (c: string) => { p.mutate((d) => ({ ...d, design: { ...d.design, color: c } }), true); };
  const brandTab = (
    <>
      {logoControls}
      <Lbl>Brand color</Lbl>
      <Lbl htmlFor="bhex">Color</Lbl>
      <div className="flex items-center gap-2">
        <input type="color" aria-label="Pick any color" className="h-9 w-12 cursor-pointer rounded-lg border border-mist bg-white p-1" value={D.color} onChange={(e) => setColor(e.target.value.toLowerCase())} />
        <HexField value={D.color} onCommit={setColor} />
      </div>
      <Hint>The brand color is used for buttons, the countdown and social icons. Text on it switches between light and dark automatically so it stays readable.</Hint>
    </>
  );

  return (
    <aside
      aria-label="Editor panel"
      className={cn(
        "z-10 flex w-80 flex-none flex-col border-l border-mist bg-white",
        "max-[760px]:absolute max-[760px]:bottom-0 max-[760px]:right-0 max-[760px]:top-0 max-[760px]:w-[min(340px,88%)] max-[760px]:transition-transform max-[760px]:duration-200",
        p.open ? "min-[761px]:transition-[margin] min-[761px]:duration-200" : "invisible -mr-[321px] [transition:margin_.2s,visibility_0s_linear_.2s] max-[760px]:mr-0 max-[760px]:translate-x-[105%]",
      )}
    >
      <div className="flex items-center border-b border-mist">
        <div role="tablist" className="flex min-w-0 flex-1 overflow-x-auto px-2">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => p.setTab(k)}
              className={cn("flex-none whitespace-nowrap border-b-2 px-1.5 py-3 text-[13px] font-medium", tab === k ? "border-brand-700 text-ink" : "border-transparent text-ink-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Close panel" onClick={p.onClose} className="flex-none px-3 text-lg leading-none text-ink-muted hover:text-ink">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 text-[13px]">
        {tab === "tpl" ? tplTab : null}
        {tab === "blocks" ? blocksTab : null}
        {tab === "edit" ? editTab : null}
        {tab === "vars" ? varsTab : null}
        {tab === "media" ? mediaTab : null}
        {tab === "brand" ? brandTab : null}
      </div>
    </aside>
  );
}
