import { cn } from "@/lib/utils";

/**
 * The loading spinner: a solid ring with a bright arc that spins fast. It uses the current text colour, so it
 * is white on a primary button and dark on an outline one, and it keeps spinning even when the person has
 * reduced motion on (a loading indicator that stops looks like a frozen page).
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("spinner h-5 w-5 shrink-0", className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}