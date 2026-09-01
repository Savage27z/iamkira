/**
 * Pool filtering & ranking.
 * Only keeps pools paired against BASE_ASSETS with fee ≥ 1%,
 * then ranks by vol/TVL ratio (the real APR driver).
 */

import {
  BASE_ASSETS,
  MIN_TVL_USD,
  MIN_VOLUME_24H_USD,
} from "./config.js";
import { runtimeConfig } from "./runtimeConfig.js";
import type { KrystalPool, RankedPool } from "./types.js";

/**
 * Filter pools to our strategy criteria, then sort by vol/TVL descending.
 */
export function filterAndRank(pools: KrystalPool[]): RankedPool[] {
  const candidates: RankedPool[] = [];

  for (const pool of pools) {
    // ── Base-asset check: one side must be USDG, WETH, or ETH ──
    const t0addr = pool.token0.address.toLowerCase();
    const t1addr = pool.token1.address.toLowerCase();

    const t0isBase = BASE_ASSETS.has(t0addr);
    const t1isBase = BASE_ASSETS.has(t1addr);

    // Skip if neither token is a base asset, or if both are (e.g. ETH/USDG — no "target")
    if (!t0isBase && !t1isBase) continue;
    if (t0isBase && t1isBase) continue;

    const targetToken = t0isBase ? pool.token1 : pool.token0;
    const baseToken = t0isBase ? pool.token0 : pool.token1;

    // ── Fee tier ≥ min (adjustable via /setfee) ──
    if (pool.feeTier < runtimeConfig.minFeeBps) continue;

    // ── TVL floor ──
    if (pool.tvlUsd < MIN_TVL_USD) continue;

    // ── Volume floor ──
    if (pool.volume24hUsd < MIN_VOLUME_24H_USD) continue;

    // ── Rank metric: vol/TVL ──
    const volTvlRatio = pool.tvlUsd > 0 ? pool.volume24hUsd / pool.tvlUsd : 0;

    candidates.push({
      ...pool,
      volTvlRatio,
      targetToken,
      baseToken,
    });
  }

  // Sort descending by vol/TVL ratio
  candidates.sort((a, b) => b.volTvlRatio - a.volTvlRatio);

  return candidates;
}
