import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateDkim, evaluateDmarc, evaluateSpf } from "../src/server/sending/domains";

test("SPF", () => {
  assert.equal(evaluateSpf([]).status, "missing");
  assert.equal(evaluateSpf(["google-site-verification=abc"]).status, "missing");
  assert.equal(evaluateSpf(["v=spf1 include:_spf.google.com ~all"]).status, "incorrect");
  assert.equal(evaluateSpf(["v=spf1 include:amazonses.com ~all", "v=spf1 -all"]).status, "incorrect"); // two records
  assert.equal(evaluateSpf(["v=spf1 include:_spf.google.com include:amazonses.com ~all"]).status, "ok");
  assert.equal(evaluateSpf(["v=spf1 include:amazonses.com.evil.test ~all"]).status, "incorrect");
});

test("DMARC", () => {
  assert.equal(evaluateDmarc([]).status, "missing");
  assert.equal(evaluateDmarc(["v=DMARC1; rua=mailto:a@b.c"]).status, "incorrect"); // no policy
  assert.equal(evaluateDmarc(["v=DMARC1; p=bogus"]).status, "incorrect");
  assert.equal(evaluateDmarc(["v=DMARC1; p=none;"]).status, "ok");
  assert.equal(evaluateDmarc(["v=DMARC1; p=reject; pct=100"]).status, "ok");
  assert.equal(evaluateDmarc(["v=DMARC1; p=none", "v=DMARC1; p=reject"]).status, "incorrect");
});

test("DKIM explains which record is wrong, but the provider decides", () => {
  const recs = [
    { host: "a._domainkey.x.test", expected: "a.dkim.amazonses.com", found: [] as string[] },
    { host: "b._domainkey.x.test", expected: "b.dkim.amazonses.com", found: ["wrong.example.com"] },
  ];
  assert.equal(evaluateDkim("success", recs).status, "ok");
  const missing = evaluateDkim("pending", recs);
  assert.equal(missing.status, "incorrect");
  assert.match(missing.message, /no CNAME/);
  assert.match(missing.message, /instead of b\.dkim\.amazonses\.com/);
  const good = recs.map((r) => ({ ...r, found: [r.expected + "."] }));
  assert.equal(evaluateDkim("pending", good).status, "pending");
  assert.equal(evaluateDkim("failed", good).status, "incorrect");
});

test("invite tokens can't be forged", async () => {
  process.env.APP_SECRET = "test-secret-test-secret-test-secret"; // read when the module loads, so import afterwards
  const { inviteToken, parseInviteToken } = await import("../src/lib/tokens");
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const t = inviteToken(id);
  assert.equal(parseInviteToken(t), id);
  assert.equal(parseInviteToken(t.replace(id, "123e4567-e89b-12d3-a456-426614174001")), null);
  assert.equal(parseInviteToken(`${id}.deadbeef`), null);
  assert.equal(parseInviteToken(""), null);
});
