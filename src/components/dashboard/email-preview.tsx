"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * THE email preview. The campaign editor, the template editor and the template drawer all show
 * an email through this card, so a template looks the same everywhere before it is sent.
 */
export function EmailPreviewCard({ doc, subject, description = "Shown with sample details." }: { doc: string; subject?: string; description?: string }) {
  return (
    <Card>
      <CardHeader title="Preview" description={description} />
      {subject !== undefined ? (
        <p className="border-b border-mist px-6 py-3 text-sm">
          <span className="text-ink-muted">Subject: </span>
          <span className="font-semibold text-ink">{subject || "(no subject yet)"}</span>
        </p>
      ) : null}
      <iframe title="Email preview" srcDoc={doc} sandbox="" className="h-[640px] w-full rounded-b-2xl bg-white" />
    </Card>
  );
}

// The email is laid out at this width, then scaled down to fit the card. Narrower than the real 600px
// layout on purpose: the scale stays close to 1, so the text in a thumbnail is large enough to read.
const THUMB_WIDTH = 520;
// Thumbnails are pictures, not scrollable pages: no scrollbars.
const NO_SCROLL = "<style>html,body{overflow:hidden!important}</style>";

/** A small, non-interactive picture of an email, for template cards. */
export function EmailThumb({ doc, title, className }: { doc: string; title: string; className?: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.45);
  const [height, setHeight] = useState(128);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => {
      setScale(Math.max(0.2, el.clientWidth / THUMB_WIDTH));
      setHeight(el.clientHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className={cn("relative h-32 overflow-hidden bg-mist-100", className)}>
      <iframe
        title={title}
        srcDoc={doc.replace("</head>", `${NO_SCROLL}</head>`)}
        sandbox=""
        scrolling="no"
        tabIndex={-1}
        loading="lazy"
        className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
        style={{ width: THUMB_WIDTH, height: height / scale, transform: `scale(${scale})`, transformOrigin: "top left" }}
      />
    </div>
  );
}
