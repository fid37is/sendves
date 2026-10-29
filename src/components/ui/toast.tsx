"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import type { FormState } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

/**
 * Toasts are the only way the app reports errors, successes, warnings and information.
 * White card, pale-lavender (#e4dcef) accent; red text = error, green = success,
 * yellow = warning, deep navy = information.
 */
export type ToastKind = "error" | "success" | "warning" | "info";
type Item = { id: number; kind: ToastKind; message: string; duration: number };

const MAX_VISIBLE = 4;
const DURATION: Record<ToastKind, number> = { error: 9000, warning: 8000, success: 5000, info: 6000 };

let items: Item[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(kind: ToastKind, message: string) {
  const text = message.trim();
  if (!text) return;
  if (items.some((t) => t.kind === kind && t.message === text)) return; // no duplicate stacking
  items = [...items, { id: nextId++, kind, message: text, duration: DURATION[kind] }].slice(-MAX_VISIBLE);
  emit();
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  error: (message: string) => push("error", message),
  success: (message: string) => push("success", message),
  warning: (message: string) => push("warning", message),
  info: (message: string) => push("info", message),
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const styles: Record<ToastKind, { text: string; label: string; Icon: typeof Info }> = {
  error: { text: "text-danger", label: "Error", Icon: CircleAlert },
  success: { text: "text-success", label: "Success", Icon: CircleCheck },
  warning: { text: "text-warning", label: "Warning", Icon: TriangleAlert },
  info: { text: "text-navy", label: "Info", Icon: Info },
};

function ToastCard({ item }: { item: Item }) {
  const { text, label, Icon } = styles[item.kind];
  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      className="animate-toast-in group pointer-events-auto relative overflow-hidden rounded-2xl border border-lavender bg-white shadow-[0_14px_36px_-14px_rgba(11,18,51,0.35)]"
    >
      <div className="flex items-start gap-3 p-4 pr-10">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lavender-100 ring-1 ring-lavender">
          <Icon className={cn("h-[18px] w-[18px]", text)} aria-hidden="true" />
        </span>
        <div className={cn("min-w-0 text-sm", text)}>
          <p className="font-bold">{label}</p>
          <p className="mt-0.5 break-words font-medium leading-snug">{item.message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss notification"
        className="absolute right-2 top-2 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-lavender-100 hover:text-navy"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      {/* The countdown bar pauses while the toast is hovered or focused. */}
      <span
        aria-hidden="true"
        onAnimationEnd={() => dismiss(item.id)}
        className="absolute inset-x-0 bottom-0 h-1 origin-left bg-lavender [animation-fill-mode:forwards] [animation-name:toast-bar] [animation-timing-function:linear] group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${item.duration}ms` }}
      />
    </div>
  );
}

/** Mounted once in the root layout. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => [] as Item[]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-end gap-3 p-4 sm:p-5" aria-live="polite">
      <div className="flex w-full max-w-sm flex-col gap-3">
        {list.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </div>
    </div>
  );
}

/** For forms driven by useFormState: shows the returned message as a toast. */
export function useActionToast(state: FormState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.warning) toast.warning(state.warning);
    else if (state.info) toast.info(state.info);
    else if (state.success) toast.success(state.success);
  }, [state]);
}

const shown = new Set<string>();

/**
 * Shows server-provided toasts once. `id` identifies the message so re-renders and React
 * strict mode do not repeat it. Used for page-level status notices and for the flash cookie.
 */
export function PageToasts({ toasts, clearFlash = false }: { toasts: { id: string; kind: ToastKind; message: string }[]; clearFlash?: boolean }) {
  useEffect(() => {
    for (const t of toasts) {
      if (shown.has(t.id)) continue;
      shown.add(t.id);
      toast[t.kind](t.message);
    }
    if (clearFlash && toasts.length) document.cookie = "sv_flash=; Max-Age=0; path=/";
  }, [toasts, clearFlash]);
  return null;
}
