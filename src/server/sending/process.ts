import { createAdminClient, type Db } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { evaluateHealth, loadSettings, maybeRaiseLimit } from "@/server/abuse";
import { getProvider, PermanentSendError, type MailProvider } from "./providers";
import { buildEmail } from "./render";

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = Record<string, any>;
type Caches = {
  campaigns: Map<string, Row | null>;
  workspaces: Map<string, Row | null>;
  sentToday: Map<string, number>;
};

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function cached<T>(map: Map<string, T>, key: string, load: () => Promise<T>): Promise<T> {
  if (!map.has(key)) map.set(key, await load());
  return map.get(key) as T;
}

/** Turns due, approved campaigns into queued sends. */
async function activateScheduled(db: Db): Promise<number> {
  const { data: due } = await db
    .from("campaigns").select("id, workspace_id")
    .eq("status", "scheduled").lte("scheduled_at", new Date().toISOString())
    .in("review_status", ["not_required", "approved"]).limit(50);

  let n = 0;
  for (const c of due ?? []) {
    const { data: ws } = await db.from("workspaces").select("status").eq("id", c.workspace_id).maybeSingle();
    if (!ws || ws.status === "suspended") continue;
    await db.rpc("enqueue_campaign", { p_campaign: c.id });
    n++;
  }
  return n;
}

async function setSend(db: Db, id: string, patch: Row) {
  await db.from("sends").update({ locked_at: null, ...patch }).eq("id", id);
}

async function processSend(db: Db, provider: MailProvider, send: Row, caches: Caches): Promise<"sent" | "failed" | "other"> {
  const campaign = await cached(caches.campaigns, send.campaign_id, async () =>
    (await db.from("campaigns").select("id, subject, from_name, from_email, html, status").eq("id", send.campaign_id).maybeSingle()).data);
  const ws = await cached(caches.workspaces, send.workspace_id, async () =>
    (await db.from("workspaces").select("id, name, business_address, track_opens, daily_send_limit, status").eq("id", send.workspace_id).maybeSingle()).data);

  if (!campaign || !ws || campaign.status === "cancelled" || ws.status === "suspended") {
    await setSend(db, send.id, { status: "skipped" });
    return "other";
  }

  const { data: contact } = await db.from("contacts").select("id, email, first_name, last_name, status").eq("id", send.contact_id).maybeSingle();
  if (!contact || contact.status !== "subscribed") {
    await setSend(db, send.id, { status: "skipped" });
    return "other";
  }

  const { count: suppressed } = await db
    .from("suppression_entries").select("id", { count: "exact", head: true })
    .eq("email", contact.email.toLowerCase()).or(`workspace_id.is.null,workspace_id.eq.${ws.id}`);
  if (suppressed) {
    await setSend(db, send.id, { status: "skipped" });
    return "other";
  }

  // Daily limit: defer to the next UTC day instead of failing.
  const sentToday = await cached(caches.sentToday, ws.id, async () =>
    (await db.from("sends").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).gte("sent_at", startOfUtcDay().toISOString())).count ?? 0);
  if (sentToday >= ws.daily_send_limit) {
    const tomorrow = new Date(startOfUtcDay().getTime() + 24 * 3600 * 1000);
    await setSend(db, send.id, { status: "queued", run_at: tomorrow.toISOString(), attempts: Math.max(0, send.attempts - 1) });
    return "other";
  }

  try {
    const email = buildEmail({ campaign: campaign as any, workspace: ws as any, contact: contact as any, sendId: send.id });
    const { messageId } = await provider.send(email);
    await setSend(db, send.id, { status: "sent", provider_message_id: messageId, sent_at: new Date().toISOString(), last_error: null });
    caches.sentToday.set(ws.id, sentToday + 1);
    return "sent";
  } catch (err) {
    const message = (err as Error).message?.slice(0, 500) ?? "Unknown error";
    if (err instanceof PermanentSendError || send.attempts >= MAX_ATTEMPTS) {
      await setSend(db, send.id, { status: "failed", last_error: message });
      return "failed";
    }
    const retryAt = new Date(Date.now() + Math.pow(2, send.attempts) * 60 * 1000);
    await setSend(db, send.id, { status: "queued", run_at: retryAt.toISOString(), last_error: message });
    return "failed";
  }
}

async function finalizeCampaigns(db: Db): Promise<void> {
  const { data: sending } = await db.from("campaigns").select("id, workspace_id").eq("status", "sending");
  for (const c of sending ?? []) {
    const { count } = await db.from("sends").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).in("status", ["queued", "sending"]);
    if (count === 0) {
      await db.from("campaigns").update({ status: "sent", completed_at: new Date().toISOString() }).eq("id", c.id).eq("status", "sending");
      await maybeRaiseLimit(db, c.workspace_id, c.id);
    }
  }
}

/** One pass of the delivery engine. Safe to call repeatedly and from several processes. */
export async function runTick(opts: { budgetMs?: number } = {}): Promise<{ activated: number; sent: number; failed: number }> {
  const db = createAdminClient();
  const provider = getProvider();
  const budget = opts.budgetMs ?? 20000;
  const started = Date.now();
  const settings = await loadSettings(db);

  await db.rpc("release_stuck_sends");
  const activated = await activateScheduled(db);

  const caches: Caches = { campaigns: new Map(), workspaces: new Map(), sentToday: new Map() };
  const delay = 1000 / serverEnv.sending.ratePerSecond;
  let sent = 0;
  let failed = 0;

  while (Date.now() - started < budget) {
    const { data: batch } = await db.rpc("claim_sends", { batch_size: 25 });
    const rows = (batch ?? []) as Row[];
    if (rows.length === 0) break;

    for (let i = 0; i < rows.length; i++) {
      if (Date.now() - started >= budget) {
        // Out of time: hand the rest back to the queue immediately.
        const rest = rows.slice(i).map((r) => r.id);
        await db.from("sends").update({ status: "queued", locked_at: null, attempts: 0 }).in("id", rest);
        break;
      }
      const result = await processSend(db, provider, rows[i], caches);
      if (result === "sent") sent++;
      if (result === "failed") failed++;
      if (result === "sent") await sleep(delay);
    }
  }

  await finalizeCampaigns(db);
  await evaluateHealth(db, settings);
  return { activated, sent, failed };
}
