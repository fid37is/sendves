"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { prepareImage, uploadImage } from "@/components/editor/image";
import { cn } from "@/lib/utils";

type Align = "left" | "center" | "right";
type Size = "s" | "m" | "l";

/** How big each logo size is drawn in an email (the same boxes the campaign editor uses). */
const BOX: Record<Size, [number, number]> = { s: [80, 40], m: [120, 56], l: [170, 80] };

/**
 * Picks the company logo. The picture is checked and scaled in the browser, stored through the same upload route
 * the campaign editor uses, and its address travels with the form to be saved. Every campaign then starts with it.
 */
export function CompanyLogoField({ initial }: { initial: { src: string; align: Align; size: Size; w: number; h: number } }) {
  const [logo, setLogo] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const img = await prepareImage(file, "logo");
      const src = await uploadImage(img.blob, "logo");
      setLogo((l) => ({ ...l, src, w: img.w, h: img.h }));
    } catch (err) {
      setError((err as Error).message || "Couldn’t add that picture.");
    } finally {
      setBusy(false);
    }
  }

  // The logo is fitted into its size box, exactly as the email does it.
  const [bw, bh] = BOX[logo.size];
  const k = logo.w > 0 && logo.h > 0 ? Math.min(bw / logo.w, bh / logo.h, 1) : 1;
  const dims: React.CSSProperties = logo.w > 0 && logo.h > 0 ? { width: Math.max(1, Math.round(logo.w * k)), height: Math.max(1, Math.round(logo.h * k)) } : { maxWidth: bw, maxHeight: bh };

  return (
    <div className="space-y-5">
      <input type="hidden" name="logoSrc" value={logo.src} />
      <input type="hidden" name="logoW" value={logo.w} />
      <input type="hidden" name="logoH" value={logo.h} />

      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink">Logo</p>
        <div className="flex flex-wrap items-center gap-4">
          {/* A tiny email header: this is how the logo sits at the top of a campaign. */}
          <div className="w-full max-w-sm rounded-xl border border-mist bg-mist-50 p-3 sm:w-72" aria-live="polite">
            <div className="rounded-lg bg-white px-5 py-4 shadow-sm" style={{ textAlign: logo.align }}>
              {logo.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.src} alt="Your logo" style={{ ...dims, display: "inline-block", border: 0 }} />
              ) : (
                <span className="inline-block rounded-md border border-dashed border-mist px-3 py-2 text-xs text-ink-muted">No logo yet</span>
              )}
              <div className="mt-3 space-y-1.5" aria-hidden="true"><div className="h-2 w-4/5 rounded bg-mist" /><div className="h-2 w-3/5 rounded bg-mist" /></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
              {logo.src ? "Replace logo" : "Upload logo"}
            </Button>
            {logo.src ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setLogo((l) => ({ ...l, src: "", w: 0, h: 0 }))} disabled={busy}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
              </Button>
            ) : null}
          </div>
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" tabIndex={-1} onChange={onFile} aria-label="Choose a logo picture" />
        <p className={cn("mt-2 text-xs", error ? "font-medium text-danger" : "text-ink-muted")} role={error ? "alert" : undefined}>
          {error || "PNG, JPG, GIF or WebP. A wide logo on a transparent background looks best. Save to apply it."}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Position" htmlFor="logoAlign">
          <Select id="logoAlign" name="logoAlign" value={logo.align} onChange={(e) => setLogo((l) => ({ ...l, align: e.target.value as Align }))}>
            <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
          </Select>
        </Field>
        <Field label="Size" htmlFor="logoSize">
          <Select id="logoSize" name="logoSize" value={logo.size} onChange={(e) => setLogo((l) => ({ ...l, size: e.target.value as Size }))}>
            <option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}