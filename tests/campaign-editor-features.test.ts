import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultDesign, EMPTY_LOGO, imagesMissingAlt, layoutRows, lowContrastButtons, newBlock, renderCampaignHtml, reviewChecks, sanitizeDesign, sanitizeFmt, switchLayout,
  customizeCarryOver, planTemplateSwitch, type Design,
} from "../src/lib/email/campaign";
import { cleanHex, contrastRatio, readableOn } from "../src/lib/email/color";
import { parsePastedContacts } from "../src/lib/validation/paste-contacts";
import { emailCanvas } from "../src/config/brand";
const DARK = emailCanvas.ink.toLowerCase();
const LIGHT = emailCanvas.onColor.toLowerCase();

const rule = { prefix: "https://x.supabase.co/storage/v1/object/public/email-assets/ws1/" };
const ctx = { logo: EMPTY_LOGO, tz: "UTC" };
const own = (n: string) => `${rule.prefix}${n}`;
const finalHtml = (d: Design) => renderCampaignHtml(d, ctx);

// ── Colour ──────────────────────────────────────────────────────────────────

test("colour: only #rrggbb is accepted, in lower case", () => {
  assert.equal(cleanHex("#ABCDEF"), "#abcdef");
  assert.equal(cleanHex("#abc"), "");
  assert.equal(cleanHex("red", "#0f766e"), "#0f766e");
  assert.equal(cleanHex("#12345g"), "");
  assert.equal(cleanHex(undefined), "");
});

test("colour: text on a brand colour is light or dark by WCAG contrast", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
  assert.equal(readableOn("#000000"), LIGHT);
  assert.equal(readableOn("#ffffff"), DARK);
  assert.equal(readableOn("#facc15"), DARK); // a bright yellow needs dark text
  assert.equal(readableOn("#0f766e"), LIGHT);
  // whichever is chosen, every offered swatch reads at WCAG AA or better
  for (const c of ["#164e63", "#1d4ed8", "#b45309", "#be123c", "#facc15"]) assert.ok(contrastRatio(c, readableOn(c)) >= 4.5, c);
});

test("colour: a light brand colour gives dark button text in the sent email, and a chosen colour wins", () => {
  const d = defaultDesign("announcement");
  d.color = "#facc15";
  assert.ok(finalHtml(d).toLowerCase().includes(`color:${DARK};font-family`), "auto: dark text on a light colour");
  d.fmt.button = { col: "#ff0000" };
  assert.ok(finalHtml(d).includes("color:#ff0000;font-family"), "the person's colour wins");
});

// ── Text formatting ────────────────────────────────────────────────────────

test("formatting: alignment, bold, italic and colour are validated", () => {
  assert.deepEqual(sanitizeFmt({ al: "right", col: "#AABBCC", b: true, i: true, extra: 1 }), { al: "right", col: "#aabbcc", b: true, i: true });
  assert.deepEqual(sanitizeFmt({ al: "justify", col: "url(javascript:x)", b: "yes" }), undefined);
  assert.equal(sanitizeFmt(null), undefined);
  const d = sanitizeDesign({
    tpl: "custom",
    blocks: [{ id: "h", t: "heading", x: "Hi", f: { al: "center", col: "red" } }, { id: "i", t: "image", f: { b: true } }, { id: "f", t: "footer", x: "x", f: { i: true } }],
    fmt: { headline: { b: true }, nonsense: { b: true }, body: { col: "not-a-colour" } },
  }, rule);
  assert.deepEqual(d.blocks[0].f, { al: "center" });
  assert.equal(d.blocks[1].f, undefined, "formatting only belongs on text blocks");
  assert.deepEqual(d.blocks[2].f, { i: true });
  assert.deepEqual(d.fmt, { headline: { b: true } });
});

