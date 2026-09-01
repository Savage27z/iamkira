/**
 * Krystal Cloud API client — scans concentrated-liquidity pools on Robinhood Chain.
 *
 * Docs: https://cloud-api.krystal.app/swagger/index.html
 * Auth: KC-APIKey header (get your key at https://cloud.krystal.app)
 *
 * Response shape (per pool):
 *   poolAddress, feeTier, tvl,
 *   token0: { token: { address, symbol, name, decimals } },
 *   token1: { token: { address, symbol, name, decimals } },
 *   stats24h: { volume, fee, apr }
 */

import {
  KRYSTAL_BASE_URL,
  KRYSTAL_AUTH_HEADER,
  KRYSTAL_CHAIN_ID,
  KRYSTAL_PROTOCOLS,
} from "./config.js";
import { fetchWithBackoff, recordKrystalCall } from "./rateLimit.js";
import type { KrystalPool } from "./types.js";

/**
 * Fetch all pools from Krystal for our chain + protocol combos.
 * Returns raw pool data; filtering happens in filters.ts.
 */
export async function fetchPools(): Promise<KrystalPool[]> {
  const apiKey = process.env.KRYSTAL_API_KEY;
  if (!apiKey) throw new Error("KRYSTAL_API_KEY is not set");

  const pools: KrystalPool[] = [];

  for (const protocol of KRYSTAL_PROTOCOLS) {
    // Budget check — skip if we've blown through our credits
    if (!recordKrystalCall()) {
      console.warn("[krystal] Skipping call due to budget exhaustion");
      return pools;
    }

    const url = new URL(`${KRYSTAL_BASE_URL}/v1/pools`);
    url.searchParams.set("chainId", String(KRYSTAL_CHAIN_ID));
    url.searchParams.set("protocol", protocol);
    url.searchParams.set("sortBy", "2");          // 2 = Volume24h
    url.searchParams.set("minTvl", "1000");
    url.searchParams.set("minVolume24h", "1000");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", "0");

    try {
      const res = await fetchWithBackoff(url.toString(), {
        headers: { [KRYSTAL_AUTH_HEADER]: apiKey },
      });

      if (res.status === 402) {
        console.error("[krystal] 402 — no credits left. Top up at https://cloud.krystal.app");
        return pools;
      }

      if (!res.ok) {
        console.error(
          `[krystal] ${res.status} ${res.statusText} for chain ${KRYSTAL_CHAIN_ID}/${protocol}`
        );
        continue;
      }

      // Cloud API returns a flat array of pool objects (not wrapped in { data: { pools } })
      const body = await res.json();
      const raw: unknown[] = Array.isArray(body) ? body : (body?.data?.pools ?? body?.data ?? []);

      for (const p of raw) {
        const pool = normalizePool(p, String(KRYSTAL_CHAIN_ID), protocol);
        if (pool) pools.push(pool);
      }

      console.log(
        `[krystal] chain ${KRYSTAL_CHAIN_ID}/${protocol}: ${raw.length} pools fetched`
      );
    } catch (err) {
      console.error(`[krystal] Error fetching chain ${KRYSTAL_CHAIN_ID}/${protocol}:`, err);
    }
  }

  return pools;
}

/**
 * Normalise Krystal Cloud API pool response into our type.
 *
 * Actual shape:
 *   { poolAddress, feeTier, tvl,
 *     token0: { token: { address, symbol, name, decimals } },
 *     token1: { token: { address, symbol, name, decimals } },
 *     stats24h: { volume, fee, apr } }
 */
function normalizePool(
  raw: unknown,
  chainId: string,
  protocol: string,
): KrystalPool | null {
  try {
    const r = raw as Record<string, unknown>;

    // Tokens are nested: token0.token.address (not token0.address)
    const t0wrapper = r.token0 as Record<string, unknown> | undefined;
    const t1wrapper = r.token1 as Record<string, unknown> | undefined;
    const t0 = (t0wrapper?.token ?? t0wrapper) as Record<string, unknown> | undefined;
    const t1 = (t1wrapper?.token ?? t1wrapper) as Record<string, unknown> | undefined;
    if (!t0 || !t1) return null;

    // Stats are nested: stats24h.volume, stats24h.apr
    const stats24h = (r.stats24h ?? {}) as Record<string, unknown>;

    return {
      address: String(r.poolAddress ?? r.address ?? ""),
      chainId,
      protocol,
      token0: {
        address: String(t0.address ?? "").toLowerCase(),
        symbol: String(t0.symbol ?? "???"),
        name: String(t0.name ?? ""),
        decimals: Number(t0.decimals ?? 18),
      },
      token1: {
        address: String(t1.address ?? "").toLowerCase(),
        symbol: String(t1.symbol ?? "???"),
        name: String(t1.name ?? ""),
        decimals: Number(t1.decimals ?? 18),
      },
      feeTier: Number(r.feeTier ?? r.fee ?? 0),
      tvlUsd: Number(r.tvl ?? r.tvlUsd ?? 0),
      volume24hUsd: Number(stats24h.volume ?? r.volume24hUsd ?? 0),
      apr24h: stats24h.apr != null ? Number(stats24h.apr) : undefined,
    };
  } catch {
    return null;
  }
}
