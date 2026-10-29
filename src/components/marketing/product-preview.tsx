import { StatusBadge } from "@/components/ui/badge";

const stats = [
  { label: "Delivered", value: "98.4%" },
  { label: "Clicked", value: "6.2%" },
  { label: "Unsubscribed", value: "0.2%" },
];

const bars = [38, 52, 44, 68, 80, 62, 90];

/** Illustrative sample data only. Built with CSS so it needs no image assets. */
export function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="rounded-3xl border border-mist bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-ink-muted">Campaign</p>
            <p className="text-base font-bold text-ink">Autumn collection is here</p>
          </div>
          <StatusBadge status="sent" />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-mist-50 p-3">
              <p className="text-xs text-ink-muted">{s.label}</p>
              <p className="mt-1 text-xl font-extrabold text-ink">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl bg-mist-50 p-4">
          <p className="text-xs font-semibold text-ink-muted">Clicks over the first 7 hours</p>
          <div className="mt-3 flex h-24 items-end gap-2" role="img" aria-label="Bar chart of clicks rising over seven hours">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-brand-500" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-mist px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">Domain authentication</p>
            <p className="text-xs text-ink-muted">SPF, DKIM and DMARC checked</p>
          </div>
          <StatusBadge status="verified" />
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-ink-muted">Preview with sample data</p>
    </div>
  );
}
