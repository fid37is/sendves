"use server";

import { revalidatePath } from "next/cache";
import { go } from "@/lib/flash";
import { requireAdminDb } from "@/lib/auth/admin";
import { recordAudit } from "@/server/audit";

const UUID = /^[0-9a-f-]{36}$/i;
const id = (f: FormData) => {
  const v = String(f.get("id") ?? "");
  return UUID.test(v) ? v : "";
};

export async function approveCampaignAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const cid = id(formData);
  const { data: c } = cid ? await db.from("campaigns").select("id, workspace_id").eq("id", cid).eq("review_status", "pending").maybeSingle() : { data: null };
  if (!c) go("/review", "err", "That campaign isn’t waiting for review.");
  await db.from("campaigns").update({ review_status: "approved" }).eq("id", c.id);
  // A first approved campaign graduates the workspace out of review.
  await db.from("workspaces").update({ status: "active" }).eq("id", c.workspace_id).eq("status", "review");
  await recordAudit(db, user, "campaign.approve", { type: "campaign", id: c.id }, { workspace: c.workspace_id });
  revalidatePath("/admin", "layout");
  go("/review", "ok", "Approved. The worker will start sending it.");
}

export async function rejectCampaignAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const cid = id(formData);
  if (!cid) go("/review", "err", "That campaign isn’t waiting for review.");
  const { data } = await db.from("campaigns").update({ review_status: "rejected", status: "cancelled" }).eq("id", cid).eq("review_status", "pending").select("id");
  if (data?.length) await recordAudit(db, user, "campaign.reject", { type: "campaign", id: cid });
  revalidatePath("/admin", "layout");
  go("/review", data?.length ? "ok" : "err", data?.length ? "Campaign rejected and cancelled." : "That campaign isn’t waiting for review.");
}

export async function setWorkspaceStatusAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const wid = id(formData);
  const status = String(formData.get("status") ?? "");
  if (!wid || (status !== "suspended" && status !== "active")) go("/workspaces", "err", "Invalid request.");
  await db.from("workspaces").update({ status }).eq("id", wid);
  await recordAudit(db, user, status === "suspended" ? "workspace.suspend" : "workspace.reinstate", { type: "workspace", id: wid });
  revalidatePath("/admin", "layout");
  go("/workspaces", status === "suspended" ? "warn" : "ok", status === "suspended" ? "Workspace suspended. Sending stops immediately." : "Workspace reinstated.");
}

export async function resolveAbuseAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const rid = id(formData);
  if (!rid) go("/abuse", "err", "Invalid request.");
  await db.from("abuse_reports").update({ status: "resolved" }).eq("id", rid);
  await recordAudit(db, user, "abuse.resolve", { type: "abuse_report", id: rid });
  revalidatePath("/admin", "layout");
  go("/abuse", "ok", "Marked as resolved.");
}

export async function savePlatformSettingsAction(formData: FormData) {
  const { user, db } = await requireAdminDb();
  const num = (k: string, min: number, max: number) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
  };
  const next = {
    pause_bounce_pct: num("bounce", 0.1, 50),
    pause_complaint_pct: num("complaint", 0.01, 10),
    suspend_complaint_pct: num("suspend", 0.01, 10),
    new_workspace_daily_limit: Math.round(num("daily", 1, 100000)),
    new_workspace_max_contacts: Math.round(num("max", 1, 1000000)),
  };
  if (next.suspend_complaint_pct < next.pause_complaint_pct) {
    go("/settings", "err", "The suspension threshold can’t be lower than the pause threshold.");
  }
  await db.from("platform_settings").upsert({ id: 1, ...next });
  await recordAudit(db, user, "settings.update", { type: "platform_settings", id: "1" }, next);
  revalidatePath("/admin", "layout");
  go("/settings", "ok", "Settings saved. The worker picks them up on its next pass.");
}
