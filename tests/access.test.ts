import assert from "node:assert/strict";
import { test } from "node:test";
import { assignableRoles, buildAccess, can, canAccessDepartment, canAssignDepartment, canManageRole, sanitizePermissions, ALL_PERMISSIONS, CAMPAIGN_ROLES } from "../src/lib/access";

const D1 = "11111111-1111-1111-1111-111111111111";
const D2 = "22222222-2222-2222-2222-222222222222";

test("owner can do everything and cannot be reduced", () => {
  const owner = buildAccess("owner", ["campaigns.view"], []);
  for (const p of ALL_PERMISSIONS) assert.ok(can(owner, p));
  assert.ok(owner.allDepartments);
});

test("campaign roles run campaigns but never manage the organization", () => {
  for (const role of CAMPAIGN_ROLES) {
    const a = buildAccess(role, null, [D1]);
    assert.ok(can(a, "campaigns.manage") && can(a, "campaigns.send") && can(a, "contacts.manage") && can(a, "templates.manage") && can(a, "reports.view"), role);
    assert.ok(!can(a, "members.manage") && !can(a, "billing.manage") && !can(a, "roles.manage") && !can(a, "domains.manage"), role);
  }
});

test("overrides are sanitised: roles.manage can't be delegated, manage implies view", () => {
  const p = sanitizePermissions(["roles.manage", "domains.manage", "nonsense", "campaigns.send"], "sales");
  assert.ok(!p.includes("roles.manage" as never));
  assert.ok(p.includes("domains.view") && p.includes("campaigns.view"));
  assert.ok(!p.includes("nonsense" as never));
  const custom = buildAccess("operations", ["domains.manage"], []);
  assert.ok(can(custom, "domains.manage") && !can(custom, "members.manage"));
});

test("department scope", () => {
  const marketing = buildAccess("marketing", null, [D1]);
  assert.ok(canAccessDepartment(marketing, null));
  assert.ok(canAccessDepartment(marketing, D1));
  assert.ok(!canAccessDepartment(marketing, D2));
  const owner = buildAccess("owner", null, []);
  assert.ok(canAccessDepartment(owner, D2));
  assert.ok(!canAccessDepartment(null, null));
});

test("who may assign which department", () => {
  const sales = buildAccess("sales", null, [D1]);
  assert.ok(canAssignDepartment(sales, D1) && !canAssignDepartment(sales, D2));
  assert.ok(!canAssignDepartment(sales, null)); // in a department: can't create org-wide resources
  const loner = buildAccess("sales", null, []);
  assert.ok(canAssignDepartment(loner, null)); // no departments yet: org-wide works
});

test("only the owner manages people, and only into the campaign roles", () => {
  for (const role of CAMPAIGN_ROLES) {
    assert.ok(canManageRole("owner", role));
    assert.ok(!canManageRole(role, "owner") && !canManageRole(role, role));
    assert.deepEqual(assignableRoles(role), []);
  }
  assert.ok(!canManageRole("owner", "owner"));
  assert.deepEqual(assignableRoles("owner"), ["marketing", "sales", "operations"]);
  assert.ok(!can(buildAccess("marketing", null, []), "members.manage"));
});
