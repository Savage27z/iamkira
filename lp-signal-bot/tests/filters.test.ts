import { describe, it, expect } from "vitest";
import { filterAndRank } from "../src/filters.js";
import type { KrystalPool } from "../src/types.js";
import { WETH, USDG, NATIVE_ETH } from "../src/config.js";

/** Helper to build a mock pool */
function mockPool(overrides: Partial<KrystalPool> & {
  t0addr?: string; t0sym?: string;
  t1addr?: string; t1sym?: string;
}): KrystalPool {
  return {
    address: overrides.address ?? "0xpool1",
    chainId: "robinhood@4663",
    protocol: "uniswapv3",
    token0: {
      address: overrides.t0addr ?? "0xtoken_abc",
      symbol: overrides.t0sym ?? "ABC",
      name: "Token ABC",
      decimals: 18,
    },
    token1: {
      address: overrides.t1addr ?? WETH,
      symbol: overrides.t1sym ?? "WETH",
      name: "Wrapped Ether",
      decimals: 18,
    },
    feeTier: overrides.feeTier ?? 10_000,
    tvlUsd: overrides.tvlUsd ?? 50_000,
    volume24hUsd: overrides.volume24hUsd ?? 20_000,
    apr24h: overrides.apr24h,
  };
}

describe("filterAndRank", () => {
  it("keeps pools paired against WETH with fee ≥ 1%", () => {
    const pools = [mockPool({ t1addr: WETH })];
    const result = filterAndRank(pools);
    expect(result).toHaveLength(1);
    expect(result[0].targetToken.symbol).toBe("ABC");
    expect(result[0].baseToken.address).toBe(WETH);
  });

  it("keeps pools paired against USDG", () => {
    const pools = [mockPool({ t1addr: USDG, t1sym: "USDG" })];
    const result = filterAndRank(pools);
    expect(result).toHaveLength(1);
    expect(result[0].baseToken.address).toBe(USDG);
  });

  it("keeps pools paired against native ETH", () => {
    const pools = [mockPool({ t1addr: NATIVE_ETH, t1sym: "ETH" })];
    const result = filterAndRank(pools);
    expect(result).toHaveLength(1);
  });

  it("rejects pools with no base asset", () => {
    const pools = [mockPool({ t0addr: "0xrandom1", t1addr: "0xrandom2" })];
    expect(filterAndRank(pools)).toHaveLength(0);
  });

  it("rejects pools where both tokens are base assets (e.g. ETH/USDG)", () => {
    const pools = [mockPool({ t0addr: WETH, t0sym: "WETH", t1addr: USDG, t1sym: "USDG" })];
    expect(filterAndRank(pools)).toHaveLength(0);
  });

  it("rejects pools with fee < 1% (below 10_000 bps)", () => {
    const pools = [mockPool({ feeTier: 3_000 })];
    expect(filterAndRank(pools)).toHaveLength(0);
  });

  it("rejects pools below TVL floor", () => {
    const pools = [mockPool({ tvlUsd: 100 })];
    expect(filterAndRank(pools)).toHaveLength(0);
  });

  it("rejects pools below volume floor", () => {
    const pools = [mockPool({ volume24hUsd: 50 })];
    expect(filterAndRank(pools)).toHaveLength(0);
  });

  it("ranks by vol/TVL ratio descending", () => {
    const pools = [
      mockPool({ address: "0xa", volume24hUsd: 10_000, tvlUsd: 100_000 }), // 0.1
      mockPool({ address: "0xb", volume24hUsd: 50_000, tvlUsd: 50_000 }),  // 1.0
      mockPool({ address: "0xc", volume24hUsd: 30_000, tvlUsd: 20_000 }), // 1.5
    ];
    const result = filterAndRank(pools);
    expect(result).toHaveLength(3);
    expect(result[0].address).toBe("0xc"); // 1.5
    expect(result[1].address).toBe("0xb"); // 1.0
    expect(result[2].address).toBe("0xa"); // 0.1
  });

  it("computes volTvlRatio correctly", () => {
    const pools = [mockPool({ volume24hUsd: 25_000, tvlUsd: 50_000 })];
    const result = filterAndRank(pools);
    expect(result[0].volTvlRatio).toBeCloseTo(0.5);
  });
});
