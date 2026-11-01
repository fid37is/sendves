"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A modal dialog: focus moves in when it opens, Tab stays inside, Escape closes it (unless `locked`),
 * and focus returns to what opened it.
 */
export function Dialog({ open, onClose, label, wide, locked, children }: { open: boolean; onClose: () => void; label: string; wide?: boolean; locked?: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const t = setTimeout(() => box.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      const el = opener.current as HTMLElement | null;
      if (el && el.isConnected && el.offsetParent !== null) el.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>("button:not([disabled]),input,select,textarea,a[href]")].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === first || cur === box.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose, locked]);

  return (
    <div className={`ov${open ? " open" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}>
      <div ref={box} className={`modal pop${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {open ? children : null}
      </div>
    </div>
  );
}
