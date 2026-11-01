"use client";

import { Fragment, useRef, type KeyboardEvent, type ReactNode } from "react";
import { BLOCK_LABEL, gradientCss, isLink, type Brand, type DBlock, type Design, type Product } from "@/lib/email/design";
import { tokenParts, varLabel } from "./util";

/** Text with {{variables}} drawn as chips, so people see what will be filled in. */
function Chips({ text }: { text: string }) {
  return (
    <>
      {tokenParts(text ?? "").map((p, i) => (p.key ? <span key={i} className="chip">{varLabel(p.key)}</span> : <Fragment key={i}>{p.text}</Fragment>))}
    </>
  );
}

const pre = { whiteSpace: "pre-wrap" } as const;

function LogoNode({ brand }: { brand: Brand }) {
  const L = brand.logo;
  const z = { s: [80, 40], m: [120, 56], l: [170, 80] }[L.size];
  if (!L.src) return <div style={{ textAlign: L.align }}><span className="ph" style={{ display: "inline-block" }}>Add your logo</span></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <div style={{ textAlign: L.align }}><img src={L.src} alt="Logo" style={{ maxWidth: z[0], maxHeight: z[1], objectFit: "contain", display: "inline-block" }} /></div>;
}

function BannerNode({ design }: { design: Design }) {
  const B = design.banner;
  const box = { display: "block", width: "100%", aspectRatio: "3/1", borderRadius: 6 } as const;
  if (!B.src) return <div className="ph" style={{ aspectRatio: "3/1", display: "flex", alignItems: "center", justifyContent: "center" }}>Add banner · 600×200</div>;
  if (B.src[0] === "g") return <div style={{ ...box, background: gradientCss(Number(B.src.slice(1))) }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={B.src} alt={B.alt} style={{ ...box, objectFit: "cover", objectPosition: `${B.fx}% ${B.fy}%` }} />;
}

function Countdown({ date, color }: { date: string; color: string }) {
  const ms = Math.max(0, new Date(`${date}T09:00:00`).getTime() - Date.now());
  const v: [number, string][] = [[Math.floor(ms / 864e5), "Days"], [Math.floor(ms / 36e5) % 24, "Hours"], [Math.floor(ms / 6e4) % 60, "Mins"]];
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
      {v.map(([n, l]) => (
        <div key={l} style={{ background: color, color: "white", borderRadius: 8, padding: "10px 0", width: 76, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{n}</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

function Products({ items }: { items: Product[] }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {items.map((x, i) => (
        <div key={i} style={{ flex: "1 1 140px", textAlign: "center" }}>
          <div style={{ aspectRatio: "1", borderRadius: 8, background: gradientCss((i * 2) % 6) }} />
          <div style={{ marginTop: 6, fontWeight: 600 }}>{x.n}</div>
          <div style={{ color: "rgb(var(--c-ink-muted))" }}>{x.p}</div>
        </div>
      ))}
    </div>
  );
}

function Cta({ color, label, big }: { color: string; label: string; big?: boolean }) {
  return <span className="cta" style={{ background: color, ...(big ? { padding: "14px 40px", fontSize: 16 } : {}) }}><Chips text={label} /></span>;
}

function BlockBody({ b, design, brand }: { b: DBlock; design: Design; brand: Brand }) {
  const color = design.color;
  switch (b.t) {
    case "logo": return <LogoNode brand={brand} />;
    case "banner": return <BannerNode design={design} />;
    case "columns": return <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}><p style={{ flex: "1 1 200px", ...pre }}><Chips text={b.x ?? ""} /></p><p style={{ flex: "1 1 200px", ...pre }}><Chips text={b.y ?? ""} /></p></div>;
    case "countdown": return <Countdown date={b.d ?? design.C.d} color={color} />;
    case "products": return <Products items={b.p ?? []} />;
    case "social":
      return (
        <div style={{ textAlign: "center" }}>
          {(b.soc ?? []).map((s, i) => (
            <span key={i} aria-label={s.n} style={{ display: "inline-block", width: 30, height: 30, lineHeight: "30px", borderRadius: "50%", background: color, color: "white", fontSize: 11, fontWeight: 700, margin: "0 4px", opacity: isLink(s.u) ? 1 : 0.45 }}>{s.n}</span>
          ))}
        </div>
      );
    case "heading": return <h2><Chips text={b.x ?? ""} /></h2>;
    case "text": return <p style={pre}><Chips text={b.x ?? ""} /></p>;
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return b.img ? <img src={b.img} alt="" style={{ display: "block", width: "100%", borderRadius: 6 }} /> : <div className="img" style={{ background: gradientCss(b.g ?? 0) }}>Image</div>;
    case "button": return <Cta color={color} label={b.x ?? ""} />;
    case "divider": return <hr />;
    case "footer": return <div className="foot"><Chips text={b.x ?? ""} /><br /><u>Unsubscribe</u></div>;
  }
}

export type CanvasProps = {
  design: Design;
  brand: Brand;
  selBlock: number | null;
  selSlot: string | null;
  onSlot: (slot: string) => void;
  onBlock: (id: number) => void;
  onInsert: (index: number) => void;
  onMove: (id: number, dir: -1 | 1) => void;
  onDelete: (id: number) => void;
  onReorder: (fromId: number, toId: number) => void;
};

const clickOnKey = (e: KeyboardEvent<HTMLElement>) => {
  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.currentTarget.click(); }
};

/** The email being edited. Templates show clickable sections; a custom layout shows draggable blocks. */
export function Canvas(p: CanvasProps) {
  const { design, brand } = p;
  const drag = useRef<number | null>(null);

  if (design.tpl !== "custom") {
    const C = design.C;
    const color = design.color;
    const slot = (name: string, node: ReactNode) => (
      <div
        key={name}
        className={`blk slot${p.selSlot === name ? " sel" : ""}`}
        tabIndex={0}
        role="group"
        aria-label={`${name} section${p.selSlot === name ? ", selected" : ""}`}
        onClick={() => p.onSlot(name)}
        onKeyDown={clickOnKey}
      >
        {design.cond[name] ? <span className="cnd">Conditional</span> : null}
        {node}
      </div>
    );
    const logo = <LogoNode brand={brand} />;
    const banner = <BannerNode design={design} />;
    const center = (n: ReactNode) => <div style={{ textAlign: "center" }}>{n}</div>;
    const head = (size?: number) => <h2 style={{ textAlign: "center", ...(size ? { fontSize: size } : {}) }}><Chips text={C.headline} /></h2>;
    const body = <p style={{ textAlign: "center", ...pre }}><Chips text={C.body} /></p>;
    const btn = (big?: boolean) => center(<Cta color={color} label={C.btn} big={big} />);
    const foot = <div className="foot"><Chips text={C.foot} /><br /><u>Unsubscribe</u></div>;
    let body_: ReactNode;
    switch (design.tpl) {
      case "event": body_ = <>{slot("logo", logo)}{slot("banner", banner)}{slot("headline", head())}{slot("countdown", <Countdown date={C.d} color={color} />)}{slot("body", body)}{slot("button", btn())}{slot("footer", foot)}</>; break;
      case "product": body_ = <>{slot("logo", logo)}{slot("headline", head())}{slot("products", <Products items={C.p} />)}{slot("body", body)}{slot("button", btn())}{slot("footer", foot)}</>; break;
      case "newsletter": body_ = <>{slot("logo", logo)}<div style={{ padding: "0 28px" }}><hr /></div>{slot("headline", head(30))}{slot("body", body)}{slot("banner", banner)}{slot("button", btn())}{slot("footer", foot)}</>; break;
      case "promo": body_ = <><div style={{ background: color }}>{slot("logo", logo)}</div>{slot("banner", banner)}{slot("headline", head(34))}{slot("body", body)}{slot("button", btn(true))}{slot("footer", foot)}</>; break;
      default: body_ = <>{slot("logo", logo)}{slot("banner", banner)}{slot("headline", <h2><Chips text={C.headline} /></h2>)}{slot("body", <p style={pre}><Chips text={C.body} /></p>)}{slot("button", <Cta color={color} label={C.btn} />)}{slot("footer", foot)}</>;
    }
    return <div className="mail" id="mail">{body_}</div>;
  }

  return (
    <div className="mail" id="mail">
      {design.blocks.map((b, i) => (
        <Fragment key={b.id}>
          <div className="add"><button type="button" aria-label="Add block here" onClick={() => p.onInsert(i)}>+</button></div>
          <div
            className={`blk${p.selBlock === b.id ? " sel" : ""}`}
            draggable
            tabIndex={0}
            role="group"
            aria-label={`${BLOCK_LABEL[b.t]} block${p.selBlock === b.id ? ", selected" : ""}`}
            onClick={() => p.onBlock(b.id)}
            onKeyDown={clickOnKey}
            onDragStart={(e) => { drag.current = b.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(b.id)); }}
            onDragOver={(e) => { if (drag.current === null) return; e.preventDefault(); e.currentTarget.classList.add("over"); }}
            onDragLeave={(e) => e.currentTarget.classList.remove("over")}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("over"); if (drag.current !== null && drag.current !== b.id) p.onReorder(drag.current, b.id); drag.current = null; }}
            onDragEnd={() => { drag.current = null; }}
          >
            {b.cond ? <span className="cnd">Conditional</span> : null}
            <BlockBody b={b} design={design} brand={brand} />
            <div className="del">
              <button type="button" aria-label="Move up" onClick={(e) => { e.stopPropagation(); p.onMove(b.id, -1); }}>↑</button>
              <button type="button" aria-label="Move down" onClick={(e) => { e.stopPropagation(); p.onMove(b.id, 1); }}>↓</button>
              <button type="button" data-del aria-label={`Remove ${BLOCK_LABEL[b.t]} block`} onClick={(e) => { e.stopPropagation(); p.onDelete(b.id); }}>Remove</button>
            </div>
          </div>
        </Fragment>
      ))}
      <div className="add"><button type="button" aria-label="Add block here" onClick={() => p.onInsert(design.blocks.length)}>+</button></div>
    </div>
  );
}
