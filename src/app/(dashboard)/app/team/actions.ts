"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ALL_PERMISSIONS, assignableRoles, canAssignDepartment, canManageRole, CAMPAIGN_ROLES, ROLE_LABEL, sanitizePermissions,
  type CampaignRole, type MemberRole,
} from "@/lib/access";
import { go } from "@/lib/flash";
import { ACTIVE_WORKSPACE_COOKIE, getContext, requireWorkspace } from "@/lib/workspace";
import { recordAudit } from "@/server/audit";
import { inviteLink, sendInviteEmail } from "@/server/team";

const BACK = "/app/team";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
/** Only the campaign roles can be given to someone: the owner is the one administrator. */
const asRole = (v: string): CampaignRole | null => ((CAMPAIGN_ROLES as readonly string[]).includes(v) ? (v as CampaignRole) : null);
const LOCAL_RE = /^[a-z0-9._+-]{1,64}$/;
const LOCAL_HINT = "The address before the @ can use letters, numbers and . _ + - only.";
const memberPage = (userId: string) => `${BACK}/${userId}`;

type Ctx = Awaited<ReturnType<typeof requireWorkspace>>;
const actor = (ctx: Ctx) => ({ id: ctx.user.id, email: ctx.user.email });
const tab = (name: string) => `${BACK}?tab=${name}`;

/**
 * What a drawer form gets back. Drawer forms stay open on an error and close on success, so these
 * actions return a result instead of redirecting.
 */
export type TeamResult = { ok: true; message: string; tone: "success" | "warning"; href?: string } | { ok: false; error: string };
const done = (message: string): TeamResult => ({ ok: true, message, tone: "success" });
const doneWarn = (message: string): TeamResult => ({ ok: true, message, tone: "warning" });
const fail = (error: string): TeamResult => ({ ok: false, error });

/** Department ids from a form, kept only if they exist in this workspace and the caller may assign them. */
async function departmentsFrom(ctx: Ctx, formData: FormData): Promise<string[] | null> {
  const ids = [...new Set(formData.getAll("departmentIds").map(String).filter((id) => UUID_RE.test(id)))];
  if (ids.length === 0) return [];
  const { data } = await ctx.db.from("departments").select("id").eq("workspace_id", ctx.workspace.id).in("id", ids);
  const valid = new Set((data ?? []).map((d: { id: string }) => d.id));
  if (ids.some((id) => !valid.has(id))) return null;
  if (ids.some((id) => !canAssignDepartment(ctx.access, id))) return null;
  return ids;
}

// ── Invitations ─────────────────────────────────────────────────────

/**
 * The owner creates the person's company email (jon@domain.com) and sends the invitation to their
 * personal email. The person opens it, sets a password for the company email and signs in with that.
 * The personal email is only where the invitation and password-recovery links go.
 */
