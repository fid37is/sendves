import assert from "node:assert/strict";
import { test } from "node:test";
import { judge } from "../src/server/abuse";

const S = { pause_bounce_pct: 5, pause_complaint_pct: 0.3, suspend_complaint_pct: 0.5, health_min_sample: 50 };

test("too few sends is never judged", () => {
  assert.equal(judge({ sent: 49, bounced: 49, complained: 49 }, S).verdict, "ok");
  assert.equal(judge({ sent: 0, bounced: 0, complained: 0 }, S).verdict, "ok");
});

test("healthy numbers are ok", () => {
  assert.equal(judge({ sent: 1000, bounced: 10, complained: 1 }, S).verdict, "ok");
});

test("bounce rate at the threshold pauses", () => {
  assert.equal(judge({ sent: 100, bounced: 5, complained: 0 }, S).verdict, "pause");
  assert.equal(judge({ sent: 100, bounced: 4, complained: 0 }, S).verdict, "ok");
});

test("complaint rate pauses, then suspends", () => {
  assert.equal(judge({ sent: 1000, bounced: 0, complained: 3 }, S).verdict, "pause"); // 0.3%
  assert.equal(judge({ sent: 1000, bounced: 0, complained: 5 }, S).verdict, "suspend"); // 0.5%
});

test("suspension wins over a pause when both are breached", () => {
  assert.equal(judge({ sent: 200, bounced: 20, complained: 2 }, S).verdict, "suspend");
});

test("the minimum sample comes from settings", () => {
  assert.equal(judge({ sent: 20, bounced: 10, complained: 0 }, { ...S, health_min_sample: 10 }).verdict, "pause");
});
