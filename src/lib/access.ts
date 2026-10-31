/**
 * Roles and permissions. Pure and dependency-free, so the same rules run in server actions (where
 * they are ENFORCED) and in the browser (where they only decide what to show).
 *
 * Model
 *  - A person has one role per organization (workspace): owner (the administrator), or one of the
 *    campaign roles: marketing, sales, operations.
 *  - Each role has a set of permissions. The defaults below can be changed per organization by the
 *    owner (Team → Roles), except for the owner, who can always do everything.
 *  - Resources (campaigns, lists, templates) can belong to a department. A resource
 *    with no department is visible to the whole organization. A resource in a department is visible
 *    to the department's members and to anyone with the "access.all_departments" permission.
 */

export const ROLES = ["owner", "marketing", "sales", "operations"] as const;
export type MemberRole = (typeof ROLES)[number];

/** The roles people are invited into: the people who run campaigns. The owner is the administrator and is never invited. */
export const CAMPAIGN_ROLES = ["marketing", "sales", "operations"] as const;
export type CampaignRole = (typeof CAMPAIGN_ROLES)[number];

export const ROLE_LABEL: Record<MemberRole, string> = { owner: "Owner (Admin)", marketing: "Marketing", sales: "Sales", operations: "Operations" };

export const ROLE_BLURB: Record<MemberRole, string> = {
  owner: "Full control: organization settings, billing, team, domains and permissions.",
  marketing: "Runs marketing campaigns, contacts and templates.",
  sales: "Runs sales and outreach campaigns, contacts and templates.",
  operations: "Runs operational and customer communication campaigns, contacts and templates.",
};

/** The owner can manage everyone else. Nobody else manages anyone, and the owner is never managed. */
export const ROLE_RANK: Record<MemberRole, number> = { owner: 2, marketing: 1, sales: 1, operations: 1 };

export const PERMISSION_LIST = [
  { key: "org.settings", group: "Organization", label: "Edit organization settings" },
  { key: "billing.manage", group: "Organization", label: "Manage billing and plan" },
  { key: "members.view", group: "Team", label: "View team members" },
  { key: "members.manage", group: "Team", label: "Invite, edit and remove members, and manage their work emails and aliases" },
  { key: "departments.manage", group: "Team", label: "Create, rename and delete departments" },
  { key: "roles.manage", group: "Team", label: "Change what each role can do" },
  { key: "domains.view", group: "Sending", label: "View sending domains" },
  { key: "domains.manage", group: "Sending", label: "Add, verify and remove sending domains" },
  { key: "campaigns.view", group: "Campaigns", label: "View campaigns" },
  { key: "campaigns.manage", group: "Campaigns", label: "Create, edit and delete campaign drafts" },
  { key: "campaigns.send", group: "Campaigns", label: "Send, schedule, pause and cancel campaigns" },
  { key: "contacts.view", group: "Audience", label: "View contacts and lists" },
  { key: "contacts.manage", group: "Audience", label: "Add, import, edit and delete contacts and lists" },
  { key: "templates.view", group: "Content", label: "View and use templates" },
  { key: "templates.manage", group: "Content", label: "Create, edit, duplicate and delete templates" },
  { key: "reports.view", group: "Content", label: "View reports" },
  { key: "access.all_departments", group: "Access", label: "Access every department’s resources" },
] as const;

export type Permission = (typeof PERMISSION_LIST)[number]["key"];
export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_LIST.map((p) => p.key);
const VALID = new Set<string>(ALL_PERMISSIONS);

/** Permissions the owner can never hand to another role: otherwise an admin could grant themselves everything. */
export const OWNER_ONLY: readonly Permission[] = ["roles.manage"];

const CAMPAIGN_DEFAULTS: readonly Permission[] = [
  "campaigns.view", "campaigns.manage", "campaigns.send", "contacts.view", "contacts.manage",
  "templates.view", "templates.manage", "reports.view",
];

export const DEFAULT_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  marketing: CAMPAIGN_DEFAULTS,
  sales: CAMPAIGN_DEFAULTS,
  operations: CAMPAIGN_DEFAULTS,
};

/** Being allowed to change something implies being allowed to see it. */
const IMPLIES: Partial<Record<Permission, Permission>> = {
  "members.manage": "members.view",
  "domains.manage": "domains.view",
  "campaigns.manage": "campaigns.view",
  "campaigns.send": "campaigns.view",
  "contacts.manage": "contacts.view",
  "templates.manage": "templates.view",
};

/** Keeps only known permissions a role may hold, and adds the "view" each "manage" depends on. */
export function sanitizePermissions(input: unknown, role: MemberRole): Permission[] {
  if (role === "owner") return [...ALL_PERMISSIONS];
  const out = new Set<Permission>();
  if (Array.isArray(input)) {
    for (const p of input) {
      if (typeof p === "string" && VALID.has(p) && !OWNER_ONLY.includes(p as Permission)) out.add(p as Permission);
    }
  }
  for (const p of [...out]) {
    const needed = IMPLIES[p];
    if (needed) out.add(needed);
  }
  return ALL_PERMISSIONS.filter((p) => out.has(p));
}

export type Access = {
  role: MemberRole;
  permissions: ReadonlySet<Permission>;
  /** Departments this person belongs to. */
  departmentIds: readonly string[];
  /** True when department boundaries don't apply to this person. */
  allDepartments: boolean;
};

/** `overrides` is the organization's saved permission list for the role, or null to use the defaults. */
export function buildAccess(role: MemberRole, overrides: unknown | null | undefined, departmentIds: readonly string[]): Access {
  const list = role === "owner" ? [...ALL_PERMISSIONS] : overrides == null ? sanitizePermissions(DEFAULT_PERMISSIONS[role], role) : sanitizePermissions(overrides, role);
  const permissions = new Set<Permission>(list);
  return { role, permissions, departmentIds, allDepartments: permissions.has("access.all_departments") };
}

export function can(access: Access | null | undefined, permission: Permission): boolean {
  return !!access && access.permissions.has(permission);
}

export function canAny(access: Access | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(access, p));
}

/** May this person see and work with a resource that belongs to `departmentId` (null = whole organization)? */
export function canAccessDepartment(access: Access | null | undefined, departmentId: string | null | undefined): boolean {
  if (!access) return false;
  if (!departmentId) return true;
  return access.allDepartments || access.departmentIds.includes(departmentId);
}

/**
 * May this person put a NEW resource in `departmentId` (null = whole organization)?
 *  - People with access to every department can choose anything.
 *  - Everyone else can only use their own departments. If they belong to none, they can only create
 *    organization-wide resources, so a small team without departments still works.
 */
export function canAssignDepartment(access: Access | null | undefined, departmentId: string | null | undefined): boolean {
  if (!access) return false;
  if (access.allDepartments) return true;
  if (!departmentId) return access.departmentIds.length === 0;
  return access.departmentIds.includes(departmentId);
}

/** Roles this person may give to others: strictly below their own, never owner. Only the owner can give any. */
export function assignableRoles(actor: MemberRole): MemberRole[] {
  return ROLES.filter((r) => r !== "owner" && ROLE_RANK[r] < ROLE_RANK[actor]);
}

/** May `actor` change or remove someone who currently holds `target`? */
export function canManageRole(actor: MemberRole, target: MemberRole): boolean {
  return target !== "owner" && ROLE_RANK[actor] > ROLE_RANK[target];
}

export const NO_PERMISSION = "You don’t have permission to do that.";
