import type { Block } from "@/lib/email/blocks";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Validates blocks coming from the browser. Raw HTML blocks are not accepted. */
export function sanitizeBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return [];
  const out: Block[] = [];
  for (const raw of input.slice(0, 60)) {
    const b = raw as Record<string, unknown> | null;
    if (!b || typeof b !== "object") continue;
    const id = str(b.id, 40) || Math.random().toString(36).slice(2);
    switch (b.type) {
      case "heading": out.push({ id, type: "heading", text: str(b.text, 300) }); break;
      case "text": out.push({ id, type: "text", text: str(b.text, 8000) }); break;
      case "image": out.push({ id, type: "image", url: str(b.url, 2000), alt: str(b.alt, 300), link: str(b.link, 2000) || undefined }); break;
      case "button": out.push({ id, type: "button", label: str(b.label, 100), url: str(b.url, 2000) }); break;
      case "divider": out.push({ id, type: "divider" }); break;
      case "spacer": out.push({ id, type: "spacer", height: Math.min(Math.max(Number(b.height) || 24, 4), 120) }); break;
    }
  }
  return out;
}
