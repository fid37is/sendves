"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { limitsFor } from "@/config/plan-limits";
import { canAccessDepartment, canAssignDepartment } from "@/lib/access";
import { renderBlocks } from "@/lib/email/blocks";
import { sanitizeBlocks } from "@/lib/email/sanitize";
import { analyzeVariables, blockStrings, knownKeys, sanitizeVariables } from "@/lib/email/variables";
import { getAudienceOptions, getContactFieldKeys } from "@/lib/queries";
import { go } from "@/lib/flash";
import { requireWorkspace } from "@/lib/workspace";
import { audienceSize, parseSelection, saveAudience, type AudienceSelection } from "@/server/audience";
import { checkSender } from "@/server/senders";
import { inScope } from "@/server/scope";
import { getProvider } from "@/server/sending/providers";
import { buildEmail } from "@/server/sending/render";
import { createDraftFromTemplate, resolveTemplate } from "@/server/templates";

type Ctx = Awaited<ReturnType<typeof requireWorkspace>>;
const page = (id: string) => `/app/campaigns/${id}`;
const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns/new", "campaigns.manage");
  const name = text(formData, "name", 120);
  if (!name) go("/app/campaigns/new", "err", "Give the campaign a name.");
  const tpl = (await resolveTemplate(ctx.db, ctx.workspace.id, text(formData, "template", 60), ctx.access)) ?? (await resolveTemplate(ctx.db, ctx.workspace.id, "blank"))!;
  const id = await createDraftFromTemplate(ctx, tpl, name);
  if (!id) go("/app/campaigns/new", "err", "Couldn’t create the campaign. Try again.");
  redirect(page(id));
}

/** A campaign of this workspace that the person may open (not another department's). Null otherwise. */
async function loadCampaign(ctx: Ctx, id: string) {
  if (!UUID_RE.test(id)) return null;
  const { data } = await ctx.db.from("campaigns").select("id, status, department_id, sender_identity_id").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  const c = data as { id: string; status: string; department_id: string | null; sender_identity_id: string | null } | null;
  return c && canAccessDepartment(ctx.access, c.department_id) ? c : null;
}

