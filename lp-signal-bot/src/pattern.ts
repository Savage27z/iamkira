/**
 * Task 1 — Pattern detection using Krystal's pool historical data.
 *
 * GeckoTerminal doesn't support Robinhood Chain, so we use Krystal's own
 * GET /v1/pools/{chainId}/{poolAddress}/historical endpoint which returns
 * hourly snapshots with poolPrice and volume24h.
 *
 * Detects the "pump → retrace → base" setup:
 *   1. Find a local high within the lookback window.
 *   2. Price has retraced RETRACE_MIN_PCT..RETRACE_MAX_PCT from that high.
 *   3. The last CONSOLIDATION_WINDOW snapshots are in a tight price range.
 *   4. Volume during consolidation is still elevated vs the trailing average.
 */

import {
  KRYSTAL_BASE_URL,
  KRYSTAL_AUTH_HEADER,
  KRYSTAL_CHAIN_ID,
  RETRACE_MIN_PCT,
  RETRACE_MAX_PCT,
  LOOKBACK_CANDLES,
  CONSOLIDATION_WINDOW,
  CONSOLIDATION_MAX_RANGE_PCT,
  CONSOLIDATION_MIN_VOL_RATIO,
} from "./config.js";
import { fetchWithBackoff } from "./rateLimit.js";
import type { Candle, PatternResult } from "./types.js";

// ── Krystal historical data fetching ──────────────────────────────

interface KrystalSnapshot {
  timestamp: number;
  poolPrice: number;
  volume24h: number;
  tvlUsd: number;
}

/**
 * Fetch hourly price/volume snapshots from Krystal's historical endpoint.
 */
export async function fetchCandles(
  poolAddress: string,
  limit = LOOKBACK_CANDLES,
): Promise<Candle[]> {
  const apiKey = process.env.KRYSTAL_API_KEY;
  if (!apiKey) return [];

  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - limit * 3600; // 1 hour per snapshot

  const url =
    `${KRYSTAL_BASE_URL}/v1/pools/${KRYSTAL_CHAIN_ID}/${poolAddress}/historical` +
    `?startTime=${startTime}&endTime=${endTime}`;

  const res = await fetchWithBackoff(url, {
    headers: { [KRYSTAL_AUTH_HEADER]: apiKey },
  });

  if (!res.ok) {
    console.error(
      `[pattern] Krystal historical ${res.status} for pool ${poolAddress}`
    );
    return [];
  }

  const body = await res.json();
  const raw: KrystalSnapshot[] = Array.isArray(body) ? body : (body?.data ?? []);

  if (raw.length === 0) return [];

  // Krystal returns newest-first — reverse to chronological
  const sorted = [...raw].sort((a, b) => a.timestamp - b.timestamp);

  // Convert to Candle shape — we only have poolPrice per snapshot,
  // so open/high/low/close are all the same price (close).
  // The pattern analyser uses high/low for range checks, so we set
  // them from adjacent prices to approximate intra-hour range.
  return sorted.map((s, i): Candle => {
    const prev = i > 0 ? sorted[i - 1].poolPrice : s.poolPrice;
    const next = i < sorted.length - 1 ? sorted[i + 1].poolPrice : s.poolPrice;
    const prices = [prev, s.poolPrice, next];
    return {
      timestamp: s.timestamp,
      open: prev,
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: s.poolPrice,
      volume: s.volume24h,
    };
  });
}

// ── Pattern analysis (pure — testable with injected candles) ───────

/**
 * Analyse a chronologically-ordered array of candles for the
 * "pumped → retraced → basing with volume" pattern.
 */
export function analysePattern(candles: Candle[]): PatternResult {
  if (candles.length < CONSOLIDATION_WINDOW + 2) {
    return { match: false, reason: "Not enough candle data" };
  }

  // 1. Find the local high (highest candle high in the lookback window)
  let localHigh = -Infinity;
  for (const c of candles) {
    if (c.high > localHigh) localHigh = c.high;
  }

  if (localHigh <= 0) {
    return { match: false, reason: "No valid price data" };
  }

  // 2. Current price = close of the most recent candle
  const currentPrice = candles[candles.length - 1].close;
  const retracePct = (localHigh - currentPrice) / localHigh;

  if (retracePct < RETRACE_MIN_PCT) {
    return {
      match: false,
      reason: `Retrace ${(retracePct * 100).toFixed(1)}% < min ${(RETRACE_MIN_PCT * 100).toFixed(0)}% — still near high, not basing yet`,
      localHigh,
      retracePct,
    };
  }

  if (retracePct > RETRACE_MAX_PCT) {
    return {
      match: false,
      reason: `Retrace ${(retracePct * 100).toFixed(1)}% > max ${(RETRACE_MAX_PCT * 100).toFixed(0)}% — still crashing`,
      localHigh,
      retracePct,
    };
  }

  // 3. Consolidation check: last N candles should be in a tight range
  const tail = candles.slice(-CONSOLIDATION_WINDOW);
  const tailHighs = tail.map((c) => c.high);
  const tailLows = tail.map((c) => c.low);
  const rangeHigh = Math.max(...tailHighs);
  const rangeLow = Math.min(...tailLows);
  const rangeMid = (rangeHigh + rangeLow) / 2;
  const rangeSpread = rangeMid > 0 ? (rangeHigh - rangeLow) / rangeMid : 1;

  if (rangeSpread > CONSOLIDATION_MAX_RANGE_PCT) {
    return {
      match: false,
      reason: `Consolidation range ${(rangeSpread * 100).toFixed(1)}% > max ${(CONSOLIDATION_MAX_RANGE_PCT * 100).toFixed(0)}% — price not stable`,
      localHigh,
      retracePct,
    };
  }

  // 4. Volume check: consolidation volume vs trailing average
  const trailingVolumes = candles.map((c) => c.volume);
  const trailingAvg =
    trailingVolumes.reduce((s, v) => s + v, 0) / trailingVolumes.length;

  const consolVolumes = tail.map((c) => c.volume);
  const consolAvg =
    consolVolumes.reduce((s, v) => s + v, 0) / consolVolumes.length;

  const volRatio = trailingAvg > 0 ? consolAvg / trailingAvg : 0;

  if (volRatio < CONSOLIDATION_MIN_VOL_RATIO) {
    return {
      match: false,
      reason: `Volume ratio ${volRatio.toFixed(2)} < min ${CONSOLIDATION_MIN_VOL_RATIO} — volume dried up`,
      localHigh,
      retracePct,
      volRatio,
    };
  }

  // ✅ All checks pass
  return {
    match: true,
    reason: `Pump→retrace→base detected: ${(retracePct * 100).toFixed(1)}% off high, consolidating with ${volRatio.toFixed(2)}x avg volume`,
    localHigh,
    retracePct,
    volRatio,
  };
}

/**
 * Full pipeline: fetch candles then analyse.
 * Returns a non-match (with reason) on fetch failure so the poll loop continues.
 */
export async function checkPattern(poolAddress: string): Promise<PatternResult> {
  try {
    const candles = await fetchCandles(poolAddress);
    if (candles.length === 0) {
      return { match: false, reason: "Could not fetch historical data" };
    }
    return analysePattern(candles);
  } catch (err) {
    console.error(`[pattern] Error checking ${poolAddress}:`, err);
    return { match: false, reason: "Pattern check error" };
  }
}
