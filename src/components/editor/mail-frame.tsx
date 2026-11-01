"use client";

import { useEffect, useRef, useState } from "react";

/**
 * An email shown as it will arrive. It sits in a sandboxed frame (no scripts run, links are inert), and
 * the frame grows to the height of the email so the page, not the frame, scrolls.
 */
export function MailFrame({ doc, title, className }: { doc: string; title: string; className?: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(480);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let ro: ResizeObserver | undefined;
    const measure = () => {
      const root = frame.contentDocument?.documentElement;
      if (root) setHeight(Math.max(120, Math.ceil(root.scrollHeight)));
    };
    const onLoad = () => {
      measure();
      const body = frame.contentDocument?.body;
      if (body && typeof ResizeObserver !== "undefined") { ro?.disconnect(); ro = new ResizeObserver(measure); ro.observe(body); }
    };
    frame.addEventListener("load", onLoad);
    if (frame.contentDocument?.readyState === "complete") onLoad();
    return () => { frame.removeEventListener("load", onLoad); ro?.disconnect(); };
  }, [doc]);

  return <iframe ref={ref} title={title} srcDoc={doc} sandbox="allow-same-origin" scrolling="no" style={{ height }} className={className ?? "block w-full border-0"} />;
}
