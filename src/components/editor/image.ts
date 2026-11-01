/**
 * Picking a picture for the email: it is checked and scaled down in the browser, then stored through
 * the upload route, which checks it again. Re-drawing the picture also removes its hidden metadata (EXIF,
 * including where a photo was taken).
 */

/** What each kind of picture is turned into. `square` crops the middle to a square so a grid stays even. */
const LIMITS = {
  logo: { width: 400, type: "image/png", square: false },
  banner: { width: 1200, type: "image/jpeg", square: false },
  /** Sharp on retina screens at the email's 600 px layout. */
  image: { width: 1200, type: "image/jpeg", square: false },
  /** A smaller variant: a grid cell is at most about 270 px wide on screen. */
  grid: { width: 600, type: "image/jpeg", square: true },
} as const;

export type ImageKind = keyof typeof LIMITS;

/** The largest file a person can pick (before it is scaled down). */
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
/** The largest file we store (the upload route enforces the same limit). */
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

/**
 * A logo becomes a PNG at most 400 px wide (keeping transparency). A banner or an Image block becomes a
 * picture at most 1200 px wide, and a grid picture a 600 px square. PNG and GIF sources stay PNG
 * (keeping transparency) unless that would be too large, then they become JPEG.
 */
export async function prepareImage(file: File, kind: ImageKind): Promise<{ blob: Blob; w: number; h: number }> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("That picture is larger than 5 MB. Choose a smaller one.");
  const lim = LIMITS[kind];
  const img = await load(file);
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw || !nh) throw new Error("That picture has no size we can use.");

  // The part of the source that is used: all of it, or the middle square.
  const side = Math.min(nw, nh);
  const sx = lim.square ? (nw - side) / 2 : 0, sy = lim.square ? (nh - side) / 2 : 0;
  const sw = lim.square ? side : nw, sh = lim.square ? side : nh;

  let type: string = lim.type;
  if (lim.type === "image/jpeg" && (kind === "image" || kind === "grid") && /^image\/(png|gif)$/.test(file.type)) type = "image/png";
  let scale = Math.min(1, lim.width / sw);
  for (let attempt = 0; attempt < 6; attempt++) {
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("Your browser can’t prepare this picture.");
    if (type === "image/jpeg") { c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h); }
    c.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    const blob = await toBlob(canvas, type, 0.85 - attempt * 0.07);
    if (!blob) throw new Error("Your browser can’t prepare this picture.");
    if (blob.size <= MAX_BYTES) return { blob, w, h };
    if (type === "image/png" && lim.type === "image/jpeg") { type = "image/jpeg"; continue; } // too large as PNG: JPEG is much smaller
    scale *= 0.75;
  }
  throw new Error("That picture is too large. Try a smaller one.");
}

export async function uploadImage(blob: Blob, kind: ImageKind): Promise<string> {
  const form = new FormData();
  form.append("file", blob, `${kind}.${blob.type === "image/png" ? "png" : "jpg"}`);
  form.append("kind", kind);
  let res: Response;
  try { res = await fetch("/api/campaigns/assets", { method: "POST", body: form }); }
  catch { throw new Error("Couldn’t reach the server. Check your connection and try again."); }
  const data = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
  if (!res.ok || !data?.ok || !data.url) throw new Error(data?.error ?? "Couldn’t upload the picture.");
  return data.url;
}
