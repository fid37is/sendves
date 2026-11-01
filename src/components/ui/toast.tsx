"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import type { FormState } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

/**
 * Toasts are the only way the app reports errors, successes, warnings and information.
 * One short, clear sentence each, like "Incorrect email or password. Try again." No titles, no
 * second line. Identical toasts merge into one with a count, and at most three show at once.
 */
export type ToastKind = "error" | "success" | "warning" | "info";
type Item = { id: number; rev: number; kind: ToastKind; message: string; count: number; duration: number };

const MAX_VISIBLE = 3;
const BASE_MS: Record<ToastKind, number> = { error: 6500, warning: 6000, success: 3500, info: 4500 };
const MAX_MS = 14000;

let items: Item[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const lifetime = (kind: ToastKind, text: string) => Math.min(MAX_MS, BASE_MS[kind] + Math.max(0, text.length - 40) * 45);

function push(kind: ToastKind, message: string) {
  const text = message.trim();
  if (!text) return;
  const same = items.find((t) => t.kind === kind && t.message === text);
  if (same) {
    // Same toast again: count it and restart its timer rather than stacking another card.
    items = items.map((t) => (t.id === same.id ? { ...t, count: t.count + 1, rev: t.rev + 1 } : t));
  } else {
    items = [...items, { id: nextId++, rev: 0, kind, message: text, count: 1, duration: lifetime(kind, text) }].slice(-MAX_VISIBLE);
  }
  emit();
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function clearAll() {
  items = [];
  emit();
}

/** Turns anything thrown into a sentence a person can act on. */
export function describeError(err: unknown, fallback = ""): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const msg = raw.trim();
  if (!msg) return fallback;
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg)) return "Can’t reach the server. Check your connection and try again.";
  if (/timeout|timed out|aborted/i.test(msg)) return "The request took too long. Try again.";
  // Next.js hides server errors in production behind a generic digest message.
  if (/an error occurred in the server components render|digest/i.test(msg)) return fallback || "Something went wrong on our side. Try again.";
  return msg.length > 300 ? `${msg.slice(0, 297)}…` : msg;
}

export const toast = {
  error: (message: string) => push("error", message),
  success: (message: string) => push("success", message),
  warning: (message: string) => push("warning", message),
  info: (message: string) => push("info", message),
  /** One clear sentence for a failure: the real reason if there is one, otherwise the fallback. `toast.fail("Try again.", err)` */
  fail: (fallback: string, err?: unknown) => push("error", describeError(err, fallback)),
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const styles: Record<ToastKind, { icon: string; bar: string; Icon: typeof Info }> = {
  error: { icon: "text-red-400", bar: "bg-red-400", Icon: CircleAlert },
  success: { icon: "text-emerald-400", bar: "bg-emerald-400", Icon: CircleCheck },
  warning: { icon: "text-amber-400", bar: "bg-amber-400", Icon: TriangleAlert },
  info: { icon: "text-sky-300", bar: "bg-sky-300", Icon: Info },
};

/** A coloured icon, one message, a repeat count and a close button. */
function ToastCard({ item }: { item: Item }) {
  const { icon, Icon } = styles[item.kind];
  // Auto-dismiss; hovering, focusing or expanding the toast pauses the countdown.
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dismiss(item.id), item.duration);
  }, [item.id, item.duration]);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => {
    start();
    return stop;
  }, [start, item.rev]);

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
      <p className="min-w-0 flex-1 break-words font-medium leading-snug">
        {item.message}
        {item.count > 1 ? <span className="ml-2 rounded-full bg-white/15 px-1.5 py-px align-middle text-[11px] font-bold">×{item.count}</span> : null}
      </p>
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
      <div className="flex w-full max-w-sm flex-col gap-2">
        {list.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
        {list.length > 1 ? (
          <button
            type="button"
            onClick={clearAll}
            className="pointer-events-auto self-end rounded-full bg-night/90 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10 transition-colors hover:text-white"
          >
            Clear all
          </button>
        ) : null}
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
