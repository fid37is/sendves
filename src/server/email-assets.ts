import "server-only";
import { randomUUID } from "crypto";
import { env } from "@/lib/env";
import { EMPTY_LOGO, sanitizeLogo, type AssetRule, type Logo } from "@/lib/email/campaign";
import type { Db } from "@/lib/supabase/admin";

/** The public bucket that holds logos and banners. Created by migration 0008. */
export const EMAIL_ASSET_BUCKET = "email-assets";
export const MAX_ASSET_BYTES = 2 * 1024 * 1024;

/** Only pictures under this address (this workspace's folder) are accepted as a logo or banner. */
export function assetRule(workspaceId: string): AssetRule {
  return { prefix: `${env.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${EMAIL_ASSET_BUCKET}/${workspaceId}/` };
}

/** The kind of picture, read from the file's first bytes rather than from what the browser claims. */
export function sniffImage(bytes: Uint8Array): { type: string; ext: string } | null {
  const is = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (is(0x89, 0x50, 0x4e, 0x47)) return { type: "image/png", ext: "png" };
  if (is(0xff, 0xd8, 0xff)) return { type: "image/jpeg", ext: "jpg" };
  if (is(0x47, 0x49, 0x46, 0x38)) return { type: "image/gif", ext: "gif" };
  if (is(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { type: "image/webp", ext: "webp" };
  return null;
}

/** Stores a picture in the workspace's folder and returns its public address. */
export async function uploadEmailAsset(db: Db, workspaceId: string, kind: "logo" | "banner", bytes: Uint8Array): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > MAX_ASSET_BYTES) return { ok: false, error: "That picture is larger than 2 MB." };
  const kindOf = sniffImage(bytes);
  if (!kindOf) return { ok: false, error: "Use a PNG, JPG, GIF or WebP picture." };
  const path = `${workspaceId}/${kind}-${randomUUID()}.${kindOf.ext}`;
  const { error } = await db.storage.from(EMAIL_ASSET_BUCKET).upload(path, bytes, { contentType: kindOf.type, cacheControl: "31536000", upsert: false });
  if (error) return { ok: false, error: "Couldn’t store the picture. Try again." };
  return { ok: true, url: db.storage.from(EMAIL_ASSET_BUCKET).getPublicUrl(path).data.publicUrl };
}

/** The workspace's shared logo, with how it's aligned and sized. */
export async function getEmailLogo(db: Db, workspaceId: string): Promise<Logo> {
  const { data } = await db.from("workspaces").select("email_logo_url, email_logo_align, email_logo_size, email_logo_w, email_logo_h").eq("id", workspaceId).maybeSingle();
  const r = data as { email_logo_url: string | null; email_logo_align: string; email_logo_size: string; email_logo_w: number; email_logo_h: number } | null;
  if (!r) return EMPTY_LOGO;
  return sanitizeLogo({ src: r.email_logo_url ?? "", align: r.email_logo_align, size: r.email_logo_size, w: r.email_logo_w, h: r.email_logo_h }, assetRule(workspaceId));
}

export async function saveEmailLogo(db: Db, workspaceId: string, logo: Logo): Promise<boolean> {
  const { error } = await db.from("workspaces").update({
    email_logo_url: logo.src || null, email_logo_align: logo.align, email_logo_size: logo.size, email_logo_w: logo.w, email_logo_h: logo.h,
  }).eq("id", workspaceId);
  return !error;
}