export async function inviteMemberAction(formData: FormData): Promise<TeamResult> {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const fullName = text(formData, "fullName", 80);
  const contact = text(formData, "contactEmail", 254).toLowerCase();
  const local = text(formData, "localPart", 64).toLowerCase();
  const role = asRole(text(formData, "role", 20));

  if (fullName.length < 2) return fail("Enter their full name.");
  if (!EMAIL_RE.test(contact)) return fail("Enter a valid personal email address to send the invitation to.");
  if (!LOCAL_RE.test(local)) return fail(LOCAL_HINT);
  if (!role || !assignableRoles(ctx.access.role).includes(role)) return fail("You can’t invite someone with that role.");
  const found = await readyDomain(ctx, text(formData, "domainId", 60));
  if ("error" in found) return fail(found.error);
  const departmentIds = await departmentsFrom(ctx, formData);
  if (departmentIds === null) return fail("Choose departments you’re allowed to assign.");

  const email = `${local}@${found.domain.domain}`; // the company email: their login and their sending address
  if (contact === email) return fail("The personal email must be different from their company email: it’s where the invitation and password recovery links go.");

  // The company email must be new: no account, no sender, and not someone already on the team.
  const { data: profile } = await ctx.db.from("profiles").select("id, recovery_email").eq("email", email).maybeSingle();
  if (profile) {
    const { data: member } = await ctx.db.from("workspace_members").select("status").eq("workspace_id", ctx.workspace.id).eq("user_id", profile.id).maybeSingle();
    if (member) return fail(member.status === "active" ? `${email} is already on your team.` : `${email} is on your team but deactivated. Reactivate them from their details page.`);
    // A former invited member of another organization or an earlier invitation can be re-invited; anyone else already owns that address.
    if (!profile.recovery_email) return fail(`${email} already belongs to an account. Choose another company email.`);
  }
  const { count: taken } = await ctx.db.from("sender_identities").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).eq("email", email);
  if ((taken ?? 0) > 0) return fail(`${email} is already used as a work email or alias.`);

  // One live invitation per company email: a new one replaces the old.
  await ctx.db.from("workspace_invites").update({ status: "revoked" }).eq("workspace_id", ctx.workspace.id).eq("email", email).eq("status", "pending");
  const { data: invite, error } = await ctx.db.from("workspace_invites").insert({
    workspace_id: ctx.workspace.id, email, contact_email: contact, full_name: fullName, role, department_ids: departmentIds, invited_by: ctx.user.id,
  }).select("id").single();
  if (error || !invite) return fail("Couldn’t create the invitation. Try again.");

  const sent = await sendInviteEmail({ inviteId: invite.id, to: contact, loginEmail: email, organization: ctx.workspace.name, inviter: ctx.user.fullName || ctx.user.email, role });
  await recordAudit(ctx.db, actor(ctx), "member.invited", { type: "invite", id: email }, { workspace_id: ctx.workspace.id, role });
  revalidatePath(BACK);
  return sent
    ? done(`Invitation sent to ${contact}. They’ll sign in with ${email}.`)
    : doneWarn(`Invitation created for ${email}, but no email could be sent to ${contact}. Use Copy link on their row and share it with them.`);
}

async function loadInvite(ctx: Ctx, formData: FormData) {
  const id = text(formData, "id", 60);
  if (!UUID_RE.test(id)) return null;
  const { data } = await ctx.db.from("workspace_invites").select("id, email, contact_email, role, status").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  return data as { id: string; email: string; contact_email: string; role: MemberRole; status: string } | null;
}

export async function resendInviteAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const inv = await loadInvite(ctx, formData);
  if (!inv || inv.status !== "pending") go(BACK, "err", "That invitation is no longer pending.");
  if (!assignableRoles(ctx.access.role).includes(inv.role)) go(BACK, "err", "You can’t manage invitations for that role.");
  await ctx.db.from("workspace_invites").update({ expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() }).eq("id", inv.id);
  const sent = await sendInviteEmail({ inviteId: inv.id, to: inv.contact_email, loginEmail: inv.email, organization: ctx.workspace.name, inviter: ctx.user.fullName || ctx.user.email, role: inv.role });
  revalidatePath(BACK);
  go(BACK, sent ? "ok" : "warn", sent ? `Invitation sent again to ${inv.contact_email}.` : "The invitation was renewed for 7 days, but no email was sent. Copy the link and share it.");
}

export async function revokeInviteAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const inv = await loadInvite(ctx, formData);
  if (!inv || inv.status !== "pending") go(BACK, "err", "That invitation is no longer pending.");
  if (!assignableRoles(ctx.access.role).includes(inv.role)) go(BACK, "err", "You can’t manage invitations for that role.");
  await ctx.db.from("workspace_invites").update({ status: "revoked" }).eq("id", inv.id).eq("workspace_id", ctx.workspace.id);
  await recordAudit(ctx.db, actor(ctx), "member.invite_revoked", { type: "invite", id: inv.email }, { workspace_id: ctx.workspace.id });
  revalidatePath(BACK);
  go(BACK, "ok", `The invitation for ${inv.email} was cancelled.`);
}

/** The link for one pending invitation, for the "Copy link" button. Only people who manage members get it. */
export async function inviteLinkAction(inviteId: string): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const ctx = await requireWorkspace(BACK, "members.manage");
  if (!UUID_RE.test(String(inviteId))) return { ok: false, error: "Invitation not found." };
  const { data } = await ctx.db.from("workspace_invites").select("id, status, role").eq("id", inviteId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data || data.status !== "pending") return { ok: false, error: "That invitation is no longer pending." };
  if (!assignableRoles(ctx.access.role).includes(data.role as MemberRole)) return { ok: false, error: "You can’t manage invitations for that role." };
  return { ok: true, link: inviteLink(data.id) };
}

