"use client";

import { Button } from "@/components/ui/button";
import { emailCanvas } from "@/config/brand";
import {
  ADDABLE_BLOCKS, BLOCK_LABELS, BRAND_COLORS, CONDITIONS, EXTRA_EDITOR_BLOCKS, GRADIENT_COUNT, TEMPLATE_BLURBS, TEMPLATE_KEYS, TEMPLATE_NAMES,
  type BlockType, type Cond, type Design, type EmailBlock, type Layout, type Logo, type Product, type SlotKey, type Tab,
} from "@/lib/email/campaign";
import { cn } from "@/lib/utils";
import { Hint, Lbl, LayoutThumb, Seg, SelectBox, TextArea, TextInput } from "@/components/editor/controls";
import type { Doc } from "@/components/editor/types";

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
  pickImage: (kind: "logo" | "banner") => void;
  uploading: boolean;
  /** Every variable the email can use, with how it is named. */
  variables: { key: string; label: string }[];
  fallbacks: Record<string, string>;
  setFallback: (key: string, value: string) => void;
  insertVariable: (key: string) => void;
  pickPreset: (g: number) => void;
};

/** The right-hand panel: Templates, Blocks, Edit, Variables, Media and Brand. */
export function SidePanel(p: PanelProps) {
  const { design: D, logo } = p;
  const custom = D.tpl === "custom";
  const tab: Tab = p.tab === "blocks" && !custom ? "tpl" : p.tab;
  const tabs: [Tab, string][] = [["tpl", "Templates"], ...(custom ? ([["blocks", "Blocks"]] as [Tab, string][]) : []), ["edit", "Edit"], ["vars", "Variables"], ["media", "Media"], ["brand", "Brand"]];

  // ── Ways to change the design (typing is not recorded for Undo; structural changes are) ──
  const setDesign = (fn: (d: Design) => Design, record = false) => p.mutate((doc) => ({ ...doc, design: fn(doc.design) }), record);
  const setC = (patch: Partial<Design["C"]>) => setDesign((d) => ({ ...d, C: { ...d.C, ...patch } }));
  const setBlock = (patch: Partial<EmailBlock>) => { const id = p.selBlock?.id; if (id) setDesign((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) })); };
  const setBanner = (patch: Partial<Design["banner"]>, record = false) => setDesign((d) => ({ ...d, banner: { ...d.banner, ...patch } }), record);
  const setLogo = (patch: Partial<Logo>) => p.mutate((doc) => ({ ...doc, logo: { ...doc.logo, ...patch } }), true);
  const setCond = (v: Cond) => {
    if (!custom && p.slot) { const slot = p.slot; setDesign((d) => ({ ...d, cond: { ...d.cond, [slot]: v } })); }
    else setBlock({ cond: v });
  };

  // ── Pieces shared by several tabs ──
  const linkField = (url: string | undefined, onChange: (v: string) => void) => (
    <>
      <Lbl htmlFor="bu">Link URL</Lbl>
      <TextInput id="bu" inputMode="url" value={url ?? ""} placeholder="https://example.com" onChange={(e) => onChange(e.target.value)} />
      <Hint>Starts with https:// or mailto:</Hint>
    </>
  );

  const logoControls = (
    <>
      <Lbl>Logo</Lbl>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={p.uploading} onClick={() => p.pickImage("logo")}>{logo.src ? "Replace logo" : "Upload logo"}</Button>
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
        <Button size="sm" variant="outline" disabled={p.uploading} onClick={() => p.pickImage("banner")}>{D.banner.src ? "Replace image" : "Upload banner"}</Button>
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
    if (EXTRA_EDITOR_BLOCKS.has(b.t)) body = extraEditor(b.t);
    else if (b.x !== undefined) {
      body = (
        <>
          <Lbl htmlFor="bx">Text</Lbl>
          <TextArea id="bx" rows={5} value={b.x} maxLength={b.t === "text" ? 8000 : 500} onChange={(e) => setBlock({ x: e.target.value })} />
          {b.t === "button" ? linkField(b.u, (v) => setBlock({ u: v })) : null}
          <Hint>Insert variables from the Variables tab.</Hint>
        </>
      );
    } else if (b.t === "logo") body = logoControls;
    else if (b.t === "banner") body = bannerControls;
    else if (b.t === "image") body = <p className="text-ink-muted">Pick an image in the Media tab.</p>;
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

  const brandTab = (
    <>
      {logoControls}
      <Lbl>Brand color</Lbl>
      <div className="mt-1.5 flex gap-2">
        {BRAND_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            aria-pressed={D.color === c}
            onClick={() => p.mutate((d) => ({ ...d, design: { ...d.design, color: c } }), true)}
            className={cn("h-7 w-7 rounded-full border-2", D.color === c ? "border-ink" : "border-transparent")}
            style={{ background: c }}
          />
        ))}
      </div>
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
