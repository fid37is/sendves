import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFile, listZip, nameProblem, sniffKind } from "../src/lib/file-check";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const PDF = text("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00);

/** A minimal zip: stored entries, real local headers and central directory (no compression needed to be listed). */
function zip(entries: { name: string; encrypted?: boolean }[]): Uint8Array {
  const parts: number[] = [];
  const central: number[] = [];
  const u16 = (n: number) => [n & 255, (n >> 8) & 255];
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const e of entries) {
    const name = Array.from(new TextEncoder().encode(e.name));
    const offset = parts.length;
    const flags = e.encrypted ? 1 : 0;
    parts.push(0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(flags), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0), ...u16(name.length), ...u16(0), ...name);
    central.push(0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(flags), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name);
  }
  const cdOffset = parts.length;
  return new Uint8Array([...parts, ...central, 0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(central.length), ...u32(cdOffset), ...u16(0)]);
}
const OOXML = (...extra: string[]) => zip([{ name: "[Content_Types].xml" }, { name: "word/document.xml" }, ...extra.map((name) => ({ name }))]);

test("ordinary files pass", () => {
  assert.deepEqual(checkFile("invoice.pdf", PDF), { ok: true });
  assert.deepEqual(checkFile("logo.png", PNG), { ok: true });
  assert.deepEqual(checkFile("notes.txt", text("hello\nworld")), { ok: true });
  assert.deepEqual(checkFile("data.csv", text("a,b\n1,2")), { ok: true });
  assert.deepEqual(checkFile("contract.docx", OOXML()), { ok: true });
  assert.deepEqual(checkFile("bundle.zip", zip([{ name: "a.pdf" }, { name: "folder/" }, { name: "folder/b.png" }])), { ok: true });
  assert.deepEqual(checkFile("unknown.dat", text("anything harmless")), { ok: true });
});

test("a program disguised as a document is caught by its contents", () => {
  for (const name of ["invoice.pdf", "photo.png", "notes.txt", "report.docx", "thing.dat", "x.zip"]) {
    const v = checkFile(name, EXE);
    assert.equal(v.ok, false, name);
    assert.match((v as any).reason, /program/);
  }
  assert.equal(sniffKind(bytes(0x7f, 0x45, 0x4c, 0x46)), "elf");
  assert.equal(checkFile("run.pdf", text("#!/bin/sh\nrm -rf /")).ok, false, "a self-running script");
});

test("the name must match what the file is", () => {
  assert.equal(checkFile("scan.pdf", PNG).ok, false);
  assert.equal(checkFile("photo.jpg", PDF).ok, false);
  assert.equal(checkFile("data.csv", bytes(1, 2, 0, 3, 4)).ok, false, "binary data renamed to text");
  assert.equal(checkFile("budget.xlsx", PDF).ok, false);
  assert.equal(checkFile("old.doc", PDF).ok, false);
  assert.equal(checkFile("fake.docx", zip([{ name: "evil.txt" }])).ok, false, "an Office file without its Content_Types");
});

test("names that run code, hide their type, or can't be checked are refused", () => {
  for (const n of ["setup.exe", "go.JS", "a.bat", "page.html", "pic.svg", "macro.docm", "sheet.xlsm", "deck.pptm", "files.rar", "files.7z", "x.tar.gz"]) {
    assert.ok(nameProblem(n), n);
  }
  assert.ok(nameProblem("invoice\u202Egpj.exe"), "right-to-left override trick");
  assert.ok(nameProblem("invoice.pdf "), "trailing space");
  assert.ok(nameProblem("invoice.pdf."), "trailing dot");
  assert.equal(nameProblem("report.pdf"), null);
  assert.equal(nameProblem("Q3 results (final).xlsx"), null);
  assert.equal(nameProblem("notes.json"), null);
});

test("zip files are read from their table of contents, not unpacked", () => {
  assert.deepEqual(listZip(zip([{ name: "a.txt" }, { name: "b/c.pdf" }]))?.names, ["a.txt", "b/c.pdf"]);
  assert.equal(listZip(text("not a zip")), null);
  assert.equal(listZip(zip([{ name: "s.txt", encrypted: true }]))?.encrypted, true);

  assert.match((checkFile("p.zip", zip([{ name: "s.txt", encrypted: true }])) as any).reason, /password/);
  assert.match((checkFile("p.zip", zip([{ name: "docs/readme.txt" }, { name: "docs/setup.exe" }])) as any).reason, /setup\.exe/);
  assert.match((checkFile("p.zip", zip([{ name: "inner.zip" }])) as any).reason, /another archive/);
  assert.match((checkFile("p.zip", zip([{ name: "inner.rar" }])) as any).reason, /another archive/);
  assert.match((checkFile("p.zip", zip([{ name: "run.js" }])) as any).reason, /run code/);
  assert.equal(checkFile("p.zip", text("PK\x03\x04 truncated")).ok, false, "a damaged zip");
});

test("macros are found in new and old Office files", () => {
  assert.match((checkFile("report.docx", OOXML("word/vbaProject.bin")) as any).reason, /macros/);
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(64).fill(0), ...Array.from("_VBA_PROJECT").flatMap((c) => [c.charCodeAt(0), 0]), ...new Array(32).fill(0)]);
  assert.match((checkFile("old.xls", ole) as any).reason, /macros/);
  const plainOle = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(200).fill(7)]);
  assert.deepEqual(checkFile("old.doc", plainOle), { ok: true });
});

test("archives other than zip are refused by content too", () => {
  assert.equal(checkFile("a.dat", bytes(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07)).ok, false);
  assert.equal(checkFile("a.dat", bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)).ok, false);
});
