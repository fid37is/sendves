"use server";

import { revalidatePath } from "next/cache";
import { go } from "@/lib/flash";
import { requireWorkspace } from "@/lib/workspace";

const BACK = "/app/settings";
// Keep in step with the options on the settings page.
const TIME_ZONES = new Set(["Africa/Lagos", "UTC", "Europe/London", "America/New_York"]);
const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export async function updateProfileAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const fullName = text(formData, "fullName", 100);
  if (fullName.length < 2) go(BACK, "err", "Enter your full name.");

  const { error } = await ctx.db.from("profiles").update({ full_name: fullName }).eq("id", ctx.user.id);
  if (error) go(BACK, "err", "Couldn’t save your profile. Try again.");

  revalidatePath("/app", "layout"); // the name also appears in the app shell
  go(BACK, "ok", "Profile saved.");
}

export async function updateWorkspaceAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "org.settings");
  const name = text(formData, "business", 80);
  const address = text(formData, "address", 300);
  const tz = String(formData.get("tz") ?? "");

  if (!name) go(BACK, "err", "Enter your business name.");
  if (!TIME_ZONES.has(tz)) go(BACK, "err", "Choose a time zone from the list.");

  const { error } = await ctx.db.from("workspaces").update({
    name,
    business_address: address || null,
    timezone: tz,
    track_opens: formData.get("trackOpens") === "on",
  }).eq("id", ctx.workspace.id);
  if (error) go(BACK, "err", "Couldn’t save the workspace. Try again.");

  revalidatePath("/app", "layout");
  go(BACK, "ok", "Workspace saved.");
}