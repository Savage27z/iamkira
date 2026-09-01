/**
 * Task 2 — SQLite persistence for alerted pools.
 * Uses sql.js (pure JS/WASM — no native compilation needed).
 * Replaces the in-memory Set so de-dupe state survives restarts.
 */

import initSqlJs, { type Database } from "sql.js";
import path from "node:path";
import fs from "node:fs";
import { DEALERT_WINDOW_MS } from "./config.js";
import { runtimeConfig } from "./runtimeConfig.js";

let db: Database;
let dbPath: string;

export async function initDb(customPath?: string): Promise<void> {
  dbPath = customPath ?? process.env.DB_PATH ?? "./data/alerts.db";
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs();

  // Load existing DB file if present
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS alerted_pools (
      pool_address TEXT PRIMARY KEY,
      target_symbol TEXT NOT NULL,
      base_symbol TEXT NOT NULL,
      alerted_at INTEGER NOT NULL
    )
  `);

  // Clean up old entries on startup
  pruneOld();
  persist();
}

/** Check if we've already alerted on this pool within the de-alert window */
export function wasAlerted(poolAddress: string): boolean {
  const cutoff = Date.now() - runtimeConfig.dealertWindowMs;
  const stmt = db.prepare(
    "SELECT 1 FROM alerted_pools WHERE pool_address = ? AND alerted_at > ?"
  );
  stmt.bind([poolAddress, cutoff]);
  const hasRow = stmt.step();
  stmt.free();
  return hasRow;
}

/** Record that we alerted on a pool */
export function markAlerted(
  poolAddress: string,
  targetSymbol: string,
  baseSymbol: string,
): void {
  db.run(
    `INSERT OR REPLACE INTO alerted_pools (pool_address, target_symbol, base_symbol, alerted_at)
     VALUES (?, ?, ?, ?)`,
    [poolAddress, targetSymbol, baseSymbol, Date.now()]
  );
  persist();
}

/** Remove entries older than DEALERT_WINDOW_MS */
function pruneOld(): void {
  const cutoff = Date.now() - DEALERT_WINDOW_MS;
  db.run("DELETE FROM alerted_pools WHERE alerted_at <= ?", [cutoff]);
  const changes = db.getRowsModified();
  if (changes > 0) {
    console.log(`[db] Pruned ${changes} stale alert records`);
  }
}

/** Write the in-memory DB to disk */
function persist(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

export function closeDb(): void {
  if (db) {
    persist();
    db.close();
  }
}
