import assert from "node:assert/strict";
import { test } from "node:test";
import { personalize } from "../src/lib/email/blocks";
import {
  applyConditions, badButtons, contentChecks, defaultDesign, emptyBrand, hasUnsubscribeBlock, matchesCondition, newBlock, renderEmailHtml, resolveCountdowns,
  sanitizeDesign, switchSummary, switchTemplate, zonedToUtc, type Design,
} from "../src/lib/email/design";

const brand = emptyBrand();

test("the default design renders a complete email with an unsubscribe marker", () => {
  const html = renderEmailHtml(defaultDesign(), brand, { preheader: "Hello there" });
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Reserve my spot/);
  assert.match(html, /<!--UNSUB-->/);
  assert.match(html, /display:none/); // preheader
  assert.doesNotMatch(html, /<script/i);
});

test("text is escaped and variables stay as tokens until send time", () => {
  const d = defaultDesign();
  d.tpl = "announcement"; d.C.headline = "Hi {{first_name}} <script>alert(1)</script>";
  const html = renderEmailHtml(d, brand);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(personalize(html, { first_name: "Ada" }), /Hi Ada/);
});

test("unsafe links are never rendered as links", () => {
  const d = defaultDesign();
  d.C.u = "javascript:alert(1)";
  assert.doesNotMatch(renderEmailHtml(d, brand), /javascript:/);
  assert.deepEqual(badButtons(d), [{ slot: "button" }]);
  d.C.u = "https://example.com/ok";
  assert.deepEqual(badButtons(d), []);
});

test("conditions are decided per recipient", () => {
  const d: Design = { ...defaultDesign(), cond: { headline: "lagos", body: "company" } };
  const html = renderEmailHtml(d, brand);
  const lagos = applyConditions(html, { first_name: "A", custom_fields: { city: "Lagos" } });
  assert.match(lagos, /big news/); assert.doesNotMatch(lagos, /new season/);
  const acme = applyConditions(html, { custom_fields: { city: "Abuja", company: "Acme" } });
  assert.doesNotMatch(acme, /big news/); assert.match(acme, /new season/);
  assert.equal(matchesCondition("nolagos", null), true);
  assert.equal(matchesCondition("named", { first_name: " " }), false);
  assert.doesNotMatch(applyConditions(html, {}), /sv-if/); // no marker ever reaches an inbox
});

