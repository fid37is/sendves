"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { limitsFor } from "@/config/plan-limits";
import { renderBlocks } from "@/lib/email/blocks";
import { sanitizeBlocks } from "@/lib/email/sanitize";
import { getAudienceOptions } from "@/lib/queries";
import { go } from "@/lib/flash";
import { requireWorkspace } from "@/lib/workspace";
import { getProvider } from "@/server/sending/providers";
import { buildEmail } from "@/server/sending/render";
import { createDraftFromTemplate, resolveTemplate } from "@/server/templates";

type Ctx = Awaited<ReturnType<typeof requireWorkspace>>;
const page = (id: string) => `/app/campaigns/${id}`;
const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

export async function createCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns/new");
  const name = text(formData, "name", 120);
  if (!name) go("/app/campaigns/new", "err", "Give the campaign a name.");
  const tpl = (await resolveTemplate(ctx.db, ctx.workspace.id, text(formData, "template", 60))) ?? (await resolveTemplate(ctx.db, ctx.workspace.id, "blank"))!;
  const id = await createDraftFromTemplate(ctx, tpl, name);
  if (!id) go("/app/campaigns/new", "err", "Couldn’t create the campaign. Try again.");
  redirect(page(id));
}

/** Reads and validates the editor form into the row stored on a draft. Never redirects. */
async function draftRow(ctx: Ctx, formData: FormData) {
  let blocksInput: unknown = [];
  try { blocksInput = JSON.parse(String(formData.get("blocks") ?? "[]")); } catch { /* treated as empty */ }
  const blocks = sanitizeBlocks(blocksInput);

  const local = text(formData, "fromLocal", 64).toLowerCase().replace(/[^a-z0-9._+-]/g, "");
  const domain = text(formData, "fromDomain", 253).toLowerCase();
  // The From domain must be one this workspace registered. Otherwise a user could pick any domain
  // (including the platform's own) and send test emails that appear to come from it.
  let fromEmail = "";
  if (local && domain) {
    const { data: owned } = await ctx.db.from("sending_domains").select("id").eq("workspace_id", ctx.workspace.id).eq("domain", domain).maybeSingle();
    if (owned) fromEmail = `${local}@${domain}`;
  }

  let listId: string | null = text(formData, "listId", 60) || null;
  if (listId) {
    const { data: l } = await ctx.db.from("lists").select("id").eq("id", listId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!l) listId = null;
  }

  return {
    name: text(formData, "name", 120) || "Untitled campaign",
    subject: text(formData, "subject", 200),
    preview_text: text(formData, "previewText", 200),
    from_name: text(formData, "fromName", 80),
    from_email: fromEmail,
    list_id: listId,
    blocks,
    html: renderBlocks(blocks, { preview: text(formData, "previewText", 200) }),
  };
}

/** Saves the editor form onto a draft campaign and returns the stored row. */
async function saveDraft(ctx: Ctx, formData: FormData) {
  const id = text(formData, "id", 60);
  const { data: c } = await ctx.db.from("campaigns").select("id, status").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!c) go("/app/campaigns", "err", "Campaign not found.");
  if (c.status !== "draft") go(page(id), "err", "Only drafts can be edited.");

  const row = await draftRow(ctx, formData);
  await ctx.db.from("campaigns").update(row).eq("id", id);
  return { id, ...row };
}

export type AutosaveResult =
  | { ok: true; savedAt: string }
  /** `fatal` means retrying won't help (the campaign is gone or no longer a draft). */
  | { ok: false; error: string; fatal?: boolean };