/** Reads and validates the editor form into the row stored on a draft. Never redirects. */
async function draftRow(ctx: Ctx, formData: FormData, current: { department_id: string | null; sender_identity_id: string | null }) {
  let blocksInput: unknown = [];
  try { blocksInput = JSON.parse(String(formData.get("blocks") ?? "[]")); } catch { /* treated as empty */ }
  const blocks = sanitizeBlocks(blocksInput);

  let variablesInput: unknown = [];
  try { variablesInput = JSON.parse(String(formData.get("variables") ?? "[]")); } catch { /* treated as empty */ }

  // Sender: the person's own work email or one of their aliases, in THIS workspace. A draft that already
  // uses someone else's address keeps it until the sender is changed. The address and name come from
  // the identity, never from the browser, so nobody can type another company's address.
  let senderId: string | null = current.sender_identity_id;
  let fromEmail = "";
  let fromName = "";
  if (formData.has("senderId")) {
    const wanted = text(formData, "senderId", 60);
    senderId = null;
    if (UUID_RE.test(wanted)) {
      const { data } = await ctx.db.from("sender_identities").select("id").eq("id", wanted).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (data) senderId = data.id;
    }
  }
  if (senderId) {
    const { data } = await ctx.db.from("sender_identities").select("id, email, from_name, user_id").eq("id", senderId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    const ident = data as { id: string; email: string; from_name: string; user_id: string | null } | null;
    if (ident && (ident.user_id === ctx.user.id || ident.id === current.sender_identity_id)) { fromEmail = ident.email; fromName = ident.from_name; }
    else senderId = null;
  }

  // Department: only one the person may assign. Unchanged when the form doesn't send one.
  let departmentId = current.department_id;
  if (formData.has("departmentId")) {
    const wanted = text(formData, "departmentId", 60);
    if (!wanted) departmentId = canAssignDepartment(ctx.access, null) ? null : current.department_id;
    else if (UUID_RE.test(wanted)) {
      const { data } = await ctx.db.from("departments").select("id").eq("id", wanted).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (data && canAssignDepartment(ctx.access, wanted)) departmentId = wanted;
    }
  }

  const previewText = text(formData, "previewText", 200);
  return {
    name: text(formData, "name", 120) || "Untitled campaign",
    subject: text(formData, "subject", 200),
    preview_text: previewText,
    from_name: fromName,
    from_email: fromEmail,
    sender_identity_id: senderId,
    department_id: departmentId,
    variables: sanitizeVariables(variablesInput),
    blocks,
    html: renderBlocks(blocks, { preview: previewText }),
  };
}

/** The audience posted by the editor, or null when the form didn't include one (left untouched). */
function postedAudience(formData: FormData): AudienceSelection | null {
  const raw = formData.get("audience");
  if (typeof raw !== "string" || !raw) return null;
  try { return parseSelection(JSON.parse(raw)); } catch { return null; }
}

/** Saves the editor form onto a draft campaign and returns the stored values. */
async function saveDraft(ctx: Ctx, formData: FormData) {
  const id = text(formData, "id", 60);
  const c = await loadCampaign(ctx, id);
  if (!c) go("/app/campaigns", "err", "Campaign not found.");
  if (c.status !== "draft") go(page(id), "err", "Only drafts can be edited.");

  const row = await draftRow(ctx, formData, c);
  await ctx.db.from("campaigns").update(row).eq("id", id).eq("workspace_id", ctx.workspace.id);
  const audience = postedAudience(formData);
  if (audience) {
    const saved = await saveAudience(ctx, id, audience);
    if (!saved.ok) go(page(id), "err", saved.error);
  }
  return { id, ...row, audience };
}

export type AutosaveResult =
  | { ok: true; savedAt: string }
  /** `fatal` means retrying won't help (the campaign is gone or no longer a draft). */
  | { ok: false; error: string; fatal?: boolean };

/** Background save from the editor. Unlike the buttons it never redirects, so typing isn't interrupted. */
export async function autosaveCampaignAction(formData: FormData): Promise<AutosaveResult> {
  const ctx = await requireWorkspace("/app/campaigns", "campaigns.manage");
  const id = text(formData, "id", 60);
  const c = await loadCampaign(ctx, id);
  if (!c) return { ok: false, error: "This campaign no longer exists.", fatal: true };
  if (c.status !== "draft") return { ok: false, error: "This campaign can’t be edited.", fatal: true };

  const row = await draftRow(ctx, formData, c);
  // The status guard stops a late autosave from touching a campaign that was just scheduled.
  const { error } = await ctx.db.from("campaigns").update(row).eq("id", id).eq("workspace_id", ctx.workspace.id).eq("status", "draft");
  if (error) return { ok: false, error: "Couldn’t save your changes." };
  const audience = postedAudience(formData);
  if (audience) {
    const saved = await saveAudience(ctx, id, audience);
    if (!saved.ok) return { ok: false, error: saved.error };
  }
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function saveCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns", "campaigns.manage");
  const c = await saveDraft(ctx, formData);
  revalidatePath(page(c.id));
  go(page(c.id), "ok", "Draft saved.");
}

export async function sendTestAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns", "campaigns.manage");
  const c = await saveDraft(ctx, formData);
  const back = page(c.id);

  if (!c.subject) go(back, "err", "Add a subject line before sending a test.");
  const sender = await checkSender(ctx.db, ctx.workspace.id, c.sender_identity_id);
  if (!sender.ok) go(back, "err", sender.reason);
  if (!ctx.workspace.business_address) go(back, "err", "Add your business address in Settings first. It appears in every email footer.");

  const email = buildEmail({
    campaign: { id: c.id, subject: c.subject, from_name: sender.identity.from_name, from_email: sender.identity.email, html: c.html, variables: c.variables },
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
  const ctx = await requireWorkspace("/app/campaigns", ["campaigns.manage", "campaigns.send"]);
  const c = await saveDraft(ctx, formData);
  const back = page(c.id);
  const problems: string[] = [];

  if (!c.subject) problems.push("add a subject line");
  if (c.blocks.length === 0) problems.push("add some content");
  if (!ctx.workspace.business_address) problems.push("add your business address in Settings");
  if (ctx.workspace.status === "suspended") problems.push("resolve your account suspension (contact support)");

  // The sender must be an active identity on a verified domain of THIS workspace.
  const sender = await checkSender(ctx.db, ctx.workspace.id, c.sender_identity_id);
  if (!sender.ok) problems.push(sender.reason.charAt(0).toLowerCase() + sender.reason.slice(1).replace(/\.$/, ""));

  // Audience, counted by the same rules the delivery queue uses.
  const stored = await ctx.db.from("campaigns").select("audience_mode").eq("id", c.id).maybeSingle();
  const [{ data: lists }, { data: contacts }] = await Promise.all([
    ctx.db.from("campaign_audience_lists").select("list_id").eq("campaign_id", c.id),
    ctx.db.from("campaign_audience_contacts").select("contact_id").eq("campaign_id", c.id).limit(5000),
  ]);
  const recipients = await audienceSize(ctx, {
    mode: (stored.data as { audience_mode?: string } | null)?.audience_mode === "custom" ? "custom" : "all",
    listIds: ((lists ?? []) as { list_id: string }[]).map((l) => l.list_id),
    contactIds: ((contacts ?? []) as { contact_id: string }[]).map((r) => r.contact_id),
  });
  if (recipients === 0) problems.push("choose an audience with at least one subscribed contact");

  // Variables that would leave a blank or show raw {{braces}} in the email.
  const fieldKeys = await getContactFieldKeys(ctx);
  const report = analyzeVariables([c.subject, c.preview_text, ...blockStrings(c.blocks)], knownKeys(fieldKeys, c.variables), c.variables);
  if (report.malformed.length) problems.push(`fix ${report.malformed.slice(0, 3).join(", ")}, which can’t be read as a variable`);
  if (report.undefinedKeys.length) problems.push(`define ${report.undefinedKeys.slice(0, 3).map((k) => `{{${k}}}`).join(", ")} on the Variables tab, or give it a fallback like {{${report.undefinedKeys[0]}|friend}}`);

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const { count: usedThisMonth } = await ctx.db.from("sends").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).gte("created_at", monthStart);
  const monthly = limitsFor(ctx.workspace.plan).monthlySends;
  if ((usedThisMonth ?? 0) + recipients > monthly) problems.push(`stay within your monthly limit of ${monthly.toLocaleString("en-US")} emails (this would use ${((usedThisMonth ?? 0) + recipients).toLocaleString("en-US")})`);

  if (problems.length || !sender.ok) go(back, "err", `Before sending, please ${problems.join(", ")}.`);

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
    // Re-derived from the identity at the moment of sending, in case it was edited since the draft was saved.
    from_email: sender.identity.email, from_name: sender.identity.from_name, pause_reason: null,
  }).eq("id", c.id).eq("workspace_id", ctx.workspace.id).eq("status", "draft");

  revalidatePath("/app/campaigns");
  go(back, "ok", needsReview
    ? "Submitted for review. New accounts have their first campaign checked before it sends, usually within a day."
    : mode === "later" ? "Campaign scheduled." : "Campaign queued. It will start sending in a moment.");
}

