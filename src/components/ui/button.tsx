import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "light" | "outlineLight";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-white shadow-sm hover:bg-brand-800 hover:shadow-lg hover:shadow-brand-700/30",
  secondary: "bg-brand-50 text-brand-800 hover:bg-brand-100",
  outline: "border border-mist bg-white text-ink hover:border-ink/30 hover:bg-mist-100",
  ghost: "text-ink hover:bg-mist-100",
  danger: "bg-danger text-white hover:bg-danger/90",
  light: "bg-white text-brand-800 shadow-sm hover:bg-brand-50 hover:shadow-lg hover:shadow-night/30",
  outlineLight: "border border-white/30 bg-transparent text-white hover:bg-white/10",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-14 px-8 text-base",
};

type StyleOptions = { variant?: Variant; size?: Size; className?: string };

export function buttonStyles({ variant = "primary", size = "md", className }: StyleOptions = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & StyleOptions) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}

export function ButtonLink({
  href,
  variant,
  size,
  className,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & StyleOptions & { href: string }) {
  return <Link href={href} className={buttonStyles({ variant, size, className })} {...props} />;
}