test("formatting reaches the sent email, and a chosen colour is not overridden by dark mode", () => {
  const d = defaultDesign("custom");
  d.blocks = [
    { id: "h", t: "heading", x: "Title", f: { al: "right", col: "#aabbcc", b: true, i: true } },
    { id: "t", t: "text", x: "Plain" },
    { id: "b", t: "button", x: "Go", u: "https://a.b", f: { al: "right", b: true } },
    { id: "f", t: "footer", x: "Bye", f: { al: "left" } },
  ];
  const html = finalHtml(d);
  assert.match(html, /<h2 style="[^"]*text-align:right;color:#aabbcc;font-weight:700;font-style:italic;">Title/);
  assert.ok(!/<h2 class="sv-ink"/.test(html), "the dark-mode colour class is dropped when a colour is chosen");
  assert.ok(/<p class="sv-ink"/.test(html), "unformatted text keeps it");
  assert.ok(html.includes('align="right" style="margin-left:auto"'), "button alignment");
  assert.match(html, /font-weight:700;text-decoration:none/);
});

test("formatting: template parts take d.fmt, and it carries both ways between a template and a custom layout", () => {
  const d = defaultDesign("announcement");
  d.fmt.headline = { al: "center", b: true };
  d.fmt.button = { al: "center", col: "#101010" };
  d.fmt.footer = { i: true };
  assert.ok(layoutRows(d, ctx, "final").find((r) => r.slot === "headline")!.html.includes("text-align:center;font-weight:700"));

  assert.ok(customizeCarryOver(d).includes("Text formatting"));
  const c = switchLayout(d, "custom");
  assert.deepEqual(c.blocks.find((b) => b.t === "heading")!.f, { al: "center", b: true });
  assert.deepEqual(c.blocks.find((b) => b.t === "button")!.f, { al: "center", col: "#101010" });
  assert.deepEqual(c.blocks.find((b) => b.t === "footer")!.f, { i: true });
  assert.equal(c.blocks.find((b) => b.t === "text")!.f, undefined);

  c.blocks.find((b) => b.t === "text")!.f = { b: true };
  assert.ok(planTemplateSwitch(c).keep.includes("Text formatting"));
  const back = switchLayout(c, "promo");
  assert.deepEqual(back.fmt, { headline: { al: "center", b: true }, body: { b: true }, button: { al: "center", col: "#101010" }, footer: { i: true } });
  const again = switchLayout(back, "custom");
  assert.deepEqual(again.blocks.find((b) => b.t === "text")!.f, { b: true });
});

// ── Images ──────────────────────────────────────────────────────────────────

test("image block: own picture, width, alt and link; only this workspace's uploads (or https) are kept", () => {
  const d = sanitizeDesign({
    tpl: "custom",
    blocks: [
      { id: "a", t: "image", url: own("image-1.jpg"), alt: "A tee", link: "https://shop.example/tee", w: 75 },
      { id: "b", t: "image", url: "http://insecure.example/x.png", alt: "x", link: "javascript:alert(1)", w: 33 },
      { id: "c", t: "image", url: "data:image/png;base64,AAAA" },
      { id: "d", t: "image", url: `${rule.prefix}x.png" onerror="y` },
    ],
  }, rule);
  const [a, b, c, e] = d.blocks;
  assert.deepEqual([a.url, a.alt, a.link, a.w], [own("image-1.jpg"), "A tee", "https://shop.example/tee", 75]);
  assert.equal(b.url, undefined, "http is not accepted");
  assert.equal(b.link, undefined, "javascript: links are dropped");
  assert.equal(b.w, undefined, "only 100, 75 and 50 are widths");
  assert.equal(c.url, undefined, "no data URLs");
  assert.equal(e.url, undefined);
});

test("image block renders as a table at the chosen width, with alt text and a link only in the sent email", () => {
  const d = defaultDesign("custom");
  d.blocks = [
    { id: "a", t: "image", url: own("a.jpg"), alt: "Tee", link: "https://shop.example", w: 50 },
    { id: "f", t: "footer", x: "x" },
  ];
  const html = finalHtml(d);
  assert.ok(html.includes(`<img src="${own("a.jpg")}" alt="Tee" width="272"`), "50% of the 544 px content width");
  assert.ok(html.includes('<table role="presentation" width="50%" align="center"'));
  assert.ok(html.includes('<a href="https://shop.example"'));
  const edit = layoutRows(d, ctx, "edit")[0].html;
  assert.ok(!edit.includes("href="), "the editor never links");
});

