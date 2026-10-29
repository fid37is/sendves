"use server";

import { redirect } from "next/navigation";
import { flash } from "@/lib/flash";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkEmail } from "@/lib/validation/email";

const UUID = /^[0-9a-f-]{36}$/i;

export async function subscribeAction(formData: FormData) {
  const listId = String(formData.get("listId") ?? "");
  // Validate before the id is used to build any path.
  if (!UUID.test(listId)) redirect("/");
  const back = `/subscribe/${listId}`;
  const done = (kind: "ok" | "err", msg: string): never => {
    if (kind === "ok") {
      flash("success", msg);
      redirect(`${back}?done=1`);
    }
    flash("error", msg);
    redirect(back);
  };

  if (String(formData.get("website") ?? "")) done("ok", "Thanks, you’re subscribed."); // honeypot: pretend success
  const check = checkEmail(String(formData.get("email") ?? ""));
  if (!check.ok) done("err", "Enter a valid email address.");

  const db = createAdminClient();
  const { data: list } = await db.from("lists").select("id, workspace_id, workspaces(status, max_contacts)").eq("id", listId).maybeSingle();
  const ws = (list as any)?.workspaces;
  if (!list || !ws || ws.status === "suspended") done("err", "This signup form isn’t available.");

  const { count: blocked } = await db.from("suppression_entries").select("id", { count: "exact", head: true }).eq("email", check.email).or(`workspace_id.is.null,workspace_id.eq.${list!.workspace_id}`);
  if (blocked) done("ok", "Thanks, you’re subscribed."); // do not reveal suppression state

  const { count } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", list!.workspace_id);
  const { data: existing } = await db.from("contacts").select("id").eq("workspace_id", list!.workspace_id).eq("email", check.email).maybeSingle();
  if (!existing && (count ?? 0) >= ws.max_contacts) done("err", "This list is full right now. Please try again later.");

  let contactId = existing?.id as string | undefined;
  if (!contactId) {
    const { data: created } = await db.from("contacts").insert({
      workspace_id: list!.workspace_id, email: check.email, source: "signup form", consented_at: new Date().toISOString(),
      first_name: String(formData.get("firstName") ?? "").trim().slice(0, 80) || null,
    }).select("id").single();
    contactId = created?.id;
  }
  // Existing contacts who unsubscribed stay unsubscribed.
  if (contactId) await db.from("list_members").upsert({ list_id: listId, contact_id: contactId }, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
  done("ok", "Thanks, you’re subscribed.");
}