// ── Members ─────────────────────────────────────────────────────────

async function loadMember(ctx: Ctx, formData: FormData) {
  const userId = text(formData, "userId", 60);
  if (!UUID_RE.test(userId)) return null;
  const { data } = await ctx.db.from("workspace_members").select("user_id, role, status").eq("workspace_id", ctx.workspace.id).eq("user_id", userId).maybeSingle();
  return data as { user_id: string; role: MemberRole; status: string } | null;
}

/** A person may only manage someone of a lower rank, and never themselves. */
function mayManage(ctx: Ctx, target: { user_id: string; role: MemberRole }) {
  return target.user_id !== ctx.user.id && canManageRole(ctx.access.role, target.role);
}

export async function updateMemberAction(formData: FormData): Promise<TeamResult> {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const target = await loadMember(ctx, formData);
  if (!target) return fail("That person isn’t on your team.");
  if (!mayManage(ctx, target)) return fail(target.user_id === ctx.user.id ? "You can’t change your own role or departments." : "You can’t change that person.");

  const role = asRole(text(formData, "role", 20));
  if (!role || !assignableRoles(ctx.access.role).includes(role)) return fail("You can’t give someone that role.");
  const wanted = await departmentsFrom(ctx, formData);
  if (wanted === null) return fail("Choose departments you’re allowed to assign.");

  const { data: current } = await ctx.db.from("department_members").select("department_id").eq("workspace_id", ctx.workspace.id).eq("user_id", target.user_id);
  const have = new Set((current ?? []).map((r: { department_id: string }) => r.department_id));
  const want = new Set(wanted);
  const toAdd = [...want].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));
  // Removing someone from a department needs the same authority as adding them to it.
  if (toRemove.some((id) => !canAssignDepartment(ctx.access, id))) return fail("You can’t remove people from departments you aren’t in.");

  if (role !== target.role) await ctx.db.from("workspace_members").update({ role }).eq("workspace_id", ctx.workspace.id).eq("user_id", target.user_id);
  if (toAdd.length) await ctx.db.from("department_members").insert(toAdd.map((department_id) => ({ department_id, workspace_id: ctx.workspace.id, user_id: target.user_id })));
  if (toRemove.length) await ctx.db.from("department_members").delete().eq("workspace_id", ctx.workspace.id).eq("user_id", target.user_id).in("department_id", toRemove);

  await recordAudit(ctx.db, actor(ctx), "member.updated", { type: "member", id: target.user_id }, { workspace_id: ctx.workspace.id, role, from_role: target.role, departments: wanted });
  revalidatePath(BACK);
  return done(`Saved. They’re now in ${ROLE_LABEL[role]}.`);
}

export async function setMemberStatusAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const target = await loadMember(ctx, formData);
  if (!target) go(BACK, "err", "That person isn’t on your team.");
  const here = memberPage(target.user_id);
  if (!mayManage(ctx, target)) go(here, "err", "You can’t change that person.");
  const status = text(formData, "status", 12) === "active" ? "active" : "deactivated";
  await ctx.db.from("workspace_members").update({ status }).eq("workspace_id", ctx.workspace.id).eq("user_id", target.user_id);
  await recordAudit(ctx.db, actor(ctx), status === "active" ? "member.reactivated" : "member.deactivated", { type: "member", id: target.user_id }, { workspace_id: ctx.workspace.id });
  revalidatePath(BACK);
  go(here, "ok", status === "active" ? "They can sign in to this organization again." : "They no longer have access, and their work email and aliases can’t send. Their work stays.");
}

export async function removeMemberAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const target = await loadMember(ctx, formData);
  if (!target) go(BACK, "err", "That person isn’t on your team.");
  if (!mayManage(ctx, target)) go(memberPage(target.user_id), "err", "You can’t remove that person.");

  // Their work email and aliases are deleted with them, so none may be in use by a campaign that is queued or going out.
  const { data: idents } = await ctx.db.from("sender_identities").select("id").eq("workspace_id", ctx.workspace.id).eq("user_id", target.user_id);
  const ids = ((idents ?? []) as { id: string }[]).map((i) => i.id);
  if (ids.length) {
    const { count } = await ctx.db.from("campaigns").select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id).in("sender_identity_id", ids).in("status", LIVE_STATUSES);
    if ((count ?? 0) > 0) go(memberPage(target.user_id), "err", "A campaign that is scheduled or sending uses one of their addresses. Let it finish or cancel it first.");
  }

  await ctx.db.from("workspace_members").delete().eq("workspace_id", ctx.workspace.id).eq("user_id", target.user_id);
  await recordAudit(ctx.db, actor(ctx), "member.removed", { type: "member", id: target.user_id }, { workspace_id: ctx.workspace.id });
  revalidatePath(BACK);
  go(BACK, "ok", "They were removed from your team, along with their work email and aliases. Campaigns and templates they created stay.");
}

