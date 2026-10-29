import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/* ---- Set these to match your logo file ---- */
const LOGO_SRC = "/logo.png"; // or "/logo.svg"
const LOGO_WIDTH = 160; // the file's real pixel width (any SVG size works if the ratio is right)
const LOGO_HEIGHT = 40; // the file's real pixel height
const SHOW_WORDMARK = true; // shows "Sendves" next to your icon
/* ------------------------------------------- */

export function LogoMark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <Image
      src={LOGO_SRC}
      alt={SHOW_WORDMARK ? "" : "Sendves"}
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority
      className={cn("w-auto transition-transform duration-300 group-hover/logo:scale-105", light && "brightness-0 invert", className)}
    />
  );
}

export function Logo({ href = "/", light = false, className }: { href?: string; light?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("logo group/logo inline-flex items-center gap-3 lg:gap-3.5", className)} aria-label="Sendves home">
      <LogoMark light={light} className="h-9 sm:h-12 lg:h-14" />
      {SHOW_WORDMARK ? (
        <span className={cn("font-display text-xl font-extrabold tracking-tight sm:text-2xl lg:text-3xl", light ? "text-white" : "text-ink")}>
          Send<span className={light ? "text-accent-400" : "text-brand-700"}>ves</span>
        </span>
      ) : null}
    </Link>
  );
}