async function loadOwned(ctx: Ctx, formData: FormData) {
  const c = await loadCampaign(ctx, text(formData, "id", 60));
  if (!c) go("/app/campaigns", "err", "Campaign not found.");
  return c;
}

export async function pauseCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns", "campaigns.send");
  const c = await loadOwned(ctx, formData);
  if (c.status === "sending") await ctx.db.from("campaigns").update({ status: "paused", pause_reason: "Paused by a team member." }).eq("id", c.id).eq("workspace_id", ctx.workspace.id);
  go(page(c.id), "ok", "Campaign paused.");
}

export async function resumeCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns", "campaigns.send");
  const c = await loadOwned(ctx, formData);
  if (ctx.workspace.status === "suspended") go(page(c.id), "err", "Your account is suspended. Contact support.");
  if (c.status === "paused") {
    // A campaign can't resume while its sender is deactivated or its domain isn't verified.
    const sender = await checkSender(ctx.db, ctx.workspace.id, c.sender_identity_id);
    if (!sender.ok) go(page(c.id), "err", `Can’t resume yet: ${sender.reason}`);
    await ctx.db.from("campaigns").update({ status: "sending", pause_reason: null }).eq("id", c.id).eq("workspace_id", ctx.workspace.id);
  }
  go(page(c.id), "ok", "Campaign resumed.");
}

