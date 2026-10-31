"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadInvite } from "@/server/invites";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";
import { recordAudit } from "@/server/audit";
import type { FormState } from "@/lib/auth/types";

/**
 * Accepting an invitation creates the account: the company email the owner set up becomes the login,
 * the person chooses its password, and their personal email is kept only to recover it. Nothing here
 * trusts the browser: the email, role and organization all come from the stored invitation.
 */
export async function acceptInviteAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured) return { error: "Sign-in isn’t set up yet." };
  const loaded = await loadInvite(token);
  if (!loaded.ok) return { error: loaded.reason };
  const { invite } = loaded;

  const db = createAdminClient();
  const { data: existing } = await db.from("profiles").select("id, recovery_email").eq("email", invite.email).maybeSingle();

  // An account for this company email already exists (someone removed earlier and invited again): they keep
  // their password and are added back. Anyone else's account is never taken over.
  let userId: string;
  let password = "";
  if (existing) {
    if (!existing.recovery_email) return { error: "That email is already in use." };
    userId = existing.id as string;
  } else {
    password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");
    if (password.length < 8) return { error: "Use 8+ characters." };
    if (password !== confirm) return { error: "The passwords don’t match." };
    const { data: created, error } = await db.auth.admin.createUser({
      email: invite.email, password, email_confirm: true,
      // "invited" keeps the sign-up trigger from also giving them a personal workspace.
      user_metadata: { full_name: invite.full_name, invited: true, terms_accepted_at: new Date().toISOString() },
    });
    if (error || !created.user) return { error: "Couldn’t create account." };
    userId = created.user.id;
  }
  const undo = async () => { if (!existing) await db.auth.admin.deleteUser(userId).catch(() => null); };

  await db.from("profiles").update({ recovery_email: invite.contact_email, full_name: invite.full_name || undefined }).eq("id", userId);

  const { data: already } = await db.from("workspace_members").select("status").eq("workspace_id", invite.workspace_id).eq("user_id", userId).maybeSingle();
  if (already?.status === "deactivated") { await undo(); return { error: "Your access was deactivated." }; }
  if (!already) {
    const { error } = await db.from("workspace_members").insert({ workspace_id: invite.workspace_id, user_id: userId, role: invite.role, status: "active", invited_by: invite.invited_by });
    if (error) { await undo(); return { error: "Couldn’t join. Try again." }; }

    const ids = (invite.department_ids ?? []) as string[];
    if (ids.length) {
      const { data: valid } = await db.from("departments").select("id").eq("workspace_id", invite.workspace_id).in("id", ids);
      if (valid?.length) await db.from("department_members").insert(valid.map((d: { id: string }) => ({ department_id: d.id, workspace_id: invite.workspace_id, user_id: userId })));
    }

    // Their company email is also their sending address, on a domain the organization verified.
    const [local, domain] = invite.email.split("@");
    const { data: dom } = await db.from("sending_domains").select("id").eq("workspace_id", invite.workspace_id).eq("domain", domain).maybeSingle();
    if (dom) {
      await db.from("sender_identities").insert({
        workspace_id: invite.workspace_id, domain_id: dom.id, local_part: local, email: invite.email, from_name: invite.full_name || local,
        kind: "primary", user_id: userId, created_by: invite.invited_by,
      });
    }
  }

  await db.from("workspace_invites").update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: userId }).eq("id", invite.id);
  await recordAudit(db, { id: userId, email: invite.email }, "member.joined", { type: "workspace", id: invite.workspace_id }, { workspace_id: invite.workspace_id, role: invite.role });

  cookies().set(ACTIVE_WORKSPACE_COOKIE, invite.workspace_id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });

  if (existing) redirect(`/login?next=/app`); // they sign in with the password they already have
  const { error: signInError } = await createClient().auth.signInWithPassword({ email: invite.email, password });
  if (signInError) redirect("/login");
  redirect("/app");
}
