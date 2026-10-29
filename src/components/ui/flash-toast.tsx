import { cookies } from "next/headers";
import { FLASH_COOKIE } from "@/lib/flash";
import { PageToasts, type ToastKind } from "@/components/ui/toast";

const KINDS: ToastKind[] = ["error", "success", "warning", "info"];

/**
 * Server component: turns the one-shot flash cookie set by a server action into a toast.
 * Include it once in any layout or page that server actions redirect back to.
 */
export function FlashToast() {
  const raw = cookies().get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const f = JSON.parse(raw) as { id?: unknown; kind?: unknown; message?: unknown };
    if (typeof f.id !== "string" || typeof f.message !== "string" || !KINDS.includes(f.kind as ToastKind)) return null;
    return <PageToasts clearFlash toasts={[{ id: `flash-${f.id}`, kind: f.kind as ToastKind, message: f.message.slice(0, 500) }]} />;
  } catch {
    return null;
  }
}