// ── Work email and aliases ──────────────────────────────────────────
// A person's work email (jon@domain.com) is an address on a verified company domain. Aliases
// (sales@domain.com, jon_sales@domain.com) are extra addresses for the same person on the same domain.
// A personal email (Gmail, Yahoo...) is only for signing in and invitations: it is never a sender.

const LIVE_STATUSES = ["scheduled", "sending", "paused"];

type SenderRowDb = { id: string; email: string; local_part: string; domain_id: string; from_name: string; status: string; kind: "primary" | "alias"; user_id: string | null };

/** Someone whose addresses the caller may manage: themselves (the owner) or anyone ranked below. */
async function senderOwner(ctx: Ctx, userId: string) {
  if (!UUID_RE.test(userId)) return null;
  const { data } = await ctx.db.from("workspace_members").select("user_id, role, status").eq("workspace_id", ctx.workspace.id).eq("user_id", userId).maybeSingle();
  const target = data as { user_id: string; role: MemberRole; status: string } | null;
  return target && (target.user_id === ctx.user.id || canManageRole(ctx.access.role, target.role)) ? target : null;
}

/** An address of this organization whose owner the caller may manage. */
async function loadSender(ctx: Ctx, id: string) {
  if (!UUID_RE.test(id)) return null;
  const { data } = await ctx.db.from("sender_identities").select("id, email, local_part, domain_id, from_name, status, kind, user_id").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  const row = data as SenderRowDb | null;
  if (!row?.user_id || !(await senderOwner(ctx, row.user_id))) return null;
  return row as SenderRowDb & { user_id: string };
}

async function usedByLiveCampaign(ctx: Ctx, identityId: string) {
  const { count } = await ctx.db.from("campaigns").select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspace.id).eq("sender_identity_id", identityId).in("status", LIVE_STATUSES);
  return (count ?? 0) > 0;
}

/** A domain of this organization that is ready to send (DKIM, SPF and DMARC all pass), or null. */
async function readyDomain(ctx: Ctx, domainId: string): Promise<{ error: string } | { domain: { id: string; domain: string } }> {
  if (!UUID_RE.test(domainId)) return { error: "Choose a domain." };
  const { data } = await ctx.db.from("sending_domains").select("id, domain, status, dkim_ok, spf_ok, dmarc_ok").eq("id", domainId).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) return { error: "Choose one of your sending domains." };
  if (data.status !== "verified" || !data.dkim_ok || !data.spf_ok || !data.dmarc_ok) {
    return { error: `${data.domain} isn’t verified yet. DKIM, SPF and DMARC must all pass before anyone can send from it.` };
  }
  return { domain: data as { id: string; domain: string } };
}

const audit = (ctx: Ctx, action: string, email: string) => recordAudit(ctx.db, actor(ctx), action, { type: "sender", id: email }, { workspace_id: ctx.workspace.id });

