import { cn } from "@/lib/utils";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
  /** Fills the area under the line. */
  area?: boolean;
  dashed?: boolean;
};

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US");

function niceMax(max: number): number {
  if (max <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((k) => k * pow >= max) ?? 10;
  return Math.max(4, step * pow);
}

function label(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Dependency-free line/area chart rendered as SVG on the server. Hover any day for exact values
 * (native tooltip), and the legend below doubles as the colour key.
 */
export function TrendChart({
  dates,
  series,
  height = 260,
  ariaLabel,
  className,
}: {
  dates: string[];
  series: ChartSeries[];
  height?: number;
  ariaLabel: string;
  className?: string;
}) {
  const W = 760;
  const H = height;
  const pad = { l: 46, r: 14, t: 14, b: 30 };
  const n = dates.length;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const rawMax = Math.max(0, ...series.flatMap((s) => s.values));
  const maxY = niceMax(rawMax);
  const empty = rawMax === 0;

  const x = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.t + (1 - v / maxY) * innerH;
  const step = n <= 1 ? innerW : innerW / (n - 1);
  const ticks = [0, 1, 2, 3, 4].map((t) => (maxY / 4) * t);
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#E4DCEF" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 5"} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#6B7290">{compact.format(t)}</text>
          </g>
        ))}

        {dates.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={d} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="#6B7290">{label(d)}</text>
          ) : null,
        )}

        {series.map((s) => {
          const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
          const line = `M${pts.join(" L")}`;
          return (
            <g key={s.key}>
              {s.area && n > 1 ? <path d={`${line} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`} fill={s.color} fillOpacity={0.1} /> : null}
              <path d={line} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "5 5" : undefined} />
            </g>
          );
        })}

        {/* Hover columns: one per day, with a guide line and an exact-values tooltip. */}
        {dates.map((d, i) => (
          <g key={`h${d}`} className="group">
            <line x1={x(i)} x2={x(i)} y1={pad.t} y2={pad.t + innerH} stroke="#0B1233" strokeOpacity={0.25} strokeWidth={1} className="opacity-0 transition-opacity group-hover:opacity-100" />
            {series.map((s) => (
              <circle key={s.key} cx={x(i)} cy={y(s.values[i] ?? 0)} r={3.5} fill="#fff" stroke={s.color} strokeWidth={2} className="opacity-0 transition-opacity group-hover:opacity-100" />
            ))}
            <rect x={x(i) - step / 2} y={pad.t} width={Math.max(step, 4)} height={innerH} fill="transparent">
              <title>{`${label(d)}\n${series.map((s) => `${s.label}: ${full.format(s.values[i] ?? 0)}`).join("\n")}`}</title>
            </rect>
          </g>
        ))}

        {empty ? (
          <text x={pad.l + innerW / 2} y={pad.t + innerH / 2} textAnchor="middle" fontSize={13} fill="#6B7290">No activity in this period yet</text>
        ) : null}
      </svg>

      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-semibold text-ink-soft">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2">
            <span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: s.color, ...(s.dashed ? { backgroundImage: "none", opacity: 0.8 } : {}) }} aria-hidden="true" />
            {s.label}
            <span className="font-medium text-ink-muted">{full.format(s.values.reduce((a, b) => a + b, 0))}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Horizontal bars for ranked lists: top links, campaign click rates, plan mix. */
export function BarList({
  items,
  format = (v: number) => full.format(v),
  barClass = "bg-brand-700",
  empty = "Nothing to show yet.",
}: {
  items: { label: string; value: number; sub?: string; href?: string; title?: string }[];
  format?: (v: number) => string;
  barClass?: string;
  empty?: string;
}) {
  if (items.length === 0) return <p className="px-6 py-10 text-center text-sm text-ink-muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-4 p-6">
      {items.map((it) => (
        <li key={it.label}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0 truncate font-semibold text-ink" title={it.title ?? it.label}>
              {it.href ? <a href={it.href} className="hover:text-brand-800 hover:underline">{it.label}</a> : it.label}
            </span>
            <span className="shrink-0 font-bold text-ink">{format(it.value)}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-lavender-100">
            <div className={cn("h-2 rounded-full", barClass)} style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
          </div>
          {it.sub ? <p className="mt-1 text-xs text-ink-muted">{it.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** A delivery funnel: each stage as a share of the first. */
export function Funnel({ stages }: { stages: { label: string; value: number; note?: string }[] }) {
  const top = Math.max(stages[0]?.value ?? 0, 1);
  return (
    <ol className="space-y-3 p-6">
      {stages.map((s, i) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-ink">{s.label}</span>
            <span className="text-ink-muted">
              <strong className="text-ink">{full.format(s.value)}</strong>
              {i > 0 && stages[0].value > 0 ? ` · ${((s.value / top) * 100).toFixed(1)}%` : ""}
            </span>
          </div>
          <div className="mt-1.5 h-7 rounded-lg bg-lavender-100">
            <div
              className={cn("h-7 rounded-lg", i === 0 ? "bg-navy" : i === stages.length - 1 ? "bg-brand-700" : "bg-navy-700")}
              style={{ width: `${Math.max(s.value > 0 ? 2 : 0, (s.value / top) * 100)}%`, opacity: i === 0 ? 1 : 0.9 }}
            />
          </div>
          {s.note ? <p className="mt-1 text-xs text-ink-muted">{s.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/** Segmented range picker (links, so it works without JavaScript). */
export function RangeTabs({ basePath, current, options = [7, 30, 90] }: { basePath: string; current: number; options?: number[] }) {
  return (
    <nav className="inline-flex rounded-full border border-lavender bg-white p-1" aria-label="Date range">
      {options.map((d) => (
        <a
          key={d}
          href={`${basePath}?range=${d}`}
          aria-current={d === current ? "true" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
            d === current ? "bg-navy text-white" : "text-ink-soft hover:bg-lavender-100",
          )}
        >
          {d} days
        </a>
      ))}
    </nav>
  );
}
