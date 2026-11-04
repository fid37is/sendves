/**
 * A filter for files that come in or go out as email attachments. It is NOT an antivirus: it can't recognise
 * malware, only the cheap tricks that most malicious attachments rely on:
 *   · a program disguised as a document (the first bytes say what a file really is, whatever its name says)
 *   · files that run code or scripts when opened (.exe, .js, .html, .svg, macro-enabled Office files…)
 *   · hiding the real type in the name (right-to-left override characters, trailing spaces)
 *   · archives that can't be looked into (password-protected, non-zip, or holding more archives)
 *   · zip files and Office files that contain programs or macros
 * Pure and dependency-free (it reads a Uint8Array), so it runs on the server and is tested without any setup.
 * Nothing is unpacked: a zip is read from its table of contents only, so a zip bomb can't hurt it.
 */

export type FileVerdict = { ok: true } | { ok: false; reason: string };
const bad = (reason: string): FileVerdict => ({ ok: false, reason });

/** Types that run code or programs when opened. */
const PROGRAM_EXT = /\.(exe|scr|com|pif|bat|cmd|msi|msp|dll|js|jse|vbs|vbe|wsf|wsh|ps1|psm1|jar|apk|app|dmg|iso|img|lnk|reg|hta|cpl|chm|sh|bin|msc|gadget|inf|ws|scf)$/i;
/** Pages and images that carry scripts: a favourite way to deliver a phishing page. */
const ACTIVE_EXT = /\.(html?|xhtml|shtml|mht|mhtml|svg|svgz|swf)$/i;
/** Office files that can hold macros. */
const MACRO_EXT = /\.(docm|dotm|xlsm|xltm|xlam|pptm|potm|ppam|ppsm|sldm)$/i;
/** Archives other than zip: they can't be looked into. */
const OTHER_ARCHIVE_EXT = /\.(rar|7z|ace|arj|cab|z|gz|tgz|bz2|xz|tar|lz|lzh|zst)$/i;
const ZIP_EXT = /\.(zip)$/i;
const OOXML_EXT = /\.(docx|xlsx|pptx|dotx|xltx|potx)$/i;
const ODF_EXT = /\.(odt|ods|odp)$/i;
const OLE_EXT = /\.(doc|xls|ppt|dot|xlt|pot|pps)$/i;
const TEXT_EXT = /\.(txt|csv|tsv|md|json|log|rtf|ics|vcf)$/i;

const ext = (name: string) => /\.[^./\\ ]+$/.exec(name.trim())?.[0]?.toLowerCase() ?? "";
const baseName = (name: string) => name.split(/[\\/]/).pop() ?? name;

/** True when the name alone shows the file is one we never send or keep. */
export function isBlockedFileName(name: string): boolean {
  return nameProblem(name) !== null;
}

/** Why a file name can't be accepted, or null. Reads the name only. */
export function nameProblem(name: string): string | null {
  const n = baseName(String(name ?? ""));
  // Right-to-left override and other invisible direction characters make "gpj.exe" display as "exe.jpg".
  if (/[\u202a-\u202e\u2066-\u2069\u200e\u200f]/.test(n)) return `${printable(n)} has a hidden character in its name that disguises the real file type.`;
  if (/[\s.]$/.test(n) || /\.\w{1,5}\s{2,}\.\w+$/.test(n)) return `${printable(n)} has spaces or dots after its name that hide the real file type.`;
  if (PROGRAM_EXT.test(n.trim())) return `${printable(n)} can’t be used: files that run programs are blocked.`;
  if (ACTIVE_EXT.test(n)) return `${printable(n)} can’t be used: web pages and scripted images are blocked. Send a PDF instead.`;
  if (MACRO_EXT.test(n)) return `${printable(n)} can’t be used: files that can contain macros are blocked. Save it as a normal document first.`;
  if (OTHER_ARCHIVE_EXT.test(n)) return `${printable(n)} can’t be used: only .zip archives can be checked. Send a .zip instead.`;
  return null;
}

const printable = (n: string) => n.replace(/[\u0000-\u001f\u202a-\u202e\u2066-\u2069\u200e\u200f]/g, "").slice(0, 60);

type Kind = "exe" | "elf" | "macho" | "script" | "pdf" | "png" | "jpeg" | "gif" | "webp" | "zip" | "ole" | "rar" | "7z" | "gzip" | "unknown";

const starts = (b: Uint8Array, ...sig: number[]) => sig.every((v, i) => b[i] === v);