/** Background save from the editor. Unlike the buttons it never redirects, so typing isn't interrupted. */
export async function autosaveCampaignAction(formData: FormData): Promise<AutosaveResult> {
  const ctx = await requireWorkspace("/app/campaigns");
  const id = text(formData, "id", 60);
  const { data: c } = await ctx.db.from("campaigns").select("id, status").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!c) return { ok: false, error: "This campaign no longer exists.", fatal: true };
  if (c.status !== "draft") return { ok: false, error: "This campaign has already been sent or scheduled, so it can’t be edited.", fatal: true };

  const row = await draftRow(ctx, formData);
  // The status guard stops a late autosave from touching a campaign that was just scheduled.
  const { error } = await ctx.db.from("campaigns").update(row).eq("id", id).eq("workspace_id", ctx.workspace.id).eq("status", "draft");
  if (error) return { ok: false, error: "Couldn’t save your changes." };
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function saveCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns");
  const c = await saveDraft(ctx, formData);
  revalidatePath(page(c.id));
  go(page(c.id), "ok", "Draft saved.");
}

export async function sendTestAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns");
  const c = await saveDraft(ctx, formData);
  const back = page(c.id);

  if (!c.subject || !c.from_email) go(back, "err", "Add a subject and choose a From address on one of your own sending domains before sending a test.");
  const { data: verified } = await ctx.db.from("sending_domains").select("id").eq("workspace_id", ctx.workspace.id).eq("domain", c.from_email.split("@")[1]).eq("status", "verified").maybeSingle();
  if (!verified) go(back, "err", "Verify the sending domain you chose before sending a test.");
  if (!ctx.workspace.business_address) go(back, "err", "Add your business address in Settings first. It appears in every email footer.");

  const email = buildEmail({
    campaign: { id: c.id, subject: c.subject, from_name: c.from_name, from_email: c.from_email, html: c.html },
    workspace: { name: ctx.workspace.name, business_address: ctx.workspace.business_address, track_opens: false },
    contact: { first_name: ctx.user.fullName.split(" ")[0] || null, last_name: null, email: ctx.user.email },
    sendId: null, subjectPrefix: "[Test] ",
  });
  try {
    await getProvider().send(email);
  } catch (err) {
    go(back, "err", `Couldn’t send the test: ${(err as Error).message}`);
  }
  go(back, "ok", `Test email sent to ${ctx.user.email}.`);
}

export async function submitCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns");
  const c = await saveDraft(ctx, formData);
  const back = page(c.id);
  const problems: string[] = [];

  if (!c.subject) problems.push("add a subject line");
  if (!c.from_name) problems.push("add a From name");
  if (!c.from_email) problems.push("choose a From address");
  if (c.blocks.length === 0) problems.push("add some content");
  if (!ctx.workspace.business_address) problems.push("add your business address in Settings");
  if (ctx.workspace.status === "suspended") problems.push("resolve your account suspension (contact support)");

  if (c.from_email) {
    const { data: dom } = await ctx.db.from("sending_domains").select("id").eq("workspace_id", ctx.workspace.id).eq("domain", c.from_email.split("@")[1]).eq("status", "verified").maybeSingle();
    if (!dom) problems.push("verify the sending domain you chose");
  }

  // Estimated audience: subscribed contacts, in the chosen list if any.
  let recipients = 0;
  if (c.list_id) {
    const { count } = await ctx.db.from("contacts").select("id, list_members!inner(list_id)", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id).eq("status", "subscribed").eq("list_members.list_id", c.list_id);
    recipients = count ?? 0;
  } else {
    const { count } = await ctx.db.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).eq("status", "subscribed");
    recipients = count ?? 0;
  }
  if (recipients === 0) problems.push("choose an audience with at least one subscribed contact");

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const { count: usedThisMonth } = await ctx.db.from("sends").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).gte("created_at", monthStart);
  const monthly = limitsFor(ctx.workspace.plan).monthlySends;
  if ((usedThisMonth ?? 0) + recipients > monthly) problems.push(`stay within your monthly limit of ${monthly.toLocaleString("en-US")} emails (this would use ${((usedThisMonth ?? 0) + recipients).toLocaleString("en-US")})`);

  if (problems.length) go(back, "err", `Before sending, please ${problems.join(", ")}.`);

  let when = new Date();
  const mode = text(formData, "mode", 10);
  if (mode === "later") {
    const parsed = new Date(text(formData, "scheduledAtIso", 40));
    const now = Date.now();
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() < now + 60_000 || parsed.getTime() > now + 90 * 86400_000) {
      go(back, "err", "Pick a schedule time between 1 minute and 90 days from now.");
    }
    when = parsed;
  }

  const needsReview = ctx.workspace.status === "review";
  await ctx.db.from("campaigns").update({
    status: "scheduled", scheduled_at: when.toISOString(), recipient_count: recipients,
    review_status: needsReview ? "pending" : "not_required",
  }).eq("id", c.id).eq("status", "draft");

  revalidatePath("/app/campaigns");
  go(back, "ok", needsReview
    ? "Submitted for review. New accounts have their first campaign checked before it sends, usually within a day."
    : mode === "later" ? "Campaign scheduled." : "Campaign queued. It will start sending in a moment.");
}

