import { can } from "@/lib/access";
import { getListsOverview } from "@/lib/queries";
import { getContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Quotes a CSV cell and neutralises spreadsheet formulas (=, +, -, @) that a contact could have planted in their name. */
const esc = (v: string | null) => {
  let t = v ?? "";
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Downloads contacts as CSV: everyone, or only the people in the lists named by repeated ?list=<id> parameters
 * (a person who is in several of the chosen lists appears once). Only lists the signed-in person can open count.
 */
export async function GET(req: Request) {
  const ctx = await getContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!ctx.db || !ctx.workspace) return new Response("No workspace", { status: 404 });
  if (!can(ctx.access, "contacts.view")) return new Response("Forbidden", { status: 403 });

  const asked = new URL(req.url).searchParams.getAll("list");
  let listIds: string[] | null = null;
  let fileName = "sendves-contacts";
  if (asked.length > 0) {
    const { lists } = await getListsOverview(ctx);
    const allowed = new Map(lists.map((l) => [l.id, l.name]));
    listIds = Array.from(new Set(asked.filter((id) => UUID_RE.test(id) && allowed.has(id))));
    if (listIds.length === 0) return new Response("No matching lists", { status: 404 });
    const slug = listIds.length === 1 ? String(allowed.get(listIds[0])).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "list" : `${listIds.length}-lists`;
    fileName = `sendves-contacts-${slug}`;
  }

  const lines = ["email,first_name,last_name,status,created_at"];
  for (let from = 0; ; from += 1000) {
    let q: any = ctx.db.from("contacts").select(`email, first_name, last_name, status, created_at${listIds ? ", list_members!inner(list_id)" : ""}`).eq("workspace_id", ctx.workspace.id);
    if (listIds) q = q.in("list_members.list_id", listIds);
    const { data } = await q.order("created_at").order("id").range(from, from + 999);
    if (!data?.length) break;
    for (const c of data as any[]) lines.push([esc(c.email), esc(c.first_name), esc(c.last_name), c.status, c.created_at].join(","));
    if (data.length < 1000) break;
  }
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}