test("image grid: 2 or 3 per row, at most 6, square cells in a table, empty cells left out of the sent email", () => {
  const imgs = Array.from({ length: 9 }, (_, i) => ({ url: i === 3 ? "https://evil.example/p.png" : own(`g${i}.jpg`), alt: `Pic ${i}`, link: i === 0 ? "https://a.b" : "mailto:x" + "\"" }));
  const d = sanitizeDesign({ tpl: "custom", blocks: [{ id: "g", t: "gallery", cols: 3, imgs }, { id: "f", t: "footer", x: "x" }] }, rule);
  const g = d.blocks[0];
  assert.equal(g.cols, 3);
  assert.equal(g.imgs!.length, 6, "no more than six");
  assert.equal(g.imgs![3].url, "", "a foreign picture is dropped");
  assert.equal(g.imgs![0].link, "https://a.b");
  assert.equal(g.imgs![1].link, "", "an invalid link is dropped");
  assert.equal(sanitizeDesign({ blocks: [{ id: "g", t: "gallery", cols: 5 }] }, rule).blocks[0].cols, 2);
  assert.equal(sanitizeDesign({ blocks: [{ id: "g", t: "gallery" }] }, rule).blocks[0].imgs!.length, 2, "a new grid starts with two slots");

  const html = finalHtml(d);
  assert.equal((html.match(/<img src="https:\/\/x\.supabase\.co/g) ?? []).length, 5, "the empty slot isn't sent");
  assert.ok(html.includes('width="173" height="173"'), "three per row: a fixed square size");
  assert.equal((html.match(/<tr><td width="33%"/g) ?? []).length, 2, "two rows of three cells");
  assert.ok(html.includes('<a href="https://a.b"'));
  const two = renderCampaignHtml({ ...d, blocks: [{ ...g, cols: 2 }, d.blocks[1]] }, ctx);
  assert.ok(two.includes('width="264" height="264"'));
});

test("email-safe layout: no flexbox, grid or calc() in what is sent for the blocks and templates", () => {
  const custom = defaultDesign("custom");
  custom.blocks = [
    { id: "1", t: "logo" }, { id: "2", t: "heading", x: "H" }, { id: "3", t: "image", url: own("a.jpg"), alt: "a" },
    { id: "4", t: "gallery", cols: 2, imgs: [{ url: own("a.jpg"), alt: "a", link: "" }, { url: own("b.jpg"), alt: "b", link: "" }] },
    newBlock("products", custom), newBlock("columns", custom), newBlock("countdown", custom), newBlock("social", custom), { id: "9", t: "footer", x: "f" },
  ];
  for (const html of [finalHtml(custom), ...(["announcement", "newsletter", "promo", "event", "product"] as const).map((t) => finalHtml(defaultDesign(t)))]) {
    assert.ok(!/display:\s*(flex|grid)/.test(html));
    assert.ok(!html.includes("calc("));
    assert.ok(!html.includes("aspect-ratio"));
  }
});

test("switching to a template keeps an uploaded picture as the banner", () => {
  const d = defaultDesign("custom");
  d.blocks = [{ id: "l", t: "logo" }, { id: "i", t: "image", url: own("hero.jpg"), alt: "Hero" }, { id: "f", t: "footer", x: "f" }];
  const t = switchLayout(d, "announcement");
  assert.equal(t.banner.src, own("hero.jpg"));
  assert.equal(t.banner.alt, "Hero");
});

// ── Review ──────────────────────────────────────────────────────────────────

const input = (d: Design, extra: Record<string, unknown> = {}) => ({
  subject: "Hello", design: d, logo: EMPTY_LOGO, variables: [],
  audience: { chosen: true, name: "All", size: 10 }, sender: { ok: true, label: "A", problem: null }, addressSet: true, ...extra,
});

test("review: pictures without alt text warn, but never block", () => {
  const d = defaultDesign("custom");
  d.blocks = [
    { id: "i", t: "image", url: own("a.jpg") },
    { id: "g", t: "gallery", cols: 2, imgs: [{ url: own("a.jpg"), alt: "ok", link: "" }, { url: own("b.jpg"), alt: " ", link: "" }, { url: "", alt: "", link: "" }] },
    { id: "f", t: "footer", x: "f" },
  ];
  assert.equal(imagesMissingAlt(d).count, 2);
  const c = reviewChecks(input(d)).find((x) => x.key === "alt")!;
  assert.ok(c.ok && c.warn);
  assert.equal(c.sel, "i");
  d.blocks[0].alt = "A tee"; (d.blocks[1].imgs![1]).alt = "B";
  assert.equal(reviewChecks(input(d)).find((x) => x.key === "alt"), undefined);

  const t = defaultDesign("announcement");
  t.C.u = "https://a.b";
  t.banner.src = own("b.jpg");
  const tc = reviewChecks(input(t)).find((x) => x.key === "alt")!;
  assert.equal(tc.slot, "banner");
  assert.equal(imagesMissingAlt({ ...t, tpl: "product" }).count, 0, "a template that has no banner doesn't ask for its alt text");
});

test("review: skipped typed or pasted addresses warn", () => {
  const d = defaultDesign("announcement");
  d.C.u = "https://a.b";
  const c = reviewChecks(input(d, { audience: { chosen: true, name: "Typed or pasted list", size: 3, skipped: { invalid: 2, duplicates: 1, left: 0 } } })).find((x) => x.key === "skipped")!;
  assert.ok(c.ok && c.warn);
  assert.equal(c.detail, "2 invalid, 1 duplicate");
  assert.equal(reviewChecks(input(d, { audience: { chosen: true, name: "x", size: 3, skipped: { invalid: 0, duplicates: 0, left: 0 } } })).find((x) => x.key === "skipped"), undefined);
});

test("review: a button text colour that is hard to read on the brand colour warns", () => {
  const d = defaultDesign("announcement");
  d.C.u = "https://a.b";
  d.color = "#0f766e";
  d.fmt.button = { col: "#14b8a6" };
  assert.equal(lowContrastButtons(d).count, 1);
  assert.ok(reviewChecks(input(d)).find((x) => x.key === "contrast")!.warn);
  d.fmt.button = { col: "#ffffff" };
  assert.equal(reviewChecks(input(d)).find((x) => x.key === "contrast"), undefined);
  const c = defaultDesign("custom");
  c.color = "#0f766e";
  c.blocks = [{ id: "b", t: "button", x: "Go", u: "https://a.b", f: { col: "#14b8a6" } }, { id: "f", t: "footer", x: "f" }];
  assert.equal(lowContrastButtons(c).sel, "b");
});

// ── Typed or pasted audience ───────────────────────────────────────────────

test("pasted addresses: fragments like bad@ are counted as invalid, not ignored", () => {
  const r = parsePastedContacts("ada@example.com, bad@\nemeka@example.com;@nothing.com  zed@example");
  assert.deepEqual(r.contacts.map((c) => c.email), ["ada@example.com", "emeka@example.com"]);
  assert.equal(r.invalidCount, 3);
  assert.deepEqual(r.invalid.sort(), ["@nothing.com", "bad@", "zed@example"].sort());
});

test("pasted addresses: names, duplicates, trailing full stops and mixed separators", () => {
  const r = parsePastedContacts("Ada Lovelace <ADA@Example.com>\nada@example.com\nemeka@example.com.\nx@y.com z@y.com;w@y.com");
  assert.deepEqual(r.contacts.map((c) => c.email), ["ada@example.com", "emeka@example.com", "x@y.com", "z@y.com", "w@y.com"]);
  assert.deepEqual([r.contacts[0].firstName, r.contacts[0].lastName], ["Ada", "Lovelace"]);
  assert.equal(r.duplicates, 1);
  assert.equal(r.invalidCount, 0);
  assert.equal(parsePastedContacts("no addresses here").invalidCount, 1);
});
