"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { limitsFor } from "@/config/plan-limits";
import { can, NO_PERMISSION, type Permission } from "@/lib/access";
import { canAccessDepartment } from "@/lib/access";
import { renderCampaignHtml, reviewChecks, sanitizeDesign, sanitizeLogo, type Design, type Logo } from "@/lib/email/campaign";
import { sanitizeVariables, type VariableDef } from "@/lib/email/variables";
import { getAudienceOptions } from "@/lib/queries";
import { go } from "@/lib/flash";
import { getContext, requireWorkspace } from "@/lib/workspace";
import { audienceSize, parseSelection, saveAudience, type AudienceSelection } from "@/server/audience";
import { assetRule, getEmailLogo, saveEmailLogo } from "@/server/email-assets";
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

/** What the editor sends to be saved, tested or sent. Everything in it is validated again here. */
export type EditorPayload = {
  id: string;
  senderId: string;
  subject: string;
  preheader: string;
  audience: { mode: "all" | "custom"; listIds: string[]; contactIds: string[] };
  design: unknown;
  logo: unknown;
  variables: unknown;
};

export type SaveResult =
  | { ok: true; savedAt: string }
  /** `fatal` means retrying won't help (the campaign is gone or no longer a draft). */
  | { ok: false; error: string; fatal?: boolean };

/** Signed in, with a workspace and the given permissions. Returns a message instead of redirecting, so the editor stays open. */
async function authorize(...need: Permission[]) {
  const ctx = await getContext();
  if (!ctx?.workspace || !ctx.db || !ctx.access) return { ok: false as const, error: "Your workspace isn’t available right now. Refresh and try again." };
  if (!need.every((p) => can(ctx.access, p))) return { ok: false as const, error: NO_PERMISSION };
  return { ok: true as const, ctx: { user: ctx.user, workspace: ctx.workspace, db: ctx.db, access: ctx.access } };
}

type Saved = {
  id: string; subject: string; preheader: string; html: string; design: Design; logo: Logo; variables: VariableDef[];
  senderId: string | null; selection: AudienceSelection;
};

/**
 * Validates what the editor sent and stores it on the draft: the content, the sender, the audience and
 * the workspace's shared logo. The sender's address and name come from the sender identity, never from
 * the browser, so nobody can type another company's address.
 */
async function persistDraft(ctx: Ctx, p: EditorPayload): Promise<{ ok: true; saved: Saved } | { ok: false; error: string; fatal?: boolean }> {
  const id = String(p?.id ?? "").slice(0, 60);
  const c = await loadCampaign(ctx, id);
  if (!c) return { ok: false, error: "This campaign no longer exists.", fatal: true };
  if (c.status !== "draft") return { ok: false, error: "This campaign has already been sent or scheduled, so it can’t be edited.", fatal: true };

  let senderId: string | null = c.sender_identity_id;
  let fromEmail = "";
  let fromName = "";
  if (typeof p.senderId === "string") {
    const wanted = p.senderId.slice(0, 60);
    senderId = null;
    if (UUID_RE.test(wanted)) {
      const { data } = await ctx.db.from("sender_identities").select("id").eq("id", wanted).eq("workspace_id", ctx.workspace.id).maybeSingle();
      if (data) senderId = data.id;
    }
  }
  if (senderId) {
    const { data } = await ctx.db.from("sender_identities").select("id, email, from_name, user_id").eq("id", senderId).eq("workspace_id", ctx.workspace.id).maybeSingle();
    const ident = data as { id: string; email: string; from_name: string; user_id: string | null } | null;
    // A draft that already uses someone else's address keeps it until the sender is changed.
    if (ident && (ident.user_id === ctx.user.id || ident.id === c.sender_identity_id)) { fromEmail = ident.email; fromName = ident.from_name; }
    else senderId = null;
  }

  const rule = assetRule(ctx.workspace.id);
  const design = sanitizeDesign(p.design, rule);
  const logo = sanitizeLogo(p.logo, rule);
  const variables = sanitizeVariables(p.variables);
  const subject = String(p.subject ?? "").trim().slice(0, 200);
  const preheader = String(p.preheader ?? "").trim().slice(0, 200);

  // The logo belongs to the workspace and is reused by every campaign.
  const current = await getEmailLogo(ctx.db, ctx.workspace.id);
  if (JSON.stringify(current) !== JSON.stringify(logo) && !(await saveEmailLogo(ctx.db, ctx.workspace.id, logo))) {
    return { ok: false, error: "Couldn’t save the logo." };
  }

  const html = renderCampaignHtml(design, { logo, tz: ctx.workspace.timezone || "UTC" }, preheader);
  // The status guard stops a late save from touching a campaign that was just scheduled.
  const { error } = await ctx.db.from("campaigns").update({
    subject, preview_text: preheader, from_name: fromName, from_email: fromEmail, sender_identity_id: senderId,
    variables, design, html,
  }).eq("id", id).eq("workspace_id", ctx.workspace.id).eq("status", "draft");
  if (error) return { ok: false, error: "Couldn’t save your changes." };

  const selection = parseSelection(p.audience);
  const saved = await saveAudience(ctx, id, selection);
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, saved: { id, subject, preheader, html, design, logo, variables, senderId, selection } };
}

