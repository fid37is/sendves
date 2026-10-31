import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/submit-button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmIconButton, ConfirmSubmitButton } from "@/components/ui/confirm";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { NoAccess } from "@/components/dashboard/no-access";
import { EditMemberButton } from "@/components/dashboard/team/edit-member-button";
import { SenderButton } from "@/components/dashboard/team/sender-button";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { assignableRoles, can, canManageRole, ROLE_LABEL } from "@/lib/access";
import { getDepartments, getDomains, getMemberSenders, getTeam } from "@/lib/queries";
import { getContext } from "@/lib/workspace";
import { deleteSenderAction, removeMemberAction, setAliasStatusAction, setMemberStatusAction } from "../actions";

export const metadata: Metadata = { title: "Team member" };

export default async function MemberDetailsPage({ params }: { params: { userId: string } }) {
  const ctx = await getContext();
  const access = ctx?.access;
  if (!ctx?.workspace || !access || !can(access, "members.view")) return <NoAccess title="Team" what="the team list" />;

  const [members, departments, domains, senders] = await Promise.all([getTeam(ctx), getDepartments(ctx), getDomains(ctx), getMemberSenders(ctx, params.userId)]);
  const m = members.find((x) => x.userId === params.userId);
  if (!m) notFound();

  const self = m.userId === ctx.user.id;
  const manage = can(access, "members.manage");
  // The owner manages everyone below them, and their own work email and aliases.
  const editPerson = manage && !self && canManageRole(access.role, m.role);
  const editAddresses = manage && (self || editPerson);
  const readyDomains = domains.filter((d) => d.ready).map((d) => ({ id: d.id, domain: d.domain }));
  const { primary, aliases } = senders;
  const rows = [...(primary ? [primary] : []), ...aliases];
  const display = m.name || m.email || "Unnamed";
  const mayAssign = (id: string) => access.allDepartments || access.departmentIds.includes(id);
  const deptNames = m.departmentIds.map((id) => departments.find((d) => d.id === id)?.name).filter(Boolean).join(", ");
  // Everyone invited by the owner signs in with their work email, so its address is fixed: changing it would lock them out.
  const loginIsWorkEmail = !!primary && primary.email === m.email.toLowerCase();

  return (
    <>
      <PageHeader
        title={display}
        description={`${ROLE_LABEL[m.role]} · joined ${m.joined}`}
        action={editPerson ? (
          <div className="flex flex-wrap items-center gap-2">
            <EditMemberButton
              userId={m.userId}
              name={display}
              role={m.role}
              roles={assignableRoles(access.role).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              departments={departments.map((d) => ({ id: d.id, name: d.name, assignable: mayAssign(d.id) }))}
              selectedDepartmentIds={m.departmentIds}
            />
            {m.status === "active" ? (
              <ConfirmSubmitButton action={setMemberStatusAction} fields={{ userId: m.userId, status: "deactivated" }} variant="outline" confirm={{ title: `Deactivate ${display}?`, description: "They lose access to this organization immediately and their work email and aliases stop sending. Their campaigns and templates stay, and you can reactivate them later.", confirmLabel: "Deactivate", tone: "danger" }}>Deactivate</ConfirmSubmitButton>
            ) : (
              <form action={setMemberStatusAction}><input type="hidden" name="userId" value={m.userId} /><input type="hidden" name="status" value="active" /><ActionButton variant="outline">Reactivate</ActionButton></form>
            )}
            <ConfirmSubmitButton action={removeMemberAction} fields={{ userId: m.userId }} variant="ghost" className="!text-danger hover:!bg-danger-soft" confirm={{ title: `Delete ${display}?`, description: "They’re removed from your team, and their work email and aliases are deleted. Campaigns and templates they created stay. You can invite them again later.", confirmLabel: "Delete", tone: "danger" }}>Delete</ConfirmSubmitButton>
          </div>
        ) : undefined}
      />

      {/* ── Details ─────────────────────────────────────────────── */}
      <Card className="mb-6">
        <dl className="grid gap-x-6 gap-y-5 p-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-xs text-ink-muted">Sign-in email</dt>
            <dd className="mt-1 break-all font-semibold text-ink">{m.email}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-muted">Personal email</dt>
            <dd className="mt-1 break-all text-ink-soft">{m.recoveryEmail || "None"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-muted">Departments</dt>
            <dd className="mt-1 text-ink-soft">{deptNames || "None"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Status</dt>
            <dd className="mt-1"><Badge tone={m.status === "active" ? "success" : "warning"}>{m.status === "active" ? "Active" : "Deactivated"}</Badge></dd>
          </div>
        </dl>
      </Card>

      {/* ── Sending addresses ───────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Sending addresses"
          action={editAddresses ? (
            primary ? (
              <SenderButton mode="alias" userId={m.userId} memberName={display} domain={primary.domain} />
            ) : (
              <SenderButton mode="work" userId={m.userId} memberName={display} domains={readyDomains} />
            )
          ) : undefined}
        />
        <Table>
          <thead>
            <tr>
              <TH>Sender name</TH><TH>Address</TH><TH>Type</TH><TH>Status</TH><TH><span className="sr-only">Actions</span></TH>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyRow cols={5} message="No work email yet, so no campaigns can be sent from this account." /> : rows.map((r) => {
              const isPrimary = r.kind === "primary";
              const canDelete = editAddresses && (!isPrimary || (aliases.length === 0 && !loginIsWorkEmail));
              return (
                <tr key={r.id}>
                  <TD className="font-semibold text-ink">{r.fromName}</TD>
                  <TD><span className="break-all">{r.email}</span></TD>
                  <TD><Badge tone={isPrimary ? "brand" : "neutral"}>{isPrimary ? "Work email" : "Alias"}</Badge></TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={r.status === "active" ? "success" : "neutral"}>{r.status === "active" ? "Active" : "Deactivated"}</Badge>
                      {!r.domainReady ? <Badge tone="warning">Domain not verified</Badge> : null}
                    </div>
                  </TD>
                  <TD>
                    {editAddresses ? (
                      <div className="flex items-center justify-end gap-1">
                        {isPrimary ? (
                          <SenderButton
                            mode="work"
                            userId={m.userId}
                            memberName={display}
                            domains={readyDomains}
                            lockAddress={loginIsWorkEmail}
                            existing={{ fromName: r.fromName, localPart: r.localPart, domainId: r.domainId, email: r.email }}
                          />
                        ) : (
                          <>
                            <SenderButton mode="alias" userId={m.userId} memberName={display} domain={r.domain} existing={{ id: r.id, fromName: r.fromName, localPart: r.localPart }} />
                            {r.status === "active" ? (
                              <ConfirmSubmitButton action={setAliasStatusAction} fields={{ id: r.id, status: "inactive" }} variant="ghost" size="sm" confirm={{ title: `Deactivate ${r.email}?`, description: "Campaigns that use this alias can’t be sent, and any that are sending will pause, until you choose another sender or activate it again.", confirmLabel: "Deactivate", tone: "danger" }}>Deactivate</ConfirmSubmitButton>
                            ) : (
                              <form action={setAliasStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="active" /><ActionButton variant="ghost" size="sm">Activate</ActionButton></form>
                            )}
                          </>
                        )}
                        {canDelete ? (
                          <ConfirmIconButton
                            label={`Delete ${r.email}`}
                            action={deleteSenderAction}
                            fields={{ id: r.id }}
                            confirm={{ title: `Delete ${r.email}?`, description: isPrimary ? "They won’t be able to send campaigns until you add a work email again." : "Drafts that use it will need another sender. This can’t be undone.", confirmLabel: "Delete", tone: "danger" }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </ConfirmIconButton>
                        ) : null}
                      </div>
                    ) : null}
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