/** Sets or changes someone's work email, the address everything else (their aliases) hangs off. */
export async function saveWorkEmailAction(formData: FormData): Promise<TeamResult> {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const owner = await senderOwner(ctx, text(formData, "userId", 60));
  if (!owner) return fail("That person isn’t on your team.");

  const fromName = text(formData, "fromName", 80);
  if (!fromName) return fail("Enter the name people will see, for example Jon at Acme.");

  // A work email that is also the person's login (everyone invited by the owner) keeps its address:
  // only the sender name can change. Changing a login email would lock them out.
  const { data: login } = await ctx.db.from("profiles").select("email").eq("id", owner.user_id).maybeSingle();
  const { data: current } = await ctx.db.from("sender_identities").select("id, email").eq("workspace_id", ctx.workspace.id).eq("user_id", owner.user_id).eq("kind", "primary").maybeSingle();
  if (current && login?.email && current.email === String(login.email).toLowerCase()) {
    await ctx.db.from("sender_identities").update({ from_name: fromName, updated_at: new Date().toISOString() }).eq("id", current.id).eq("workspace_id", ctx.workspace.id);
    await ctx.db.from("campaigns").update({ from_name: fromName }).eq("workspace_id", ctx.workspace.id).eq("sender_identity_id", current.id).eq("status", "draft");
    revalidatePath(BACK);
    return done("Sender name saved.");
  }

  const local = text(formData, "localPart", 64).toLowerCase();
  if (!LOCAL_RE.test(local)) return fail(LOCAL_HINT);
  const found = await readyDomain(ctx, text(formData, "domainId", 60));
  if ("error" in found) return fail(found.error);

  const email = `${local}@${found.domain.domain}`;
  const { data: existing } = await ctx.db.from("sender_identities").select("id, email, local_part, domain_id, kind, user_id").eq("workspace_id", ctx.workspace.id).eq("user_id", owner.user_id).eq("kind", "primary").maybeSingle();
  const now = new Date().toISOString();

  if (!existing) {
    const { error } = await ctx.db.from("sender_identities").insert({
      workspace_id: ctx.workspace.id, domain_id: found.domain.id, local_part: local, email, from_name: fromName, kind: "primary", user_id: owner.user_id, created_by: ctx.user.id,
    });
    if (error) return fail(error.code === "23505" ? `${email} is already used in this organization.` : "Couldn’t save the work email. Try again.");
    await audit(ctx, "workemail.created", email);
    revalidatePath(BACK);
    return done(`${email} is set. You can now create aliases for it.`);
  }

  const changedAddress = existing.email !== email;
  if (changedAddress) {
    if (await usedByLiveCampaign(ctx, existing.id)) return fail(`${existing.email} is used by a campaign that is scheduled or sending. Change it after the campaign finishes.`);
    if (existing.domain_id !== found.domain.id) {
      const { count } = await ctx.db.from("sender_identities").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).eq("user_id", owner.user_id).eq("kind", "alias");
      if ((count ?? 0) > 0) return fail("Aliases must stay on the same domain as the work email. Delete the aliases before moving to another domain.");
    }
  }
  const { error } = await ctx.db.from("sender_identities").update({ from_name: fromName, local_part: local, domain_id: found.domain.id, email, updated_at: now }).eq("id", existing.id).eq("workspace_id", ctx.workspace.id);
  if (error) return fail(error.code === "23505" ? `${email} is already used in this organization.` : "Couldn’t save the work email. Try again.");
  // Drafts that use this address follow the change (anything scheduled was checked above).
  await ctx.db.from("campaigns").update({ from_email: email, from_name: fromName }).eq("workspace_id", ctx.workspace.id).eq("sender_identity_id", existing.id).eq("status", "draft");
  await audit(ctx, "workemail.updated", email);
  revalidatePath(BACK);
  return done("Work email saved.");
}

export async function createAliasAction(formData: FormData): Promise<TeamResult> {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const owner = await senderOwner(ctx, text(formData, "userId", 60));
  if (!owner) return fail("That person isn’t on your team.");

  const { data: primary } = await ctx.db.from("sender_identities").select("id, domain_id").eq("workspace_id", ctx.workspace.id).eq("user_id", owner.user_id).eq("kind", "primary").maybeSingle();
  if (!primary) return fail("Set their work email first. Aliases are extra addresses for that email.");

  const fromName = text(formData, "fromName", 80);
  const local = text(formData, "localPart", 64).toLowerCase();
  if (!fromName) return fail("Enter the name people will see.");
  if (!LOCAL_RE.test(local)) return fail(LOCAL_HINT);
  // An alias always sits on the same domain as the person's work email.
  const found = await readyDomain(ctx, primary.domain_id);
  if ("error" in found) return fail(found.error);

  const email = `${local}@${found.domain.domain}`;
  const { error } = await ctx.db.from("sender_identities").insert({
    workspace_id: ctx.workspace.id, domain_id: found.domain.id, local_part: local, email, from_name: fromName, kind: "alias", user_id: owner.user_id, created_by: ctx.user.id,
  });
  if (error) return fail(error.code === "23505" ? `${email} is already used in this organization.` : "Couldn’t create the alias. Try again.");
  await audit(ctx, "alias.created", email);
  revalidatePath(BACK);
  return done(`${email} can now be chosen when sending a campaign.`);
}

