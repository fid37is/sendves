import "server-only";
import { env } from "@/lib/env";
import { emptyBrand, sanitizeBrand, type Brand } from "@/lib/email/design";
import type { Db } from "@/lib/supabase/admin";

export const ASSET_BUCKET = "email-assets";
export const MAX_ASSET_BYTES = 3 * 1024 * 1024;

/** Where this workspace's uploaded pictures live. Only URLs under this prefix may appear in its emails. */
export const assetPrefix = (workspaceId: string) => `${env.supabaseUrl}/storage/v1/object/public/${ASSET_BUCKET}/${workspaceId}/`;
export const assetOkFor = (workspaceId: string) => (url: string) => url.startsWith(assetPrefix(workspaceId)) && !url.includes("..");

export async function loadBrand(db: Db, workspaceId: string): Promise<Brand> {
  const { data } = await db.from("workspace_brand").select("logo_url, logo_align, logo_size").eq("workspace_id", workspaceId).maybeSingle();
  if (!data) return emptyBrand();
  return sanitizeBrand({ logo: { src: data.logo_url, align: data.logo_align, size: data.logo_size } }, assetOkFor(workspaceId));
}

export async function saveBrand(db: Db, workspaceId: string, input: unknown): Promise<Brand> {
  const brand = sanitizeBrand(input, assetOkFor(workspaceId));
  await db.from("workspace_brand").upsert(
    { workspace_id: workspaceId, logo_url: brand.logo.src, logo_align: brand.logo.align, logo_size: brand.logo.size, updated_at: new Date().toISOString() },
    { onConflict: "workspace_id" },
  );
  return brand;
}

/** Identifies a picture by its first bytes, not by the name or type the browser claims. */
export function sniffImage(b: Uint8Array): { ext: string; mime: string } | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { ext: "gif", mime: "image/gif" };
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: "webp", mime: "image/webp" };
  return null;
}
