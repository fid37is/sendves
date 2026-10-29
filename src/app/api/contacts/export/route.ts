import { getContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Quotes a CSV cell and neutralises spreadsheet formulas (=, +, -, @) that a contact could have planted in their name. */
const esc = (v: string | null) => {
  let t = v ?? "";
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

/** Downloads every contact in the signed-in user's workspace as CSV. */
export async function GET() {
  const ctx = await getContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!ctx.db || !ctx.workspace) return new Response("No workspace", { status: 404 });

  const lines = ["email,first_name,last_name,status,created_at"];
  for (let from = 0; ; from += 1000) {
    const { data } = await ctx.db.from("contacts").select("email, first_name, last_name, status, created_at").eq("workspace_id", ctx.workspace.id).order("created_at").range(from, from + 999);
    if (!data?.length) break;
    for (const c of data) lines.push([esc(c.email), esc(c.first_name), esc(c.last_name), c.status, c.created_at].join(","));
    if (data.length < 1000) break;
  }
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="sendves-contacts.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
