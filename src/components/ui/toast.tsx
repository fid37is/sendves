"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import type { FormState } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

/**
 * Toasts are the only way the app reports errors, successes, warnings and information.
 * Compact dark pill: coloured icon (red = error, green = success, amber = warning, blue = info)
 * and a short message. Keep messages under about 8 words.
 */
export type ToastKind = "error" | "success" | "warning" | "info";
type Item = { id: number; kind: ToastKind; message: string; duration: number };

const MAX_VISIBLE = 4;
const DURATION: Record<ToastKind, number> = { error: 5000, warning: 5000, success: 3500, info: 4000 };

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

const styles: Record<ToastKind, { icon: string; Icon: typeof Info }> = {
  error: { icon: "text-red-400", Icon: CircleAlert },
  success: { icon: "text-emerald-400", Icon: CircleCheck },
  warning: { icon: "text-amber-400", Icon: TriangleAlert },
  info: { icon: "text-sky-300", Icon: Info },
};

/** One line: a coloured icon, the message, a close button. No titles, no countdown bar. */
function ToastCard({ item }: { item: Item }) {
  const { icon, Icon } = styles[item.kind];
  // Auto-dismiss; hovering or focusing the toast pauses the countdown.
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dismiss(item.id), item.duration);
  }, [item.id, item.duration]);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => {
    start();
    return stop;
  }, [start]);

  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      onMouseEnter={stop}
      onMouseLeave={start}
      onFocus={stop}
      onBlur={start}
      className="animate-toast-in pointer-events-auto flex items-center gap-2.5 rounded-xl bg-night py-2.5 pl-3.5 pr-2 text-sm text-white shadow-lg shadow-night/25 ring-1 ring-white/10"
    >
      <Icon className={cn("h-[18px] w-[18px] shrink-0", icon)} aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words font-medium leading-snug">{item.message}</p>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Mounted once in the root layout. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => [] as Item[]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-end gap-2 p-3 sm:p-5" aria-live="polite">
      <div className="flex w-full max-w-xs flex-col gap-2">
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
