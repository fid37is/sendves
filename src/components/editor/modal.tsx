"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * A dialog: focus moves in when it opens, Tab stays inside, Escape closes it (unless `closable` is
 * false, e.g. while a campaign is being queued) and focus goes back to where it was.
 */
export function Modal({ open, onClose, label, wide = false, closable = true, children }: {
  open: boolean; onClose: () => void; label: string; wide?: boolean; closable?: boolean; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closableRef = useRef(closable);
  closableRef.current = closable;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (closableRef.current) closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1], cur = document.activeElement;
      if (e.shiftKey && (cur === first || cur === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
      else if (!panel.current.contains(cur)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      const el = opener.current;
      if (el && el.isConnected) el.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-night/50" onClick={() => { if (closable) onClose(); }} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn("relative max-h-[92vh] w-full overflow-auto rounded-2xl border border-mist bg-white p-5 text-sm text-ink shadow-2xl shadow-night/30 focus:outline-none", wide ? "max-w-[780px]" : "max-w-[440px]")}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
