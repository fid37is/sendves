/** Picking a logo or banner: scale it down in the browser, then store it through the upload route. */

const LIMITS = { logo: { width: 400, type: "image/png" }, banner: { width: 1200, type: "image/jpeg" } } as const;
const MAX_BYTES = 1_800_000;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn’t a picture we can read. Use a PNG, JPG, GIF or WebP.")); };
    img.src = url;
  });
}

/** A logo becomes a PNG at most 400 px wide (keeping transparency); a banner a JPEG at most 1200 px wide. */
export async function prepareImage(file: File, kind: "logo" | "banner"): Promise<{ blob: Blob; w: number; h: number }> {
  const { width: maxW, type } = LIMITS[kind];
  const img = await load(file);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("That picture has no size we can use.");
  let scale = Math.min(1, maxW / img.naturalWidth);
  for (let attempt = 0; attempt < 5; attempt++) {
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("Your browser can’t prepare this picture.");
    if (type === "image/jpeg") { c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h); }
    c.drawImage(img, 0, 0, w, h);
    const blob = await toBlob(canvas, type, 0.85 - attempt * 0.08);
    if (!blob) throw new Error("Your browser can’t prepare this picture.");
    if (blob.size <= MAX_BYTES) return { blob, w, h };
    scale *= 0.75;
  }
  throw new Error("That picture is too large. Try a smaller one.");
}

export async function uploadImage(blob: Blob, kind: "logo" | "banner"): Promise<string> {
  const form = new FormData();
  form.append("file", blob, kind === "logo" ? "logo.png" : "banner.jpg");
  form.append("kind", kind);
  let res: Response;
  try { res = await fetch("/api/campaigns/assets", { method: "POST", body: form }); }
  catch { throw new Error("Couldn’t reach the server. Check your connection and try again."); }
  const data = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
  if (!res.ok || !data?.ok || !data.url) throw new Error(data?.error ?? "Couldn’t upload the picture.");
  return data.url;
}
