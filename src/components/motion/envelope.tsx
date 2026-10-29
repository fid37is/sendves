import { cn } from "@/lib/utils";

export function EnvelopeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 40 28" className={className} style={style} fill="none" aria-hidden="true">
      <rect x="1" y="1" width="38" height="26" rx="5" fill="#fff" />
      <path d="M4 6l16 11L36 6" stroke="#1D4ED8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const flights = [
  { top: 18, width: 44, d: 19, delay: -3 },
  { top: 46, width: 32, d: 14, delay: -8 },
  { top: 70, width: 52, d: 24, delay: -15 },
];

/** Envelopes that cross the section slowly. Decorative and hidden when motion is reduced. */
export function FlyingEnvelopes({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {flights.map((f, i) => (
        <span key={i} className="animate-drift absolute left-0" style={{ top: `${f.top}%`, animationDuration: `${f.d}s`, animationDelay: `${f.delay}s` }}>
          <EnvelopeIcon className="-rotate-6 drop-shadow-lg" style={{ width: f.width }} />
        </span>
      ))}
    </div>
  );
}
