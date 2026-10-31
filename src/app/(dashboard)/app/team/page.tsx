import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight, Mail, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/submit-button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmIconButton, ConfirmSubmitButton } from "@/components/ui/confirm";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { CopyInviteLink } from "@/components/dashboard/copy-invite-link";
import { NoAccess } from "@/components/dashboard/no-access";
import { AddMemberButton } from "@/components/dashboard/team/add-member-button";
import { DepartmentButton } from "@/components/dashboard/team/department-button";
import { Initials } from "@/components/dashboard/team/form-drawer";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import {
  assignableRoles, can, CAMPAIGN_ROLES, PERMISSION_LIST, ROLE_LABEL, ROLES, OWNER_ONLY,
} from "@/lib/access";
import { getDepartments, getDomains, getPendingInvites, getRolePermissionMap, getTeam } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { SearchParams } from "@/types";
import {
  deleteDepartmentAction, resendInviteAction, resetRolePermissionsAction, revokeInviteAction, saveRolePermissionsAction,
} from "./actions";

export const metadata: Metadata = { title: "Team" };

const TABS = [
  { key: "members", label: "Members" },
  { key: "departments", label: "Departments" },
  { key: "roles", label: "Roles & permissions" },
] as const;

export default async function TeamPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  const access = ctx?.access;
  if (!ctx?.workspace || !access || !can(access, "members.view")) return <NoAccess title="Team" what="the team list" />;

  const manage = can(access, "members.manage");
  const manageDepartments = can(access, "departments.manage");
  const manageRoles = can(access, "roles.manage");
  const tab = TABS.some((t) => t.key === searchParams.tab) ? (searchParams.tab as (typeof TABS)[number]["key"]) : "members";

  const [members, invites, departments, rolePerms, domains] = await Promise.all([getTeam(ctx), getPendingInvites(ctx), getDepartments(ctx), getRolePermissionMap(ctx), getDomains(ctx)]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const mayAssign = (id: string) => access.allDepartments || access.departmentIds.includes(id);
  const myRoles = assignableRoles(access.role);

  const action =
    tab === "members" && manage ? (
      <AddMemberButton
        domains={domains.filter((d) => d.ready).map((d) => ({ id: d.id, domain: d.domain }))}
        roles={myRoles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, assignable: mayAssign(d.id) }))}
      />
    ) : tab === "departments" && manageDepartments ? (
      <DepartmentButton />
    ) : undefined;

  return (
    <>
      <PageHeader title="Team" description="Members, departments and what each role can do." action={action} />

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Team sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/team?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("rounded-full px-4 py-2 text-sm font-semibold transition-colors", tab === t.key ? "bg-brand-700 text-white" : "bg-white text-ink-soft ring-1 ring-mist hover:bg-mist-100")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* ── Members ─────────────────────────────────────────────── */}
      {tab === "members" ? (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <TH>Member</TH><TH>Work email</TH><TH>Role</TH><TH>Status</TH><TH><span className="sr-only">Actions</span></TH>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const self = m.userId === ctx.user.id;
                const name = m.name || m.email || "Unnamed";
                return (
                  <tr key={m.userId} className="transition-colors hover:bg-mist-50/60">
                    <TD>
                      <div className="flex items-center gap-3">
                        <Initials name={name} />
                        <div className="min-w-0">
                          <Link href={`/app/team/${m.userId}`} className="font-semibold text-ink hover:underline">{name}</Link>
                          {self ? <span className="ml-2 text-xs font-normal text-ink-muted">You</span> : null}
                          <p className="break-all text-xs text-ink-muted">{m.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {m.workEmail ? (
                        <>
                          <p className="break-all text-ink">{m.workEmail}</p>
                          {m.aliasCount > 0 ? <p className="text-xs text-ink-muted">+{m.aliasCount} {m.aliasCount === 1 ? "alias" : "aliases"}</p> : null}
                        </>
                      ) : (
                        <span className="text-ink-muted">Not set</span>
                      )}
                    </TD>
                    <TD><Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[m.role]}</Badge></TD>
                    <TD><Badge tone={m.status === "active" ? "success" : "warning"}>{m.status === "active" ? "Active" : "Deactivated"}</Badge></TD>
                    <TD className="text-right">
                      <Link href={`/app/team/${m.userId}`} aria-label={`Open ${name}`} className="inline-flex rounded-full p-2 text-ink-muted transition-colors hover:bg-mist-100 hover:text-ink">
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </TD>
                  </tr>
                );
              })}

              {manage ? invites.map((i) => (
                <tr key={i.id} className="bg-mist-50/40">
                  <TD>
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-ink/25 text-ink-muted"><Mail className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{i.fullName || i.email}</p>
                        <p className="break-all text-xs text-ink-muted">{i.contactEmail}</p>
                      </div>
                    </div>
                  </TD>
                  <TD><p className="break-all text-ink">{i.email}</p></TD>
                  <TD><Badge tone="neutral">{ROLE_LABEL[i.role]}</Badge></TD>
                  <TD><Badge tone={i.expired ? "danger" : "warning"}>{i.expired ? "Invite expired" : "Invited"}</Badge></TD>
                  <TD>
                    {myRoles.includes(i.role) ? (
                      <div className="flex items-center justify-end gap-1.5">
                        {!i.expired ? <CopyInviteLink inviteId={i.id} /> : null}
                        <form action={resendInviteAction}><input type="hidden" name="id" value={i.id} /><ActionButton variant="ghost" size="sm">{i.expired ? "Renew" : "Resend"}</ActionButton></form>
                        <ConfirmIconButton
                          label={`Cancel the invitation for ${i.fullName || i.email}`}
                          action={revokeInviteAction}
                          fields={{ id: i.id }}
                          confirm={{ title: `Cancel the invitation for ${i.fullName || i.email}?`, description: "Their link stops working. You can invite them again later.", confirmLabel: "Cancel invitation", cancelLabel: "Keep it", tone: "danger" }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </ConfirmIconButton>
                      </div>
                    ) : null}
                  </TD>
                </tr>
              )) : null}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {/* ── Departments ─────────────────────────────────────────── */}
      {tab === "departments" ? (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <TH>Department</TH><TH>Members</TH><TH>Campaigns, lists &amp; templates</TH><TH><span className="sr-only">Actions</span></TH>
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? <EmptyRow cols={4} message="No departments yet." /> : departments.map((d) => (
                <tr key={d.id}>
                  <TD>
                    <p className="font-semibold text-ink">{d.name}</p>
                    {d.description ? <p className="text-xs text-ink-muted">{d.description}</p> : null}
                  </TD>
                  <TD>{d.members}</TD>
                  <TD>{d.resources}</TD>
                  <TD>
                    {manageDepartments ? (
                      <div className="flex items-center justify-end gap-1">
                        <DepartmentButton department={{ id: d.id, name: d.name, description: d.description }} />
                        <ConfirmIconButton
                          label={`Delete ${d.name}`}
                          action={deleteDepartmentAction}
                          fields={{ id: d.id }}
                          confirm={{ title: `Delete ${d.name}?`, description: d.resources > 0 ? "It still has campaigns, lists or templates, so it can’t be deleted until they are moved or removed." : "Its members are kept, but no longer belong to it. This can’t be undone.", confirmLabel: "Delete department", tone: "danger" }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </ConfirmIconButton>
                      </div>
                    ) : null}
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {/* ── Roles & permissions ─────────────────────────────────── */}
      {tab === "roles" ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Roles & permissions"
            description={manageRoles ? "The owner always has full access." : "Only the owner can change these."}
            action={manageRoles ? (
              <div className="flex flex-wrap items-center gap-2">
                <ConfirmSubmitButton action={resetRolePermissionsAction} variant="outline" size="sm" confirm={{ title: "Reset to the defaults?", description: "Every role goes back to its default permissions. This takes effect immediately for everyone.", confirmLabel: "Reset permissions", tone: "danger" }}>Reset to defaults</ConfirmSubmitButton>
              </div>
            ) : undefined}
          />
          <form id="roles-form" action={saveRolePermissionsAction}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-mist bg-mist-50 px-6 py-3 text-xs font-semibold text-ink-muted">Permission</th>
                    {ROLES.map((r) => (
                      <th key={r} className="border-b border-mist bg-mist-50 px-4 py-3 text-center text-xs font-semibold text-ink-muted">{ROLE_LABEL[r]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_LIST.map((p, i) => {
                    const newGroup = i === 0 || PERMISSION_LIST[i - 1].group !== p.group;
                    return (
                      <Fragment key={p.key}>
                        {newGroup ? <tr><td colSpan={ROLES.length + 1} className="bg-mist-50/60 px-6 py-2 text-xs font-bold uppercase tracking-wide text-ink-muted">{p.group}</td></tr> : null}
                        <tr>
                          <td className="border-b border-mist px-6 py-3 text-ink-soft">{p.label}</td>
                          {ROLES.map((r) => {
                            const isOwner = r === "owner";
                            const locked = isOwner || !manageRoles || OWNER_ONLY.includes(p.key);
                            const checked = r === "owner" || rolePerms[r as (typeof CAMPAIGN_ROLES)[number]].includes(p.key);
                            return (
                              <td key={r} className="border-b border-mist px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  name={isOwner ? undefined : `perm:${r}:${p.key}`}
                                  defaultChecked={checked}
                                  disabled={locked}
                                  aria-label={`${ROLE_LABEL[r]}: ${p.label}`}
                                  className="h-4 w-4 accent-brand-700"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {manageRoles ? <div className="flex justify-end border-t border-mist p-4"><ActionButton>Save permissions</ActionButton></div> : null}
          </form>
        </Card>
      ) : null}
    </>
  );
}