export async function updateAliasAction(formData: FormData): Promise<TeamResult> {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const row = await loadSender(ctx, text(formData, "id", 60));
  if (!row || row.kind !== "alias") return fail("Alias not found.");

  const fromName = text(formData, "fromName", 80);
  const local = text(formData, "localPart", 64).toLowerCase();
  if (!fromName) return fail("Enter the name people will see.");
  if (!LOCAL_RE.test(local)) return fail(LOCAL_HINT);

  let email = row.email;
  if (local !== row.local_part) {
    if (await usedByLiveCampaign(ctx, row.id)) return fail(`${row.email} is used by a campaign that is scheduled or sending. Change it after the campaign finishes.`);
    email = `${local}@${row.email.split("@")[1]}`;
  }
  const { error } = await ctx.db.from("sender_identities").update({ from_name: fromName, local_part: local, email, updated_at: new Date().toISOString() }).eq("id", row.id).eq("workspace_id", ctx.workspace.id);
  if (error) return fail(error.code === "23505" ? `${email} is already used in this organization.` : "Couldn’t save the alias. Try again.");
  await ctx.db.from("campaigns").update({ from_email: email, from_name: fromName }).eq("workspace_id", ctx.workspace.id).eq("sender_identity_id", row.id).eq("status", "draft");
  await audit(ctx, "alias.updated", email);
  revalidatePath(BACK);
  return done("Alias saved.");
}

export async function setAliasStatusAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const row = await loadSender(ctx, text(formData, "id", 60));
  if (!row || row.kind !== "alias") go(BACK, "err", "Alias not found.");
  const status = text(formData, "status", 10) === "active" ? "active" : "inactive";
  await ctx.db.from("sender_identities").update({ status, updated_at: new Date().toISOString() }).eq("id", row.id).eq("workspace_id", ctx.workspace.id);
  await audit(ctx, status === "active" ? "alias.activated" : "alias.deactivated", row.email);
  revalidatePath(BACK);
  go(memberPage(row.user_id), "ok", status === "active" ? `${row.email} is active again.` : `${row.email} is deactivated. Campaigns that use it will pause until you choose another sender.`);
}

/** Deletes an alias, or a work email that has no aliases left. */
export async function deleteSenderAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "members.manage");
  const row = await loadSender(ctx, text(formData, "id", 60));
  if (!row) go(BACK, "err", "Address not found.");
  const here = memberPage(row.user_id);
  if (row.kind === "primary") {
    const { data: login } = await ctx.db.from("profiles").select("email").eq("id", row.user_id).maybeSingle();
    if (login?.email && String(login.email).toLowerCase() === row.email) go(here, "err", "This is their login email. To end their access, deactivate or delete them instead.");
    const { count } = await ctx.db.from("sender_identities").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).eq("user_id", row.user_id).eq("kind", "alias");
    if ((count ?? 0) > 0) go(here, "err", "Delete this person’s aliases first. They depend on the work email.");
  }
  if (await usedByLiveCampaign(ctx, row.id)) go(here, "err", `${row.email} is used by a campaign that is scheduled or sending. Let it finish or cancel it first.`);
  const { error } = await ctx.db.from("sender_identities").delete().eq("id", row.id).eq("workspace_id", ctx.workspace.id);
  if (error) go(here, "err", "Couldn’t delete it. Try again.");
  await audit(ctx, row.kind === "primary" ? "workemail.deleted" : "alias.deleted", row.email);
  revalidatePath(BACK);
  go(here, "ok", `${row.email} was deleted. Drafts that used it need another sender.`);
}

// ── Departments ─────────────────────────────────────────────────────

export async function createDepartmentAction(formData: FormData): Promise<TeamResult> {
  const ctx = await requireWorkspace(tab("departments"), "departments.manage");
  const name = text(formData, "name", 60);
  if (!name) return fail("Give the department a name.");
  const { error } = await ctx.db.from("departments").insert({ workspace_id: ctx.workspace.id, name, description: text(formData, "description", 200) });
  if (error) return fail(error.code === "23505" ? "You already have a department with that name." : "Couldn’t create the department. Try again.");
  await recordAudit(ctx.db, actor(ctx), "department.created", { type: "department", id: name }, { workspace_id: ctx.workspace.id });
  revalidatePath(BACK);
  return done(`${name} created. Add people to it from the Members tab.`);
}

