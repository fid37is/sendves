import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyConditions, auditVariables, countdownParts, defaultDesign, designFromLegacyBlocks, designFromRow, designFromStarter, EMPTY_LOGO, BUILT_IN_TEMPLATES, TEMPLATE_NAMES, type TemplateKey,
  fillCountdown, layoutRows, newBlock, renderCampaignHtml, reviewChecks, sanitizeDesign, sanitizeLogo, scanContent, scheduleInstant,
  showFor, switchLayout, UNSUBSCRIBE_TOKEN, zonedInstant, type Design,
} from "../src/lib/email/campaign";
import { personalize } from "../src/lib/email/blocks";

const rule = { prefix: "https://x.supabase.co/storage/v1/object/public/email-assets/ws1/" };
const ctx = { logo: EMPTY_LOGO, tz: "UTC" };

test("conditions: who sees a conditional block", () => {
  const ada = { first_name: "Ada", custom_fields: { City: "Lagos", company: "Okoye Ltd" } };
  const emeka = { first_name: "", custom_fields: { city: "Asaba" } };
  assert.equal(showFor("lagos", ada), true);
  assert.equal(showFor("lagos", emeka), false);
  assert.equal(showFor("nolagos", emeka), true);
  assert.equal(showFor("nolagos", null), true);
  assert.equal(showFor("company", ada), true);
  assert.equal(showFor("company", emeka), false);
  assert.equal(showFor("named", ada), true);
  assert.equal(showFor("named", emeka), false);
  assert.equal(showFor("", null), true);
});

test("the stored html keeps conditional blocks marked and applyConditions removes them per contact", () => {
  const d = defaultDesign("custom");
  d.blocks = [{ id: "a", t: "text", x: "For everyone" }, { id: "b", t: "text", x: "Only Lagos", cond: "lagos" }, { id: "f", t: "footer", x: "foot" }];
  const html = renderCampaignHtml(d, ctx, "pre");
  assert.ok(html.includes("<!--sv-if:lagos-->"));
  assert.ok(applyConditions(html, { custom_fields: { city: "Lagos" } }).includes("Only Lagos"));
  const other = applyConditions(html, { custom_fields: { city: "Asaba" } });
  assert.ok(!other.includes("Only Lagos") && other.includes("For everyone") && !other.includes("sv-if"));
});

test("final html: tokens stay for the server, text is escaped, unsubscribe and footer marker exist", () => {
  const d = defaultDesign("custom");
  d.blocks = [{ id: "h", t: "heading", x: "Hi {{first_name}} <b>" }, { id: "b", t: "button", x: "Go", u: "https://example.com/a?x=1&y=2" }, { id: "f", t: "footer", x: "Bye" }];
  const html = renderCampaignHtml(d, ctx, "Preheader & more");
  assert.ok(html.includes("Hi {{first_name}} &lt;b&gt;"));
  assert.ok(html.includes('href="https://example.com/a?x=1&amp;y=2"'));
  assert.ok(html.includes(`href="${UNSUBSCRIBE_TOKEN}"`));
  assert.ok(html.includes("<!--FOOTER-->"));
  assert.ok(html.includes("Preheader &amp; more"));
  assert.ok(!html.includes("Add your logo"), "editing placeholders never reach the sent email");
  assert.equal(personalize(html, { first_name: "Ada" }).includes("Hi Ada &lt;b&gt;"), true);
});

