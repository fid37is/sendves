"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { prefersReducedMotion } from "@/components/motion/use-in-view";

/* Stage geometry. The SVG viewBox and the card overlays share these units. */
const W = 560;
const H = 480;
const ORIGIN = { x: 256, y: 200 };
const INBOX_X = 470;
const INBOX_W = 44;
const INBOX_H = 34;
const INBOXES = [46, 104, 162, 220, 278, 336, 394];

/* Timing, in seconds. */
const ENVELOPES = 14;
const FLIGHT = 1.25;
const GAP = 0.2;
const FIRST = 0.15;
const RUN_S = FIRST + (ENVELOPES - 1) * GAP + FLIGHT;

const SUBJECT = "Autumn collection is here";
const TOTAL = 12480;

/* How long the finished result stays on screen before Send is pressed again. */
const REST_MS = 4500;

function pathTo(y: number) {
  const dy = y - ORIGIN.y;
  return `M${ORIGIN.x},${ORIGIN.y} C${ORIGIN.x + 76},${ORIGIN.y + dy * 0.15} ${INBOX_X - 72},${y} ${INBOX_X},${y}`;
}

const paths = INBOXES.map(pathTo);

const flights = Array.from({ length: ENVELOPES }, (_, k) => {
  const inbox = (k * 3) % INBOXES.length;
  const begin = FIRST + k * GAP;
  return { k, inbox, begin, arrive: begin + FLIGHT };
});

const firstArrival = INBOXES.map((_, i) => flights.find((f) => f.inbox === i)?.arrive ?? RUN_S);

type Phase = "typing" | "ready" | "sending" | "done";

/**
 * Live send demo for the hero: a subject types itself, the campaign sends, envelopes fly into
 * inboxes that flip to "delivered", and the totals count up. Visitors can replay it.
 */
