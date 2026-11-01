import { can } from "@/lib/access";
import { getContext } from "@/lib/workspace";
import { MAX_ASSET_BYTES, uploadEmailAsset } from "@/server/email-assets";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Stores the logo or banner picked in the campaign editor and returns its address.
 * The browser has already scaled the picture down; the file is checked again here.
 */
export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return json({ ok: false, error: "Sign in again to continue." }, 401);
  if (!ctx.workspace || !ctx.db || !ctx.access || !can(ctx.access, "campaigns.manage")) return json({ ok: false, error: "You don’t have permission to edit campaigns." }, 403);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ ok: false, error: "That upload couldn’t be read." }, 400); }
  const file = form.get("file");
  const kind = form.get("kind") === "logo" ? "logo" : form.get("kind") === "banner" ? "banner" : null;
  if (!(file instanceof File) || !kind) return json({ ok: false, error: "Choose a picture." }, 400);
  if (file.size > MAX_ASSET_BYTES) return json({ ok: false, error: "That picture is larger than 2 MB." }, 413);

  const res = await uploadEmailAsset(ctx.db, ctx.workspace.id, kind, new Uint8Array(await file.arrayBuffer()));
  return res.ok ? json({ ok: true, url: res.url }) : json(res, 400);
}
