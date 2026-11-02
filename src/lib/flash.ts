import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type ToastKind = "error" | "success" | "warning" | "info";

export const FLASH_COOKIE = "sv_flash";
const MAX_MESSAGE = 500;

/**
 * Queues a toast for the next page load. Messages travel in a short-lived cookie rather than the
 * URL, so nobody can craft a link that makes the app display text of their choosing.
 * Call from server actions and route handlers only.
 */
export function flash(kind: ToastKind, message: string) {
  const payload = { id: randomBytes(6).toString("hex"), kind, message: message.slice(0, MAX_MESSAGE) };
  cookies().set(FLASH_COOKIE, JSON.stringify(payload), {
    path: "/",
    maxAge: 30,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false, // the toaster clears it after showing it
  });
}

const kinds = { ok: "success", err: "error", warn: "warning", info: "info" } as const;

/** Redirects to a page and shows a toast there: ok = success, err = error, warn = warning, info = information. One clear sentence. */
export function go(path: string, kind: keyof typeof kinds, message: string): never {
  flash(kinds[kind], message);
  redirect(path);
}