test("a button without a valid link is not clickable in the sent email", () => {
  const d = defaultDesign("announcement");
  d.C.u = "javascript:alert(1)";
  assert.ok(!/<a href="javascript/i.test(renderCampaignHtml(d, ctx)));
  assert.ok(!renderCampaignHtml(d, ctx).includes("javascript:"));
});

test("edit mode shows chips for variables and placeholders; final mode does not", () => {
  const d = defaultDesign("announcement");
  d.C.headline = "Hi {{first_name|friend}}";
  const edit = layoutRows(d, { ...ctx, labels: { first_name: "First name" } }, "edit");
  assert.ok(edit.find((r) => r.slot === "headline")!.html.includes(">First name</span>"));
  assert.ok(edit.find((r) => r.slot === "logo")!.html.includes("Add your logo"));
  const final = layoutRows(d, ctx, "final");
  assert.equal(final.find((r) => r.slot === "logo"), undefined);
});

test("countdown: numbers are filled at send time, counting to 09:00 in the workspace zone", () => {
  const now = Date.UTC(2026, 11, 3, 9, 0, 0); // 2 days before the target at 09:00 UTC
  assert.deepEqual(countdownParts("2026-12-05", "UTC", now), { days: 2, hours: 0, mins: 0 });
  assert.deepEqual(countdownParts("2026-12-05", "Africa/Lagos", now), { days: 1, hours: 23, mins: 0 });
  assert.deepEqual(countdownParts("2020-01-01", "UTC", now), { days: 0, hours: 0, mins: 0 });
  const d = defaultDesign("event");
  d.C.d = "2026-12-05";
  const html = renderCampaignHtml(d, ctx);
  assert.ok(html.includes("[[sv-cd:days:2026-12-05]]"));
  assert.ok(fillCountdown(html, "UTC", now).includes(">2<"));
  assert.ok(!fillCountdown(html, "UTC", now).includes("sv-cd"));
});

test("zones: Lagos is UTC+1, so 09:00 there is 08:00 UTC", () => {
  assert.equal(zonedInstant("2026-12-05", "09:00", "UTC"), Date.UTC(2026, 11, 5, 9));
  assert.equal(scheduleInstant("2026-12-05", "09:00", "lagos"), Date.UTC(2026, 11, 5, 8));
  assert.equal(scheduleInstant("2026-12-05", "09:00", "utc"), Date.UTC(2026, 11, 5, 9));
  assert.equal(zonedInstant("nope", "09:00", "UTC"), null);
  // a zone with daylight saving: New York in July is UTC-4
  assert.equal(zonedInstant("2026-07-01", "09:00", "America/New_York"), Date.UTC(2026, 6, 1, 13));
});

test("sanitizeDesign drops what the browser must not send", () => {
  const d = sanitizeDesign({
    tpl: "nope", color: "javascript:red",
    banner: { src: "https://evil.example/pixel.gif", fx: 500, fy: -5, alt: "x" },
    blocks: [{ id: "a", t: "text", x: "ok" }, { id: "a", t: "html", x: "<script>" }, { id: "a", t: "heading", x: "dup id" }, { t: "image", url: "javascript:alert(1)" }],
    cond: { headline: "everyone-but-me", body: "lagos" },
  }, rule);
  assert.equal(d.tpl, "announcement");
  assert.equal(d.color, "#164e63", "anything that isn't #rrggbb falls back to the default colour");
  assert.equal(d.banner.src, "");
  assert.deepEqual([d.banner.fx, d.banner.fy], [100, 0]);
  assert.equal(d.blocks.length, 3);
  assert.equal(new Set(d.blocks.map((b) => b.id)).size, 3);
  assert.equal(d.blocks[2].url, undefined);
  assert.deepEqual(d.cond, { body: "lagos" });
  const ok = sanitizeDesign({ banner: { src: `${rule.prefix}b.jpg` } }, rule);
  assert.equal(ok.banner.src, `${rule.prefix}b.jpg`);
  assert.equal(sanitizeDesign({ banner: { src: "g3" } }, rule).banner.src, "g3");
  assert.equal(sanitizeDesign({ color: "#123456" }, rule).color, "#123456", "any #rrggbb colour is allowed");
  assert.equal(sanitizeDesign({ color: "#ABCDEF" }, rule).color, "#abcdef");
  assert.equal(sanitizeDesign({ color: "#12345" }, rule).color, "#164e63");
});

test("sanitizeLogo only accepts this workspace's uploads", () => {
  assert.equal(sanitizeLogo({ src: "https://evil.example/l.png" }, rule).src, "");
  const l = sanitizeLogo({ src: `${rule.prefix}l.png`, align: "center", size: "l", w: 400, h: 100 }, rule);
  assert.deepEqual([l.align, l.size, l.w, l.h], ["center", "l", 400, 100]);
  assert.equal(sanitizeLogo({ src: `${rule.prefix}l.png" onerror="x` }, rule).src, "");
});

test("older campaigns become a custom layout with a logo and a footer", () => {
  const d = designFromRow(null, [{ id: "1", type: "heading", text: "Hello" }, { id: "2", type: "spacer", height: 24 }, { id: "3", type: "button", label: "Go", url: "https://a.b" }], rule);
  assert.equal(d.tpl, "custom");
  assert.deepEqual(d.blocks.map((b) => b.t), ["logo", "heading", "button", "footer"]);
  assert.equal(d.blocks[2].u, "https://a.b");
  assert.equal(designFromLegacyBlocks([]).blocks.length, 2);
  assert.equal(designFromStarter("event")!.tpl, "event");
  assert.equal(designFromStarter("blank")!.tpl, "custom");
  assert.equal(designFromStarter("mine"), null);
});

test("switching layouts carries content over and sets the rest aside, and back", () => {
  const d = defaultDesign("announcement");
  d.C.headline = "Big news"; d.C.body = "Body"; d.C.btn = "Go"; d.C.u = "https://a.b"; d.cond.body = "lagos";
  const c = switchLayout(d, "custom");
  assert.deepEqual(c.blocks.map((b) => b.t), ["logo", "heading", "text", "button", "footer"]);
  assert.equal(c.blocks[2].cond, "lagos");
  c.blocks.splice(2, 0, newBlock("columns", c));
  const back = switchLayout(c, "newsletter");
  assert.equal(back.C.headline, "Big news");
  assert.equal(back.tray.length, 1);
  assert.equal(back.tray[0].t, "columns");
  const again = switchLayout(back, "custom");
  assert.ok(again.blocks.some((b) => b.t === "columns") && again.tray.length === 0);
});

test("variable audit: fallbacks, inline fallbacks and unreadable variables", () => {
  const defs = [{ key: "first_name", scope: "recipient" as const, value: "", fallback: "there" }];
  const a = auditVariables(["Hi {{first_name}}", "{{city}} and {{company|your team}}", "{{first name}}"], defs);
  assert.deepEqual(a.used, ["city", "company", "first_name"]);
  assert.deepEqual(a.missing, ["city"]);
  assert.deepEqual(a.malformed, ["{{first name}}"]);
});

const baseInput = (d: Design) => ({
  subject: "Hello", design: d, logo: EMPTY_LOGO, variables: [],
  audience: { chosen: true, name: "All subscribers", size: 10 },
  sender: { ok: true, label: "A <a@b.c>", problem: null }, addressSet: true,
});

test("review checks: what blocks sending and what only warns", () => {
  const d = defaultDesign("announcement");
  d.C.u = "https://a.b";
  const ok = reviewChecks(baseInput(d));
  assert.ok(ok.every((c) => c.ok));
  assert.ok(ok.find((c) => c.key === "logo")!.warn);

  d.C.u = "";
  assert.equal(reviewChecks(baseInput(d)).find((c) => c.key === "buttons")!.ok, false);
  const custom = defaultDesign("custom");
  custom.blocks = [{ id: "t", t: "text", x: "x" }];
  assert.equal(reviewChecks(baseInput(custom)).find((c) => c.key === "unsubscribe")!.ok, false);
  const none = reviewChecks({ ...baseInput(d), subject: " ", audience: { chosen: false, name: "", size: 0 }, addressSet: false, sender: { ok: false, label: "", problem: "The sender is deactivated." } });
  assert.deepEqual(none.filter((c) => !c.ok).map((c) => c.key), ["subject", "sender", "audience", "address", "buttons"]);
  const zero = reviewChecks({ ...baseInput(d), audience: { chosen: true, name: "VIPs", size: 0 } });
  assert.equal(zero.find((c) => c.key === "audience")!.ok, false);
  const product = defaultDesign("product");
  product.C.u = "https://a.b";
  assert.ok(reviewChecks(baseInput(product)).find((c) => c.key === "products")!.warn);
});

test("content scan", () => {
  const d = defaultDesign("announcement");
  d.C.body = "x".repeat(60);
  assert.deepEqual(scanContent("A good subject", "pre", d).reasons, []);
  const bad = scanContent("FREE MONEY NOW!! WINNER!!", "", d);
  assert.ok(bad.score >= 60 && bad.reasons.length >= 3);
});

test("built-in templates are exactly the editor's layouts, each with starting content and a design", () => {
  assert.deepEqual(BUILT_IN_TEMPLATES.map((t) => t.id), ["blank", "announcement", "newsletter", "promo", "event", "product"]);
  for (const t of BUILT_IN_TEMPLATES) {
    const d = designFromStarter(t.id)!;
    assert.equal(d.tpl, t.id === "blank" ? "custom" : t.id);
    if (t.id !== "blank") {
      assert.equal(t.name, TEMPLATE_NAMES[t.id as TemplateKey], "named as in the editor");
      assert.ok(t.subject && t.previewText);
      assert.ok(renderCampaignHtml(d, { logo: EMPTY_LOGO, tz: "UTC" }).includes(d.C.headline));
    }
  }
});
