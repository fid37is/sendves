import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBrandColor, checkCompany, checkWebsite, companyVariables, formatAddress, isTimeZone } from "../src/lib/company";

test("the address is one line for the email footer", () => {
  assert.equal(
    formatAddress({ line1: "12 Marina Road", line2: "Suite 4", city: "Lagos", region: "Lagos State", postalCode: "100001", country: "Nigeria" }),
    "12 Marina Road, Suite 4, Lagos, Lagos State 100001, Nigeria",
  );
  assert.equal(formatAddress({ line1: "1 High St", city: "Leeds", country: "UK" }), "1 High St, Leeds, UK");
  assert.equal(formatAddress({}), "");
});

test("website gets https and rejects junk", () => {
  assert.deepEqual(checkWebsite("example.com"), { ok: true, value: "https://example.com" });
  assert.deepEqual(checkWebsite(""), { ok: true, value: "" });
  assert.equal(checkWebsite("javascript:alert(1)").ok, false);
  assert.equal(checkWebsite("not a site").ok, false);
});

test("company details: name required, partial address refused", () => {
  assert.equal(checkCompany({ name: "" }).ok, false);
  assert.equal(checkCompany({ name: "Acme", line1: "1 High St" }).ok, false);
  const ok = checkCompany({ name: " Acme  Ltd ", email: "Hi@Acme.com", phone: "+234 801 234 5678", line1: "1 High St", city: "Leeds", country: "UK" });
  assert.ok(ok.ok);
  if (ok.ok) { assert.equal(ok.value.name, "Acme Ltd"); assert.equal(ok.value.email, "hi@acme.com"); }
  assert.equal(checkCompany({ name: "Acme", email: "nope" }).ok, false);
  assert.equal(checkCompany({ name: "Acme", phone: "abc" }).ok, false);
  assert.ok(checkCompany({ name: "Acme" }).ok);
});

test("brand colour: hex only, the default is stored as null", () => {
  assert.deepEqual(checkBrandColor("#1D4ED8", "#164e63"), { ok: true, value: "#1d4ed8" });
  assert.deepEqual(checkBrandColor("#164E63", "#164e63"), { ok: true, value: null });
  assert.equal(checkBrandColor("red", "#164e63").ok, false);
});

test("company variables only include filled-in details", () => {
  const v = companyVariables({ name: "Acme", address: "", phone: " 123 ", email: null, website: "https://acme.com" });
  assert.deepEqual(v.map((x) => x.key), ["company_name", "company_phone", "company_website"]);
  assert.ok(v.every((x) => x.scope === "campaign"));
});

test("time zones", () => {
  assert.ok(isTimeZone("Africa/Lagos"));
  assert.ok(!isTimeZone("Mars/Base"));
  assert.ok(!isTimeZone("../etc"));
});
