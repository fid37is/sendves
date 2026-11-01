import { VARIABLE_TOKEN_RE, type VariableDef } from "@/lib/email/variables";

/** Puts `token` at the cursor of an input/textarea the way typing would, so React state stays in sync. */
export function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement, token: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, el.value.slice(0, start) + token + el.value.slice(end));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  const pos = start + token.length;
  el.setSelectionRange(pos, pos);
}

const LABELS: Record<string, string> = { first_name: "First name", last_name: "Last name", city: "City", company: "Company", email: "Email address" };
export const varLabel = (key: string) => LABELS[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Splits text into plain parts and {{variable}} parts, for drawing variables as chips. */
export function tokenParts(text: string): { text: string; key?: string }[] {
  const out: { text: string; key?: string }[] = [];
  let last = 0;
  const re = new RegExp(VARIABLE_TOKEN_RE.source, "g");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], key: m[1].toLowerCase() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The variables offered for insertion: the standard contact fields, fields found on contacts, then the campaign's own. */
export function variableKeys(contactFieldKeys: readonly string[], defs: VariableDef[]): string[] {
  return [...new Set<string>(["first_name", "last_name", "city", "company", ...contactFieldKeys, ...defs.map((d) => d.key)])];
}

/** Resizes a picked picture in the browser before upload (logos small, banners and images wider). PNG keeps transparency. */
export function resizeImage(file: File, maxWidth: number, png: boolean): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn’t read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn’t a picture we can use."));
      img.onload = () => {
        const k = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * k));
        canvas.height = Math.max(1, Math.round(img.height * k));
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t prepare that picture."))), png ? "image/png" : "image/jpeg", 0.85);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