test("countdown shows the time left when it is sent", () => {
  const d = defaultDesign(); d.tpl = "event"; d.C.d = "2026-12-05";
  const html = renderEmailHtml(d, brand);
  assert.match(html, /\[\[cd:d:2026-12-05\]\]/);
  const target = zonedToUtc("2026-12-05", "09:00", "Africa/Lagos").getTime();
  const out = resolveCountdowns(html, { now: target - (3 * 864e5 + 5 * 36e5 + 7 * 6e4), tz: "Africa/Lagos" });
  assert.doesNotMatch(out, /\[\[cd/);
  assert.match(out, />3<\/div>/); assert.match(out, />5<\/div>/); assert.match(out, />7<\/div>/);
  assert.match(resolveCountdowns(html, { now: target + 1e6 }), />0<\/div>/); // never negative
});

test("zonedToUtc handles Lagos (UTC+1, no DST) and UTC", () => {
  assert.equal(zonedToUtc("2026-12-05", "09:00", "Africa/Lagos").toISOString(), "2026-12-05T08:00:00.000Z");
  assert.equal(zonedToUtc("2026-12-05", "09:00", "UTC").toISOString(), "2026-12-05T09:00:00.000Z");
});

test("sanitizeDesign only accepts the workspace's own pictures", () => {
  const own = "https://x.supabase.co/storage/v1/object/public/email-assets/ws1/banner/a.png";
  const ok = (u: string) => u.startsWith("https://x.supabase.co/storage/v1/object/public/email-assets/ws1/");
  const d = sanitizeDesign({ ...defaultDesign(), banner: { src: own, fx: 150, fy: -5, alt: "a" }, color: "red; background:url(x)" }, ok);
  assert.equal(d.banner.src, own);
  assert.equal(d.banner.fx, 100); assert.equal(d.banner.fy, 0);
  assert.equal(d.color, defaultDesign().color);
  const evil = sanitizeDesign({ ...defaultDesign(), banner: { src: "https://evil.test/track.png", fx: 50, fy: 50, alt: "" } }, ok);
  assert.equal(evil.banner.src, "");
  assert.equal(sanitizeDesign("junk").tpl, "announcement");
  const dupes = sanitizeDesign({ ...defaultDesign(), blocks: [{ id: 3, t: "text", x: "a" }, { id: 3, t: "text", x: "b" }, { id: 4, t: "nope" }] });
  assert.equal(new Set(dupes.blocks.map((b) => b.id)).size, dupes.blocks.length);
  assert.equal(dupes.blocks.length, 2);
});

test("switching layouts carries content across and sets the rest aside", () => {
  const base = defaultDesign();
  const custom = switchTemplate(base, "custom");
  assert.equal(custom.tpl, "custom");
  assert.ok(custom.blocks.some((b) => b.t === "heading" && b.x === base.C.headline));
  const withExtra: Design = { ...custom, blocks: [...custom.blocks, { ...newBlock(custom, "columns"), id: 99 }] };
  assert.deepEqual(switchSummary(withExtra, "promo").aside, ["Columns"]);
  const back = switchTemplate(withExtra, "promo");
  assert.equal(back.tpl, "promo");
  assert.equal(back.C.headline, base.C.headline);
  assert.equal(back.tray.length, 1);
  assert.ok(switchTemplate(back, "custom").blocks.some((b) => b.t === "columns")); // returns
});

test("custom layouts need a footer for the unsubscribe line", () => {
  const custom = switchTemplate(defaultDesign(), "custom");
  assert.equal(hasUnsubscribeBlock(custom), true);
  assert.equal(hasUnsubscribeBlock({ ...custom, blocks: custom.blocks.filter((b) => b.t !== "footer") }), false);
});

test("content checks flag common mistakes", () => {
  const d = defaultDesign();
  const r = contentChecks(d, "URGENT!! FREE CASH NOW", "");
  assert.ok(r.score >= 40 && r.notes.length >= 3);
  assert.equal(contentChecks(d, "Autumn news from us", "A short preview line").notes.length, 0);
});

test("buildEmail: each recipient gets only their sections, a real unsubscribe link and no markers", async () => {
  process.env.APP_SECRET = "test-secret-test-secret-test-secret";
  const { buildEmail } = await import("../src/server/sending/render");
  const d: Design = { ...defaultDesign(), cond: { headline: "lagos" } };
  const html = renderEmailHtml(d, brand);
  const base = { id: "c1", subject: "Hi {{first_name}}", from_name: "Acme", from_email: "a@acme.test", html, variables: [{ key: "city", scope: "recipient" as const, value: "", fallback: "your city" }] };
  const ws = { name: "Acme", business_address: "1 Main St, Lagos", track_opens: true, timezone: "Africa/Lagos" };
  const sendId = "123e4567-e89b-12d3-a456-426614174000";
  const lagos = buildEmail({ campaign: base, workspace: ws, contact: { first_name: "Ada", last_name: null, email: "ada@x.test", custom_fields: { city: "Lagos" } }, sendId });
  const other = buildEmail({ campaign: base, workspace: ws, contact: { first_name: null, last_name: null, email: "bo@x.test" }, sendId });
  assert.match(lagos.html, /big news/); assert.doesNotMatch(other.html, /big news/);
  assert.match(lagos.subject, /Hi Ada/); assert.match(other.subject, /Hi there/);
  for (const m of [lagos, other]) {
    assert.doesNotMatch(m.html, /<!--UNSUB-->|<!--sv-if|\[\[cd:|\{\{/);
    assert.match(m.html, /Unsubscribe<\/a>/); assert.match(m.html, /1 Main St, Lagos/);
    assert.match(m.html, /api\/track\/open/);
  }
  assert.match(other.html, /your city/); // variable fallback
  // A hand-made email with no marker still gets the legal footer.
  const bare = buildEmail({ campaign: { ...base, html: "<html><body><p>x</p></body></html>" }, workspace: ws, contact: { first_name: null, last_name: null, email: "c@x.test" }, sendId });
  assert.match(bare.html, /Unsubscribe<\/a>/);
});