async function loadOwned(ctx: Ctx, formData: FormData) {
  const id = text(formData, "id", 60);
  const { data } = await ctx.db.from("campaigns").select("id, status").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) go("/app/campaigns", "err", "Campaign not found.");
  return data as { id: string; status: string };
}

export async function pauseCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns");
  const c = await loadOwned(ctx, formData);
  if (c.status === "sending") await ctx.db.from("campaigns").update({ status: "paused" }).eq("id", c.id);
  go(page(c.id), "ok", "Campaign paused.");
}

export async function resumeCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns");
  const c = await loadOwned(ctx, formData);
  if (ctx.workspace.status === "suspended") go(page(c.id), "err", "Your account is suspended. Contact support.");
  if (c.status === "paused") await ctx.db.from("campaigns").update({ status: "sending" }).eq("id", c.id);
  go(page(c.id), "ok", "Campaign resumed.");
}

export async function cancelCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns");
  const c = await loadOwned(ctx, formData);
  if (["scheduled", "sending", "paused"].includes(c.status)) {
    await ctx.db.from("campaigns").update({ status: "cancelled" }).eq("id", c.id);
    await ctx.db.from("sends").update({ status: "skipped" }).eq("campaign_id", c.id).in("status", ["queued", "sending"]);
  }
  go(page(c.id), "ok", "Campaign cancelled. Emails already sent can’t be recalled.");
}

export async function deleteCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns");
  const c = await loadOwned(ctx, formData);
  if (c.status === "draft" || c.status === "cancelled") await ctx.db.from("campaigns").delete().eq("id", c.id);
  revalidatePath("/app/campaigns");
  go("/app/campaigns", "ok", "Campaign deleted.");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PreviewContact = { id: string; email: string; first_name: string | null; last_name: string | null };

/** Up to 25 subscribed people in the chosen audience, for the editor's "Preview as" picker. */
export async function previewContactsAction(listId: string): Promise<PreviewContact[]> {
  const ctx = await requireWorkspace("/app/campaigns");
  const id = String(listId ?? "");
  if (id && !UUID_RE.test(id)) return [];
  const base = id
    ? ctx.db.from("contacts").select("id, email, first_name, last_name, list_members!inner(list_id)").eq("list_members.list_id", id)
    : ctx.db.from("contacts").select("id, email, first_name, last_name");
  const { data } = await base.eq("workspace_id", ctx.workspace.id).eq("status", "subscribed").order("created_at", { ascending: false }).limit(25);
  return (data ?? []).map((c: any) => ({ id: c.id, email: c.email, first_name: c.first_name ?? null, last_name: c.last_name ?? null }));
}

/** Fresh audience sizes for the editor, after people are added to a list. */
export async function audienceOptionsAction() {
  const ctx = await requireWorkspace("/app/campaigns");
  return getAudienceOptions(ctx);
}