export async function cancelCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns", "campaigns.send");
  const c = await loadOwned(ctx, formData);
  if (["scheduled", "sending", "paused"].includes(c.status)) {
    await ctx.db.from("campaigns").update({ status: "cancelled" }).eq("id", c.id).eq("workspace_id", ctx.workspace.id);
    await ctx.db.from("sends").update({ status: "skipped" }).eq("campaign_id", c.id).in("status", ["queued", "sending"]);
  }
  go(page(c.id), "ok", "Campaign cancelled. Emails already sent can’t be recalled.");
}

export async function deleteCampaignAction(formData: FormData) {
  const ctx = await requireWorkspace("/app/campaigns", "campaigns.manage");
  const c = await loadOwned(ctx, formData);
  if (c.status === "draft" || c.status === "cancelled") await ctx.db.from("campaigns").delete().eq("id", c.id).eq("workspace_id", ctx.workspace.id);
  revalidatePath("/app/campaigns");
  go("/app/campaigns", "ok", "Campaign deleted.");
}

export type PreviewContact = { id: string; email: string; first_name: string | null; last_name: string | null; custom_fields: Record<string, unknown> };

/** Up to 25 subscribed people in the current selection, for the preview's "Preview as" picker. */
export async function previewContactsAction(selection: unknown): Promise<PreviewContact[]> {
  const ctx = await requireWorkspace("/app/campaigns", "campaigns.view");
  const sel = parseSelection(selection);
  const cols = "id, email, first_name, last_name, custom_fields";
  const ws = ctx.workspace.id;
  const out = new Map<string, PreviewContact>();
  const add = (rows: any[] | null) => { for (const c of rows ?? []) if (out.size < 25 && c?.id && !out.has(c.id)) out.set(c.id, { id: c.id, email: c.email, first_name: c.first_name ?? null, last_name: c.last_name ?? null, custom_fields: c.custom_fields ?? {} }); };

  if (sel.mode === "custom") {
    if (sel.contactIds.length) add((await ctx.db.from("contacts").select(cols).eq("workspace_id", ws).eq("status", "subscribed").in("id", sel.contactIds.slice(0, 200)).limit(25)).data);
    if (sel.listIds.length && out.size < 25) {
      const { data: lists } = await inScope(ctx.db.from("lists").select("id").eq("workspace_id", ws).in("id", sel.listIds), ctx.access);
      const ids = ((lists ?? []) as { id: string }[]).map((l) => l.id);
      if (ids.length) add((await ctx.db.from("contacts").select(`${cols}, list_members!inner(list_id)`).eq("workspace_id", ws).eq("status", "subscribed").in("list_members.list_id", ids).limit(25)).data);
    }
  } else {
    add((await ctx.db.from("contacts").select(cols).eq("workspace_id", ws).eq("status", "subscribed").order("created_at", { ascending: false }).limit(25)).data);
  }
  return [...out.values()];
}

/** Fresh list sizes for the editor, after people are added to a list. */
export async function audienceOptionsAction() {
  const ctx = await requireWorkspace("/app/campaigns", "campaigns.view");
  return getAudienceOptions(ctx);
}
