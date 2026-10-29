"use client";

import { useEffect, useRef, useState } from "react";

type Options = { threshold?: number; rootMargin?: string };

/**
 * Reports whether an element has entered the viewport (once).
 * Content stays visible until the hook has mounted, so nothing is hidden without JavaScript.
 * Returns [ref, ready, seen]: `ready` is true after mount, `seen` once the element is on screen.
 */
export function useInView<T extends HTMLElement>({ threshold = 0.25, rootMargin = "0px 0px -8% 0px" }: Options = {}) {
  const ref = useRef<T>(null);
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setReady(true);
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85 && rect.bottom > 0) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin]);

  return [ref, ready, seen] as const;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