/** Background save from the editor. It never redirects, so typing isn't interrupted. */
export async function autosaveCampaignAction(payload: EditorPayload): Promise<SaveResult> {
  const a = await authorize("campaigns.manage");
  if (!a.ok) return { ok: false, error: a.error };
  const res = await persistDraft(a.ctx, payload);
  return res.ok ? { ok: true, savedAt: new Date().toISOString() } : res;
}

export type TestResult = { ok: true; to: string } | { ok: false; error: string };

/** Saves the draft, then sends it to the signed-in person so they can see it in a real inbox. */
export async function sendTestAction(payload: EditorPayload): Promise<TestResult> {
  const a = await authorize("campaigns.manage");
  if (!a.ok) return { ok: false, error: a.error };
  const ctx = a.ctx;
  const res = await persistDraft(ctx, payload);
  if (!res.ok) return { ok: false, error: res.error };
  const c = res.saved;

  if (!c.subject) return { ok: false, error: "Add a subject before sending a test." };
  const sender = await checkSender(ctx.db, ctx.workspace.id, c.senderId);
  if (!sender.ok) return { ok: false, error: sender.reason };
  if (!ctx.workspace.business_address) return { ok: false, error: "Add your business address in Settings first. It appears at the end of every email." };

  const email = buildEmail({
    campaign: { id: c.id, subject: c.subject, from_name: sender.identity.from_name, from_email: sender.identity.email, html: c.html, variables: c.variables },
    workspace: { name: ctx.workspace.name, business_address: ctx.workspace.business_address, track_opens: false, timezone: ctx.workspace.timezone },
    contact: { first_name: ctx.user.fullName.split(" ")[0] || null, last_name: null, email: ctx.user.email },
    sendId: null, subjectPrefix: "[Test] ",
  });
  try {
    await getProvider().send(email);
  } catch (err) {
    return { ok: false, error: `Couldn’t send the test: ${(err as Error).message}` };
  }
  return { ok: true, to: ctx.user.email };
}

export type SubmitInput = EditorPayload & { mode: "now" | "later"; scheduledAtIso?: string };
export type SubmitResult =
  | { ok: true; mode: "now" | "later"; recipients: number; inReview: boolean }
  | { ok: false; error: string };

/** Saves the draft, checks everything again on the server, then queues it to send now or at the chosen time. */
export async function submitCampaignAction(input: SubmitInput): Promise<SubmitResult> {
  const a = await authorize("campaigns.manage", "campaigns.send");
  if (!a.ok) return { ok: false, error: a.error };
  const ctx = a.ctx;
  const res = await persistDraft(ctx, input);
  if (!res.ok) return { ok: false, error: res.error };
  const c = res.saved;

  const problems: string[] = [];
  if (ctx.workspace.status === "suspended") problems.push("resolve your account suspension (contact support)");

  // The sender must be an active identity on a verified domain of THIS workspace.
  const sender = await checkSender(ctx.db, ctx.workspace.id, c.senderId);
  // Audience, counted by the same rules the delivery queue uses.
  const recipients = await audienceSize(ctx, c.selection);

  const checks = reviewChecks({
    subject: c.subject, design: c.design, logo: c.logo, variables: c.variables, extraTexts: [c.subject, c.preheader],
    audience: { chosen: c.selection.mode === "all" || c.selection.listIds.length > 0 || c.selection.contactIds.length > 0, name: "", size: recipients },
    sender: { ok: sender.ok, label: "", problem: sender.ok ? null : sender.reason },
    addressSet: Boolean(ctx.workspace.business_address),
  });
  for (const k of checks) if (!k.ok && k.problem) problems.push(k.problem);

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const { count: usedThisMonth } = await ctx.db.from("sends").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).gte("created_at", monthStart);
  const monthly = limitsFor(ctx.workspace.plan).monthlySends;
  if ((usedThisMonth ?? 0) + recipients > monthly) problems.push(`stay within your monthly limit of ${monthly.toLocaleString("en-US")} emails (this would use ${((usedThisMonth ?? 0) + recipients).toLocaleString("en-US")})`);

  let when = new Date();
  if (input.mode === "later") {
    const parsed = new Date(String(input.scheduledAtIso ?? ""));
    const now = Date.now();
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() < now + 60_000 || parsed.getTime() > now + 90 * 86400_000) {
      problems.push("pick a schedule time between 1 minute and 90 days from now");
    }
    when = parsed;
  }

  if (problems.length || !sender.ok) return { ok: false, error: `Before sending, please ${problems.join(", ")}.` };

  const needsReview = ctx.workspace.status === "review";
  const { error } = await ctx.db.from("campaigns").update({
    status: "scheduled", scheduled_at: when.toISOString(), recipient_count: recipients,
    review_status: needsReview ? "pending" : "not_required",
    // Re-derived from the identity at the moment of sending, in case it was edited since the draft was saved.
    from_email: sender.identity.email, from_name: sender.identity.from_name, pause_reason: null,
  }).eq("id", c.id).eq("workspace_id", ctx.workspace.id).eq("status", "draft");
  if (error) return { ok: false, error: "Couldn’t queue the campaign. Try again." };

  revalidatePath("/app/campaigns");
  revalidatePath(page(c.id));
  return { ok: true, mode: input.mode, recipients, inReview: needsReview };
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
