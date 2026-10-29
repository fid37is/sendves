// src/components/ui/confirm.tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * THE confirmation dialog. Nothing in the product uses window.confirm / alert / prompt.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete this list?", description: "…", tone: "danger" }))) return;
 *
 * For a button that submits a server action after confirming, use <ConfirmSubmitButton>.
 * <ConfirmProvider> is mounted once in the root layout.
 */

const ANIMATION_MS = 200; // keep in sync with the duration-200 classes below
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  /** Defaults to "Delete" for the danger tone and "Continue" otherwise. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for anything destructive: it uses the muted red and focuses Cancel first. */
  tone?: "danger" | "default";
};

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Resolves true when the person confirms, false when they cancel, press Escape or click outside. */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>.");
  return confirm;
}

type DialogProps = ConfirmOptions & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** The modal itself. Rendered by <ConfirmProvider>; use it directly only for a controlled dialog. */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = "Cancel", tone = "default", onConfirm, onCancel }: DialogProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const danger = tone === "danger";

  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const [mounted, setMounted] = useState(false); // in the DOM
  const [visible, setVisible] = useState(false); // faded in

  // Mount on open; fade out then unmount on close. Focus goes to Cancel for danger, Confirm otherwise.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      timer.current = setTimeout(() => {
        setVisible(true);
        panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
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

  // Lock page scroll while mounted.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Escape cancels and Tab stays inside the dialog. This listens on window during the capture phase and
  // stops those keys there, so a drawer underneath (e.g. List settings) doesn't also react to them.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      e.stopPropagation();
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mounted]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    // z-[95]: above drawers (z-90), below toasts (z-100).
    <div className="fixed inset-0 z-[95] flex items-end justify-center p-4 sm:items-center">
      <div
        aria-hidden="true"
        onClick={onCancel}
        className={cn(
          "absolute inset-0 bg-night/50 backdrop-blur-[2px] transition-opacity duration-200 ease-out motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "relative w-full max-w-md rounded-3xl bg-canvas p-6 shadow-2xl shadow-night/30 transition-all duration-200 ease-out motion-reduce:transition-none",
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.97] opacity-0",
        )}
      >
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1",
              danger ? "bg-danger-soft text-danger ring-danger/20" : "bg-accent-100 text-brand-800 ring-accent-200",
            )}
          >
            {danger ? <TriangleAlert className="h-5 w-5" aria-hidden="true" /> : <Info className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-ink">{title}</h2>
            {description ? <div id={descId} className="mt-1.5 text-sm leading-relaxed text-ink-soft">{description}</div> : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} {...(danger ? { "data-autofocus": "" } : {})}>{cancelLabel}</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} {...(danger ? {} : { "data-autofocus": "" })}>
            {confirmLabel ?? (danger ? "Delete" : "Continue")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Mounted once in the root layout. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const [open, setOpen] = useState(false);
  const resolver = useRef<((result: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false); // a newer request replaces one that is still open
      resolver.current = resolve;
      setOptions(next);
      setOpen(true);
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpen(false);
  }, []);

  useEffect(() => () => resolver.current?.(false), []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog open={open} {...options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
    </ConfirmContext.Provider>
  );
}

// ── A button that confirms, then submits a server action ────────────

function PendingButton({ onClick, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return <Button {...props} onClick={onClick} disabled={pending || props.disabled} />;
}

/**
 * For server-rendered pages: a form with hidden fields whose button asks first. Only submits when the
 * person confirms.
 *   <ConfirmSubmitButton action={deleteCampaignAction} fields={{ id }} confirm={{ title: "Delete?", tone: "danger" }}>Delete</ConfirmSubmitButton>
 */
export function ConfirmSubmitButton({
  action, fields, confirm: options, variant, size, className, children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
  confirm: ConfirmOptions;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
  children: ReactNode;
}) {
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <form ref={formRef} action={action}>
      {Object.entries(fields ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <PendingButton
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={async () => {
          if (await confirm(options)) formRef.current?.requestSubmit();
        }}
      >
        {children}
      </PendingButton>
    </form>
  );
}

function PendingIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={onClick}
      className="rounded-full p-2 text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/**
 * Icon-only version of <ConfirmSubmitButton> for table rows. `label` is the accessible name and tooltip.
 *   <ConfirmIconButton label="Delete X" action={deleteCampaignAction} fields={{ id }} confirm={{ … }}><Trash2 className="h-4 w-4" /></ConfirmIconButton>
 */
export function ConfirmIconButton({
  action, fields, confirm: options, label, children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
  confirm: ConfirmOptions;
  label: string;
  children: ReactNode;
}) {
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <form ref={formRef} action={action} className="inline-flex">
      {Object.entries(fields ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <PendingIconButton
        label={label}
        onClick={async () => {
          if (await confirm(options)) formRef.current?.requestSubmit();
        }}
      >
        {children}
      </PendingIconButton>
    </form>
  );
}