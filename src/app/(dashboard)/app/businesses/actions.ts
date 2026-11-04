"use server";

import { cookies } from "next/headers";
import { limitsFor } from "@/config/plan-limits";
import { go } from "@/lib/flash";
import { ACTIVE_WORKSPACE_COOKIE, getContext } from "@/lib/workspace";
import { recordAudit } from "@/server/audit";
import { getBusinessQuota } from "@/server/businesses";

const BACK = "/app/businesses/new";

/**
 * Adds another business under the person's account. The new business is its own workspace (own logo, address,
 * domains, contacts, unsubscribes and senders) on the same plan as their main business, and it counts toward
 * the number of businesses that plan covers.
 */
export async function createBusinessAction(formData: FormData) {
  const ctx = await getContext();
  if (!ctx) go("/login", "err", "Sign in to continue.");
  if (!ctx.db) go("/app", "err", "Couldn’t reach the database. Try again in a moment.");
  const db = ctx.db;

  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 2) go(BACK, "err", "Enter the business name.");

  const quota = await getBusinessQuota(db, ctx.user.id);
  if (!quota) go("/app", "err", "Only the owner of a business can add another one.");
  if (quota.main.status === "suspended") go(BACK, "err", "Your account is suspended. Contact support before adding a business.");
  if (quota.used >= quota.cap) {
    const plan = quota.main.plan;
    go(BACK, "err", `Your ${plan} plan covers ${quota.cap} ${quota.cap === 1 ? "business" : "businesses"}. Upgrade your plan to add another.`);
  }

  const { data: same } = await db.from("workspaces").select("id").eq("owner_id", ctx.user.id).ilike("name", name.replace(/[%_\\]/g, "\\$&")).limit(1);
  if (same?.length) go(BACK, "err", "You already have a business with that name.");

  const limits = limitsFor(quota.main.plan);
  const { data: created, error } = await db.from("workspaces").insert({
    name,
    owner_id: ctx.user.id,
    plan: quota.main.plan,
    // A business added to an account that is already approved to send is approved; otherwise it follows the main one.
    status: quota.main.status === "active" ? "active" : "review",
    timezone: quota.main.timezone,
    max_contacts: limits.contacts,
    daily_send_limit: limits.startDaily,
    account_workspace_id: quota.main.id,
  }).select("id").single();
  if (error || !created) {
    console.error("[businesses] create failed:", error?.message);
    go(BACK, "err", "Couldn’t create the business. Try again in a moment.");
  }

  const { error: memberError } = await db.from("workspace_members").insert({ workspace_id: created.id, user_id: ctx.user.id, role: "owner" });
  if (memberError) {
    await db.from("workspaces").delete().eq("id", created.id);
    console.error("[businesses] owner link failed:", memberError.message);
    go(BACK, "err", "Couldn’t create the business. Try again in a moment.");
  }

  await recordAudit(db, { id: ctx.user.id, email: ctx.user.email }, "business.created", { type: "workspace", id: created.id }, { name });

  cookies().set(ACTIVE_WORKSPACE_COOKIE, created.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  go("/app/settings", "ok", `${name} is ready. Add its address and logo, then connect its sending domain.`);
}
