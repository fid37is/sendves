/**
 * Long-running sending worker.  Start with:  npm run worker
 * Alternative for serverless hosting: call GET /api/cron/tick every minute (see INSTALL).
 */
import { runTick } from "@/server/sending/process";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let running = true;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`\n[worker] ${signal} received, finishing the current pass…`);
    running = false;
  });
}

async function main() {
  console.log("[worker] Sendves delivery worker started");
  while (running) {
    let busy = false;
    try {
      const r = await runTick({ budgetMs: 20000 });
      busy = r.sent > 0 || r.activated > 0;
      if (busy) console.log(`[worker] activated=${r.activated} sent=${r.sent} failed=${r.failed}`);
    } catch (err) {
      console.error("[worker] tick failed:", (err as Error).message);
    }
    await sleep(busy ? 500 : 5000);
  }
  console.log("[worker] stopped");
}

main();
