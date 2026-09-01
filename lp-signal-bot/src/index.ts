/**
 * Main poll loop — scan → filter → pattern check → alert.
 */

import { POLL_INTERVAL_MS } from "./config.js";
import { fetchPools } from "./krystal.js";
import { filterAndRank } from "./filters.js";
import { checkPattern } from "./pattern.js";
import { sendTelegramAlert } from "./telegram.js";
import { sendDiscordAlert } from "./discord.js";
import { initDb, wasAlerted, markAlerted, closeDb } from "./db.js";
import { getKrystalBudgetRemaining } from "./rateLimit.js";

async function pollCycle(): Promise<void> {
  console.log(
    `\n[poll] Starting scan — ${new Date().toISOString()} | Krystal budget: ${getKrystalBudgetRemaining()} units remaining`
  );

  // 1. Fetch raw pools from Krystal
  const rawPools = await fetchPools();
  console.log(`[poll] Fetched ${rawPools.length} raw pools`);

  // 2. Filter & rank
  const candidates = filterAndRank(rawPools);
  console.log(`[poll] ${candidates.length} candidates after filtering`);

  // 3. Check each candidate for pattern match + de-dupe
  let alertCount = 0;
  for (const pool of candidates) {
    // Skip if already alerted recently
    if (wasAlerted(pool.address)) continue;

    // Pattern check (OHLC candle analysis via GeckoTerminal)
    const pattern = await checkPattern(pool.address);
    if (!pattern.match) {
      console.log(
        `[poll] ${pool.targetToken.symbol}/${pool.baseToken.symbol}: no pattern — ${pattern.reason}`
      );
      continue;
    }

    // 🔔 Alert!
    console.log(
      `[poll] ✅ SIGNAL: ${pool.targetToken.symbol}/${pool.baseToken.symbol} — ${pattern.reason}`
    );

    await sendTelegramAlert(pool, pattern);
    await sendDiscordAlert(pool, pattern);

    markAlerted(
      pool.address,
      pool.targetToken.symbol,
      pool.baseToken.symbol,
    );
    alertCount++;
  }

  console.log(
    `[poll] Cycle complete — ${alertCount} new alert(s) sent, ${candidates.length - alertCount} skipped`
  );
}

async function main(): Promise<void> {
  console.log("🚀 LP Signal Bot starting...");
  console.log(`   Chain: Robinhood (4663)`);
  console.log(`   Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`   Discord: ${process.env.DISCORD_WEBHOOK_URL ? "enabled" : "disabled (no webhook URL)"}`);

  // Init SQLite (async — sql.js loads WASM)
  await initDb();

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n🛑 Shutting down...");
    closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Initial run + loop
  while (true) {
    try {
      await pollCycle();
    } catch (err) {
      console.error("[poll] Unhandled error in poll cycle:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main();
