/** Shape returned by Krystal GET /v1/pools (simplified to what we use) */
export interface KrystalPool {
  address: string;
  chainId: string;
  protocol: string;
  token0: TokenInfo;
  token1: TokenInfo;
  feeTier: number;       // basis points (10_000 = 1%)
  tvlUsd: number;
  volume24hUsd: number;
  apr24h?: number;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

/** A pool that passed all filters, enriched with ranking score */
export interface RankedPool extends KrystalPool {
  volTvlRatio: number;
  /** The non-base token in the pair */
  targetToken: TokenInfo;
  /** The base asset (USDG/WETH/ETH) */
  baseToken: TokenInfo;
}

/** OHLCV candle from GeckoTerminal */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Result of pattern analysis */
export interface PatternResult {
  match: boolean;
  reason: string;
  /** Price of the detected local high */
  localHigh?: number;
  /** Current retrace % from high */
  retracePct?: number;
  /** Average volume ratio during consolidation vs trailing avg */
  volRatio?: number;
}
