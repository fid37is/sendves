// src/components/dashboard/drawer.tsx
"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const ANIMATION_MS = 350; // keep in sync with the duration-[350ms] classes below
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Icon shown in the header badge. */
  icon?: ReactNode;
  /** Scrollable body. */
  children: ReactNode;
  /** Pinned to the bottom of the panel (actions, consent, …). */
  footer?: ReactNode;
  /** While true the drawer can't be dismissed (Escape, backdrop and the close button are ignored). */
  busy?: boolean;
  /** Tailwind max-width class for the panel. */
  widthClass?: string;
  /** Called once the panel has slid in, with the panel element. Use it to move focus. */
  onOpened?: (panel: HTMLElement) => void;
};

/**
 * Universal right-side drawer for the dashboard. Controlled: the parent owns `open`.
 *
 * It renders in a portal, locks page scroll, closes on Escape or backdrop click, keeps Tab focus
 * inside the panel and returns focus to whatever opened it. Content stays mounted only while open,
 * so keep any draft state in the parent if it should survive closing.
 *
 * The footer sits outside `children`, so a submit button there should use the `form="<id>"`
 * attribute to submit a form in the body. Render <Drawer> as a sibling of any page <form>, not
 * inside it: React events from a portal still bubble through the React tree.
 */
export function Drawer({ open, onClose, title, description, icon, children, footer, busy = false, widthClass = "max-w-[34rem]", onOpened }: DrawerProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  const [mounted, setMounted] = useState(false); // in the DOM
  const [visible, setVisible] = useState(false); // slid in

  // Mount on open; slide out then unmount on close.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      timer.current = setTimeout(() => {
        setVisible(true);
        if (panelRef.current) onOpenedRef.current?.(panelRef.current);
      }, 16);
    } else if (mounted) {
      setVisible(false);
      timer.current = setTimeout(() => {
        setMounted(false);
        openerRef.current?.focus?.();
      }, ANIMATION_MS);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const requestClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  // Lock page scroll while mounted.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Escape closes; Tab stays inside the panel.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, requestClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div
        aria-hidden="true"
        onClick={requestClose}
        className={cn(
          "absolute inset-0 bg-night/50 backdrop-blur-[2px] transition-opacity duration-[350ms] ease-out motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col bg-canvas shadow-2xl shadow-night/30 transition-transform duration-[350ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none sm:rounded-l-3xl",
          widthClass,
          visible ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-mist px-6 py-5">
          <div className="flex items-start gap-3">
            {icon ? (
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100 text-brand-800 ring-1 ring-accent-200">
                {icon}
              </span>
            ) : null}
            <div>
              <h2 id={titleId} className="text-lg font-bold text-ink">{title}</h2>
              {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-mist-100 hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="border-t border-mist bg-white px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
