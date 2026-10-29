import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-mist-100 text-ink-soft",
  brand: "bg-brand-50 text-brand-800",
  success: "bg-green-50 text-green-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

const statusTone: Record<string, Tone> = {
  draft: "neutral",
  scheduled: "brand",
  sending: "brand",
  sent: "success",
  paused: "warning",
  cancelled: "neutral",
  failed: "danger",
  subscribed: "success",
  unsubscribed: "neutral",
  bounced: "warning",
  complained: "danger",
  cleaned: "neutral",
  active: "success",
  review: "warning",
  suspended: "danger",
  verified: "success",
  pending: "warning",
  open: "danger",
  resolved: "success",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? "neutral"}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}
