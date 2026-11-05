import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { planLimits } from "../src/config/plan-limits";

const sql = readFileSync(new URL("../supabase/migrations/0017_account_subscriptions.sql", import.meta.url), "utf8");

test("the plan numbers repeated in the migration match the central config", () => {
  // contact_pool_limit appears as `case m.plan when 'starter' then 5000 when 'growth' then 27000 when 'pro' then 27000 ...`
  assert.ok(sql.includes(`when 'starter' then ${planLimits.starter.contacts} when 'growth' then ${planLimits.growth.contacts} when 'pro' then ${planLimits.pro.contacts}`), "backfill contact limits drifted from plan-limits.ts");
  assert.ok(sql.includes(`case chosen when 'starter' then ${planLimits.starter.contacts} else ${planLimits.growth.contacts} end`), "new-account contact limit drifted from plan-limits.ts");
  assert.equal(planLimits.growth.contacts, planLimits.pro.contacts, "the new-account trigger assumes Growth and Pro share a contact pool");
  assert.ok(sql.includes(`when 'starter' then ${planLimits.starter.businesses} when 'growth' then ${planLimits.growth.businesses} when 'pro' then ${planLimits.pro.businesses}`), "business slots drifted from plan-limits.ts");
});

test("the migration removes the free plan and guards the pool", () => {
  assert.ok(sql.includes("alter column plan set default 'starter'"));
  assert.ok(sql.includes("create trigger contacts_pool_guard"));
  assert.ok(sql.includes("pg_advisory_xact_lock"));
  assert.ok(sql.includes("billing_events"));
});
