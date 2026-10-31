import assert from "node:assert/strict";
import { test } from "node:test";
import { personalize } from "../src/lib/email/blocks";
import { analyzeVariables, knownKeys, sanitizeVariables, toVariableKey, type VariableDef } from "../src/lib/email/variables";
import { buildPreviewDoc, makeInert } from "../src/lib/email/preview";

const defs: VariableDef[] = [
  { key: "offer_code", scope: "campaign", value: "SPRING20", fallback: "" },
  { key: "company", scope: "recipient", value: "", fallback: "your team" },
];

test("recipient value wins, then campaign value, then inline fallback, then variable fallback", () => {
  const ada = { first_name: "Ada", last_name: null, email: "ada@x.test", custom_fields: { company: "Analytical Engines" } };
  assert.equal(personalize("Hi {{first_name}} at {{company}}", ada, defs), "Hi Ada at Analytical Engines");
  const nobody = { first_name: null, last_name: null, email: "n@x.test" };
  assert.equal(personalize("Hi {{first_name}}", nobody, defs), "Hi there"); // built-in default
  assert.equal(personalize("Hi {{first_name|friend}}", nobody, defs), "Hi friend"); // inline beats default
  assert.equal(personalize("Hi{{first_name|}}!", nobody, defs), "Hi!"); // explicit empty = nothing
  assert.equal(personalize("{{company}}", nobody, defs), "your team"); // variable-level fallback
  assert.equal(personalize("Code {{offer_code}}", nobody, defs), "Code SPRING20"); // campaign value
  assert.equal(personalize("{{ FIRST_NAME }}", { first_name: "Zed", last_name: null, email: "z@x.test" }, defs), "Zed"); // case + spaces
});

test("values are HTML-escaped and not re-scanned for variables", () => {
  const evil = { first_name: "<b>{{email}}</b>", last_name: null, email: "e@x.test" };
  const out = personalize("{{first_name}}", evil, []);
  assert.equal(out, "&lt;b&gt;{{email}}&lt;/b&gt;");
  assert.equal(personalize("{{x|a & b}}", evil, []), "a &amp; b");
});

test("sanitizeVariables drops bad keys, duplicates and built-in clashes", () => {
  const out = sanitizeVariables([
    { key: "Offer_Code", scope: "campaign", value: "A", fallback: "" },
    { key: "offer_code", scope: "campaign", value: "dup", fallback: "" },
    { key: "1bad", scope: "campaign", value: "x", fallback: "" },
    { key: "first_name", scope: "campaign", value: "hijack", fallback: "pal" },
    "nope", null,
  ]);
  assert.deepEqual(out.map((v) => v.key), ["offer_code", "first_name"]);
  const fn = out.find((v) => v.key === "first_name")!;
  assert.equal(fn.scope, "recipient"); // a campaign variable can't take over a built-in
  assert.equal(fn.value, "");
});

test("analyzeVariables flags undefined and unreadable variables", () => {
  const known = knownKeys(["plan"], defs);
  const r = analyzeVariables(["Hi {{first_name}} {{plan}} {{offer_code}}", "{{mystery}}", "{{ok|fine}}", "{{first name}}", "{{company}}"], known, defs);
  assert.deepEqual(r.undefinedKeys, ["mystery"]);
  assert.deepEqual(r.malformed, ["{{first name}}"]);
  assert.ok(r.used.includes("ok"));
});

test("toVariableKey", () => {
  assert.equal(toVariableKey("Offer code!"), "offer_code");
  assert.equal(toVariableKey("  Plan Type "), "plan_type");
});

test("preview resolves campaign variables and is inert", () => {
  const doc = buildPreviewDoc(
    [{ id: "a", type: "button", label: "Use {{offer_code}}", url: "https://example.com/buy", align: "center" } as never],
    { workspaceName: "Acme", variables: defs },
  );
  assert.match(doc, /Use SPRING20/);
  assert.doesNotMatch(doc, /href="https:\/\/example\.com\/buy"/); // links have no destination
  assert.match(doc, /pointer-events:none/);
  assert.equal(makeInert("<a href=\"x\">t</a>").includes('href="x"'), false);
});
