"use server";

import { randomUUID } from "node:crypto";
import { can, NO_PERMISSION } from "@/lib/access";
import { getContext } from "@/lib/workspace";
import { ASSET_BUCKET, assetPrefix, MAX_ASSET_BYTES, sniffImage } from "@/server/brand";

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/** Stores a picture for use in an email and returns its public address. Logo, banner and image blocks all use this. */
export async function uploadCampaignAssetAction(formData: FormData): Promise<UploadResult> {
  const ctx = await getContext();
  if (!ctx?.workspace || !ctx.db || !ctx.access) return { ok: false, error: "Your workspace isn’t available right now. Refresh and try again." };
  if (!can(ctx.access, "campaigns.manage")) return { ok: false, error: NO_PERMISSION };

  const kind = String(formData.get("kind") ?? "");
  if (!["logo", "banner", "image"].includes(kind)) return { ok: false, error: "Unknown picture type." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a picture first." };
  if (file.size > MAX_ASSET_BYTES) return { ok: false, error: "That picture is larger than 3 MB. Choose a smaller one." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return { ok: false, error: "Use a PNG, JPG, WebP or GIF picture." };

  const path = `${ctx.workspace.id}/${kind}/${randomUUID()}.${type.ext}`;
  const { error } = await ctx.db.storage.from(ASSET_BUCKET).upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: "31536000" });
  if (error) {
    console.error("[campaign assets] upload failed:", error.message);
    return { ok: false, error: "Couldn’t upload that picture. Try again." };
  }
  return { ok: true, url: `${assetPrefix(ctx.workspace.id)}${kind}/${path.split("/").pop()}` };
}