/** What a file really is, read from its first bytes. */
export function sniffKind(b: Uint8Array): Kind {
  if (starts(b, 0x4d, 0x5a)) return "exe"; // "MZ": Windows programs and DLLs
  if (starts(b, 0x7f, 0x45, 0x4c, 0x46)) return "elf"; // Linux programs
  if (starts(b, 0xfe, 0xed, 0xfa, 0xce) || starts(b, 0xfe, 0xed, 0xfa, 0xcf) || starts(b, 0xce, 0xfa, 0xed, 0xfe) || starts(b, 0xcf, 0xfa, 0xed, 0xfe) || starts(b, 0xca, 0xfe, 0xba, 0xbe)) return "macho"; // macOS programs, Java classes
  if (starts(b, 0x23, 0x21)) return "script"; // "#!": a script that runs itself
  if (starts(b, 0x25, 0x50, 0x44, 0x46)) return "pdf";
  if (starts(b, 0x89, 0x50, 0x4e, 0x47)) return "png";
  if (starts(b, 0xff, 0xd8, 0xff)) return "jpeg";
  if (starts(b, 0x47, 0x49, 0x46, 0x38)) return "gif";
  if (starts(b, 0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (starts(b, 0x50, 0x4b, 0x03, 0x04) || starts(b, 0x50, 0x4b, 0x05, 0x06)) return "zip";
  if (starts(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return "ole"; // old Word, Excel, PowerPoint (and MSI)
  if (starts(b, 0x52, 0x61, 0x72, 0x21)) return "rar";
  if (starts(b, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return "7z";
  if (starts(b, 0x1f, 0x8b)) return "gzip";
  return "unknown";
}

export type ZipListing = { names: string[]; encrypted: boolean; truncated: boolean };

/** The file names inside a zip, from its table of contents. Nothing is unpacked. Null when it isn't a readable zip. */
export function listZip(b: Uint8Array): ZipListing | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // The end-of-directory record sits at the very end (followed by a comment of up to 64 KB).
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const names: string[] = [];
  let encrypted = false;
  const LIMIT = 2000;
  for (let n = 0; n < Math.min(total, LIMIT); n++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) return null;
    const flags = dv.getUint16(p + 8, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    if (p + 46 + nameLen > b.length) return null;
    if (flags & 1) encrypted = true;
    names.push(new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(p + 46, p + 46 + nameLen)));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { names, encrypted, truncated: total > LIMIT };
}

/** Whether the bytes of an old Office file mention a macro project (its directory is stored as UTF-16). */
function hasOleMacros(b: Uint8Array): boolean {
  const needle = "_VBA_PROJECT";
  const pat = new Uint8Array(needle.length * 2);
  for (let i = 0; i < needle.length; i++) { pat[i * 2] = needle.charCodeAt(i); pat[i * 2 + 1] = 0; }
  for (let from = 0; ;) {
    const at = b.indexOf(pat[0], from);
    if (at < 0 || at + pat.length > b.length) return false;
    let hit = true;
    for (let j = 1; j < pat.length; j++) if (b[at + j] !== pat[j]) { hit = false; break; }
    if (hit) return true;
    from = at + 1;
  }
}

const looksBinary = (b: Uint8Array) => b.subarray(0, 4096).includes(0);

/** Checks one file by its name and what it really contains. */
export function checkFile(name: string, bytes: Uint8Array): FileVerdict {
  const n = baseName(String(name ?? ""));
  const shown = printable(n);

  const byName = nameProblem(n);
  if (byName) return bad(byName);

  const kind = sniffKind(bytes);
  // Whatever the name says, a program is a program.
  if (kind === "exe" || kind === "elf" || kind === "macho") return bad(`${shown} is a program, not a document, whatever its name says.`);
  if (kind === "script") return bad(`${shown} is a script that runs by itself, so it can’t be used.`);
  if (kind === "rar" || kind === "7z" || kind === "gzip") return bad(`${shown} is an archive that can’t be checked. Send a .zip instead.`);

  const e = ext(n);
  const mismatch = () => bad(`${shown} isn’t really a ${e.slice(1).toUpperCase()} file, so it can’t be used.`);
  if (e === ".pdf" && kind !== "pdf") return mismatch();
  if (e === ".png" && kind !== "png") return mismatch();
  if ((e === ".jpg" || e === ".jpeg") && kind !== "jpeg") return mismatch();
  if (e === ".gif" && kind !== "gif") return mismatch();
  if (e === ".webp" && kind !== "webp") return mismatch();
  if (OLE_EXT.test(n) && kind !== "ole") return mismatch();
  if ((ZIP_EXT.test(n) || OOXML_EXT.test(n) || ODF_EXT.test(n)) && kind !== "zip") return mismatch();
  if (TEXT_EXT.test(n) && (looksBinary(bytes) || kind !== "unknown")) return bad(`${shown} isn’t plain text, so it can’t be used.`);

  if (kind === "ole" && hasOleMacros(bytes)) return bad(`${shown} contains macros, which can run programs. Save it without macros first.`);

  if (kind === "zip") {
    const z = listZip(bytes);
    if (!z) return bad(`${shown} is a damaged zip file.`);
    if (z.encrypted) return bad(`${shown} is password-protected, so it can’t be checked. Send it unprotected, or share it another way.`);
    if (z.truncated) return bad(`${shown} holds too many files to check.`);
    for (const entry of z.names) {
      const inner = baseName(entry);
      if (!inner) continue; // a folder
      if (/vbaproject\.bin$/i.test(inner)) return bad(`${shown} contains macros, which can run programs. Save it without macros first.`);
      if (ZIP_EXT.test(inner) || OTHER_ARCHIVE_EXT.test(inner)) return bad(`${shown} contains another archive, which can’t be checked.`);
      if (nameProblem(inner) || /\.(docm|xlsm|pptm)$/i.test(inner)) return bad(`${shown} contains ${printable(inner)}, a type that can run code.`);
    }
    // A real Office file always has this entry; without it the name is a disguise.
    if (OOXML_EXT.test(n) && !z.names.includes("[Content_Types].xml")) return mismatch();
  }
  return { ok: true };
}
