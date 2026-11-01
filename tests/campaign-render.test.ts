import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultDesign, EMPTY_LOGO, renderCampaignHtml } from "../src/lib/email/campaign";
import { buildCampaignDoc } from "../src/lib/email/campaign-preview";

process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://app.example";

const ws = { name: "WLA", business_address: "12 Marina, Lagos", track_opens: false, timezone: "UTC" };

async function build(html: string, contact: { first_name: string | null; custom_fields?: Record<string, unknown> }, sendId: string | null = "00000000-0000-4000-8000-000000000001") {
  const { buildEmail } = await import("../src/server/sending/render");
  return buildEmail({ campaign: { id: "c", subject: "Hi {{first_name}}", from_name: "Fidelis", from_email: "hello@wla.example", html, variables: [{ key: "first_name", scope: "recipient", value: "", fallback: "friend" }] }, workspace: ws, contact: { last_name: null, email: "a@b.c", ...contact }, sendId });
}

function design() {
  const d = defaultDesign("custom");
  d.blocks = [
    { id: "h", t: "heading", x: "Hello {{first_name}}" },
    { id: "l", t: "text", x: "Lagos only", cond: "lagos" },
    { id: "b", t: "button", x: "Shop", u: "https://shop.example/a?x=1&y=2" },
    { id: "c", t: "countdown", d: "2099-01-01" },
    { id: "f", t: "footer", x: "You subscribed." },
  ];
  return d;
}

test("each recipient gets their own blocks, tracked links, a working unsubscribe link and the address", async () => {
  const html = renderCampaignHtml(design(), { logo: EMPTY_LOGO, tz: "UTC" }, "pre");
  const lagos = await build(html, { first_name: "Ada", custom_fields: { city: "Lagos" } });
  const other = await build(html, { first_name: null, custom_fields: { city: "Asaba" } });

  assert.ok(lagos.html.includes("Hello Ada") && lagos.html.includes("Lagos only"));
  assert.ok(other.html.includes("Hello friend") && !other.html.includes("Lagos only"));
  assert.ok(!lagos.html.includes("sv-if") && !lagos.html.includes("[[sv-"));

  // the shop link is click-tracked, the unsubscribe link is not
  assert.ok(lagos.html.includes("/api/track/click?s=00000000-0000-4000-8000-000000000001"));
  const unsub = lagos.html.match(/href="(https:\/\/app\.example\/u\/[^"]+)"/);
  assert.ok(unsub, "unsubscribe link points at the real /u/ page");
  assert.ok(!lagos.html.includes("\u0001"));

  // one footer only: the block's, plus the address
  assert.equal((lagos.html.match(/Unsubscribe/g) ?? []).length, 1);
  assert.ok(lagos.html.includes("12 Marina, Lagos"));
  assert.ok(lagos.text.includes("12 Marina, Lagos") && lagos.text.includes("Hello Ada"));
  assert.ok(lagos.headers?.["List-Unsubscribe"]);
  assert.equal(lagos.subject, "Hi Ada");
  assert.equal(other.subject, "Hi friend");
});

test("the countdown is a number when it is sent", async () => {
  const html = renderCampaignHtml(design(), { logo: EMPTY_LOGO, tz: "UTC" });
  const mail = await build(html, { first_name: "Ada" });
  assert.ok(!/\[\[sv-cd/.test(mail.html));
  assert.ok(/>\d{4,}</.test(mail.html), "days until 2099 is a large number");
});

test("a contact's own text can't inject the unsubscribe marker or markup", async () => {
  const html = renderCampaignHtml(design(), { logo: EMPTY_LOGO, tz: "UTC" });
  const mail = await build(html, { first_name: "[[sv-unsub]]<b>x</b>" });
  assert.ok(mail.html.includes("Hello [[sv-unsub]]&lt;b&gt;x&lt;/b&gt;"));
});

test("campaigns saved before the new editor keep their complete footer", async () => {
  const old = "<html><body><p>Hi</p><!--FOOTER--></body></html>";
  const mail = await build(old, { first_name: "Ada" });
  assert.ok(mail.html.includes("You are receiving this email because you subscribed to WLA"));
  assert.ok(mail.html.includes("/u/"));
});

test("the preview shows exactly what that contact receives", () => {
  const d = design();
  const lagos = buildCampaignDoc(d, { logo: EMPTY_LOGO, tz: "UTC" }, { preheader: "", contact: { first_name: "Ada", custom_fields: { city: "Lagos" } }, variables: [], businessAddress: "12 Marina, Lagos" });
  const none = buildCampaignDoc(d, { logo: EMPTY_LOGO, tz: "UTC" }, { preheader: "", contact: null, variables: [], businessAddress: null, dark: true });
  assert.ok(lagos.includes("Lagos only") && lagos.includes("12 Marina, Lagos"));
  assert.ok(!none.includes("Lagos only") && none.includes("Your business address") && none.includes("#1B1D21"));
  assert.ok(!/<a [^>]*href=/i.test(lagos), "links in the preview are inert");
});
