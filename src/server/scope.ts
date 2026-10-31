import "server-only";
import type { Access } from "@/lib/access";

/**
 * Limits a query on a table with a `department_id` column to what this person may see: resources of
 * the whole organization (no department) plus those of their own departments. People with access to
 * every department are not limited. This is the server-side half of resource-level access control;
 * single-row loads also call canAccessDepartment() from lib/access.ts.
 */
export function inScope<T>(query: T, access: Access | null | undefined): T {
  if (!access) return (query as any).eq("department_id", "00000000-0000-0000-0000-000000000000") as T; // no access: nothing matches
  if (access.allDepartments) return query;
  const ids = access.departmentIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return (ids.length ? (query as any).or(`department_id.is.null,department_id.in.(${ids.join(",")})`) : (query as any).is("department_id", null)) as T;
}
