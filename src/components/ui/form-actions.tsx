import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The row of buttons at the foot of a form. Always right-aligned, with the main action last (furthest right)
 * and any Cancel / secondary action before it.
 */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-3", className)}>{children}</div>;
}