export async function updateDepartmentAction(formData: FormData): Promise<TeamResult> {
  const ctx = await requireWorkspace(tab("departments"), "departments.manage");
  const id = text(formData, "id", 60);
  const name = text(formData, "name", 60);
  if (!UUID_RE.test(id)) return fail("Department not found.");
  if (!name) return fail("Give the department a name.");
  const { data, error } = await ctx.db.from("departments").update({ name, description: text(formData, "description", 200) }).eq("id", id).eq("workspace_id", ctx.workspace.id).select("id").maybeSingle();
  if (error) return fail(error.code === "23505" ? "You already have a department with that name." : "Couldn’t save the department. Try again.");
  if (!data) return fail("Department not found.");
  revalidatePath(BACK);
  return done("Department saved.");
}

export async function deleteDepartmentAction(formData: FormData) {
  const ctx = await requireWorkspace(tab("departments"), "departments.manage");
  const id = text(formData, "id", 60);
  if (!UUID_RE.test(id)) go(tab("departments"), "err", "Department not found.");
  const { data: dept } = await ctx.db.from("departments").select("id, name").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!dept) go(tab("departments"), "err", "Department not found.");

  // Refuse while it still owns anything: deleting would otherwise make private work visible to everyone.
  const owned = await Promise.all(["campaigns", "lists", "templates"].map((t) =>
    ctx.db.from(t).select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).eq("department_id", id)));
  if (owned.some((r) => (r.count ?? 0) > 0)) go(tab("departments"), "err", `${dept.name} still has campaigns, lists or templates. Move or delete them first.`);

  const { error } = await ctx.db.from("departments").delete().eq("id", id).eq("workspace_id", ctx.workspace.id);
  if (error) go(tab("departments"), "err", "Couldn’t delete the department. Try again.");
  await recordAudit(ctx.db, actor(ctx), "department.deleted", { type: "department", id: dept.name }, { workspace_id: ctx.workspace.id });
  revalidatePath(BACK);
  go(tab("departments"), "ok", `${dept.name} deleted.`);
}

// ── Role permissions ────────────────────────────────────────────────

export async function saveRolePermissionsAction(formData: FormData) {
  const ctx = await requireWorkspace(tab("roles"), "roles.manage");
  const rows = CAMPAIGN_ROLES.map((role) => ({
    workspace_id: ctx.workspace.id,
    role,
    permissions: sanitizePermissions(ALL_PERMISSIONS.filter((p) => formData.get(`perm:${role}:${p}`) === "on"), role),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await ctx.db.from("role_permissions").upsert(rows, { onConflict: "workspace_id,role" });
  if (error) go(tab("roles"), "err", "Couldn’t save the permissions. Try again.");
  await recordAudit(ctx.db, actor(ctx), "roles.updated", { type: "workspace", id: ctx.workspace.id }, { workspace_id: ctx.workspace.id });
  revalidatePath("/app", "layout");
  go(tab("roles"), "ok", "Permissions saved. They apply the next time each person loads a page.");
}

export async function resetRolePermissionsAction() {
  const ctx = await requireWorkspace(tab("roles"), "roles.manage");
  await ctx.db.from("role_permissions").delete().eq("workspace_id", ctx.workspace.id);
  await recordAudit(ctx.db, actor(ctx), "roles.reset", { type: "workspace", id: ctx.workspace.id }, { workspace_id: ctx.workspace.id });
  revalidatePath("/app", "layout");
  go(tab("roles"), "ok", "Permissions are back to the defaults.");
}

// ── Switching organization ────────────────

const setActiveWorkspace = (id: string) =>
  cookies().set(ACTIVE_WORKSPACE_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });

export async function switchWorkspaceAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const id = text(formData, "workspaceId", 60);
  // Only organizations the person really belongs to can be chosen.
  if (!ctx.memberships.some((m) => m.id === id)) go("/app", "err", "You’re not a member of that organization.");
  setActiveWorkspace(id);
  redirect("/app");
}