export function LaunchPad() {
  const [phase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState(0);
  const [run, setRun] = useState(0);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [pressed, setPressed] = useState(false);
  const typer = useRef<number | null>(null);

  const start = useCallback((instant: boolean) => {
    setRun((r) => r + 1);
    if (instant) {
      setProgress(1);
      setPhase("done");
      return;
    }
    setProgress(0);
    setPhase("sending");
  }, []);

  /* Orchestrated opening: type the subject, pause, then send. */
  useEffect(() => {
    const instant = prefersReducedMotion();
    setReduced(instant);
    if (instant) {
      setTyped(SUBJECT.length);
      start(true);
      return;
    }
    let i = 0;
    typer.current = window.setInterval(() => {
      i += 1;
      setTyped(i);
      if (i >= SUBJECT.length) {
        if (typer.current !== null) window.clearInterval(typer.current);
        typer.current = null;
        setPhase("ready");
      }
    }, 36);
    return () => {
      if (typer.current !== null) window.clearInterval(typer.current);
      typer.current = null;
    };
  }, [start]);

  /* The auto-click: a short beat, the button visibly presses, then the campaign sends. */
  useEffect(() => {
    if (phase !== "ready") return;
    const press = window.setTimeout(() => setPressed(true), 300);
    const release = window.setTimeout(() => {
      setPressed(false);
      start(false);
    }, 560);
    return () => {
      window.clearTimeout(press);
      window.clearTimeout(release);
    };
  }, [phase, start]);

  /* The demo repeats: after a rest, the button presses itself again and again. */
  useEffect(() => {
    if (phase !== "done" || reduced) return;
    const press = window.setTimeout(() => setPressed(true), REST_MS);
    const release = window.setTimeout(() => {
      setPressed(false);
      start(false);
    }, REST_MS + 260);
    return () => {
      window.clearTimeout(press);
      window.clearTimeout(release);
    };
  }, [phase, reduced, start]);

  /* Drive the counter and progress bar from the clock so they line up with the flights. */
  useEffect(() => {
    if (phase !== "sending") return;
    let raf = 0;
    const t0 = performance.now();
    const firstLanding = FIRST + FLIGHT;
    const tick = (now: number) => {
      const sec = (now - t0) / 1000;
      const p = Math.min(1, Math.max(0, (sec - firstLanding + 0.2) / (RUN_S - firstLanding + 0.2)));
      setProgress(p * p * (3 - 2 * p));
      if (sec < RUN_S) raf = requestAnimationFrame(tick);
      else {
        setProgress(1);
        setPhase("done");
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, run]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
  };

  /* A visitor can also click at any moment: skip the typing and send straight away. */
  const onSend = () => {
    if (typer.current !== null) {
      window.clearInterval(typer.current);
      typer.current = null;
    }
    setTyped(SUBJECT.length);
    setPressed(false);
    start(reduced);
  };

  const delivered = Math.round(progress * TOTAL);
  const started = phase === "sending" || phase === "done";
  const status = phase === "sending" ? "sending" : phase === "done" ? "sent" : "draft";

  return (
    <div className="mx-auto w-full max-w-[34rem] xl:max-w-[40rem]" onPointerMove={onPointerMove} onPointerLeave={() => setTilt({ x: 0, y: 0 })}>
      <div
        className="relative transition-transform duration-300 ease-out will-change-transform"
        style={{
          aspectRatio: `${W} / ${H}`,
          transform: `perspective(1100px) rotateY(${tilt.x * 4}deg) rotateX(${tilt.y * -3}deg)`,
        }}
      >
        <svg key={run} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          {/* Guide lines from the campaign to every inbox */}
          {paths.map((d, i) => (
            <path key={i} d={d} fill="none" className="stroke-white" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="3 7" strokeLinecap="round" />
          ))}

          {started && !reduced ? (
            <>
              {[0, 0.22].map((delay) => (
                <circle key={delay} className="burst stroke-white" cx={ORIGIN.x} cy={ORIGIN.y} r="12" fill="none" strokeWidth="2" style={{ animationDelay: `${delay}s` }} />
              ))}
              {flights.map((f) => (
                <path
                  key={`t${f.k}`}
                  className="trail stroke-white"
                  d={paths[f.inbox]}
                  pathLength={1}
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  style={{ animationDelay: `${f.begin}s` }}
                />
              ))}
              {flights.map((f) => (
                <g key={`e${f.k}`} opacity="0">
                  <animateMotion
                    path={paths[f.inbox]}
                    dur={`${FLIGHT}s`}
                    begin={`${f.begin}s`}
                    fill="freeze"
                    rotate="auto"
                    calcMode="spline"
                    keyPoints="0;1"
                    keyTimes="0;1"
                    keySplines="0.35 0 0.25 1"
                  />
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.86;1" dur={`${FLIGHT}s`} begin={`${f.begin}s`} fill="freeze" />
                  <rect x="-11" y="-8" width="22" height="16" rx="3.5" className="fill-white" />
                  <path d="M-11,-6.5 L0,1.5 L11,-6.5" fill="none" className="stroke-brand-700" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                </g>
              ))}
            </>
          ) : null}

          {/* Inboxes */}
          {INBOXES.map((y, i) => (
            <g key={i}>
              <rect x={INBOX_X} y={y - INBOX_H / 2} width={INBOX_W} height={INBOX_H} rx="10" className="fill-white stroke-white" fillOpacity="0.12" strokeOpacity="0.35" />
              <g fill="none" className="stroke-white" strokeOpacity="0.8" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
                <rect x={INBOX_X + 11} y={y - 7} width="22" height="14" rx="3" />
                <path d={`M${INBOX_X + 11},${y - 5} l11,8 l11,-8`} />
              </g>
              {started ? (
                <g className="inbox-ok" style={{ animationDelay: reduced ? "0s" : `${firstArrival[i]}s` }}>
                  <rect x={INBOX_X} y={y - INBOX_H / 2} width={INBOX_W} height={INBOX_H} rx="10" className="fill-success" />
                  <path d={`M${INBOX_X + 14},${y} l6,6 l12,-12`} fill="none" className="stroke-white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ) : null}
            </g>
          ))}
        </svg>

        {/* Campaign card */}
        <div className="absolute left-0 top-[8%] w-[45.7%] rounded-2xl bg-white p-3 shadow-2xl shadow-brand-900/40 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-ink-muted">Campaign</p>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1.5 min-h-[1.5rem] text-sm font-bold text-ink sm:text-base" aria-label={SUBJECT}>
            <span aria-hidden="true">{SUBJECT.slice(0, typed)}</span>
            {phase === "typing" ? <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-blink bg-brand-600" /> : null}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist-100" aria-hidden="true">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-2 flex items-center justify-between text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              {phase === "sending" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" /> : null}
              Delivered
            </span>
            <span className="font-bold tabular-nums text-ink">
              {delivered.toLocaleString("en-US")} <span className="font-medium text-ink-muted">of {TOTAL.toLocaleString("en-US")}</span>
            </span>
          </p>
          <Button
            size="sm"
            className={`mt-3 w-full ${pressed ? "scale-[0.96] ring-4 ring-brand-200" : ""}`}
            disabled={phase === "sending"}
            onClick={onSend}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {phase === "sending" ? "Sending" : phase === "done" ? "Send again" : (
              <>
                <span className="sm:hidden">Send</span>
                <span className="hidden sm:inline">Send campaign</span>
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        <div
          className={`absolute bottom-[1%] left-0 w-[62%] rounded-2xl border border-white/25 bg-white/10 p-3 text-white backdrop-blur-sm transition-all duration-500 sm:p-4 ${
            phase === "done" ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
          aria-hidden={phase !== "done"}
        >
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Delivered", "98.4%"],
              ["Clicked", "6.2%"],
              ["Unsubscribed", "0.2%"],
            ].map(([label, value]) => (
              <div key={label}>
                <dd className="font-display text-lg font-extrabold leading-none sm:text-2xl">{value}</dd>
                <dt className="mt-1 truncate text-[10px] text-accent-100 sm:text-xs">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-accent-100">Sample data, for illustration</p>
    </div>
  );
}