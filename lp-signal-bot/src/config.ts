/**
 * Centralised config — all tunable thresholds live here.
 * Edit this file (or override via env) instead of touching logic files.
 */

// ── Chain constants (Robinhood Chain) ──────────────────────────────
export const CHAIN_ID = 4663;
export const NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73".toLowerCase();
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168".toLowerCase();

/** Addresses we'll LP against — lowercase for comparison */
export const BASE_ASSETS = new Set([NATIVE_ETH, WETH, USDG]);

// ── Krystal Cloud API ──────────────────────────────────────────────
export const KRYSTAL_BASE_URL = "https://cloud-api.krystal.app";
/** Auth header name (value comes from KRYSTAL_API_KEY env var) */
export const KRYSTAL_AUTH_HEADER = "KC-APIKey";
/** Krystal uses numeric chainId for the query param */
export const KRYSTAL_CHAIN_ID = CHAIN_ID;
export const KRYSTAL_PROTOCOLS = ["uniswapV3"] as const;

// ── Pool filters ───────────────────────────────────────────────────
/** Minimum fee tier in basis points (10_000 = 1%). Pools below this are excluded. */
export const MIN_FEE_BPS = 10_000;
/** Minimum TVL in USD to consider a pool */
export const MIN_TVL_USD = 5_000;
/** Minimum 24h volume in USD */
export const MIN_VOLUME_24H_USD = 1_000;

// ── Pattern detection (OHLC candle analysis) ───────────────────────
/** Minimum retrace from recent local high (e.g. 0.15 = 15% pullback) */
export const RETRACE_MIN_PCT = 0.15;
/** Maximum retrace — if it's dumped more than this it's still crashing */
export const RETRACE_MAX_PCT = 0.60;
/** Number of recent candles to look for the local high */
export const LOOKBACK_CANDLES = 48;
/** Number of recent candles that must be "consolidating" (tight range) */
export const CONSOLIDATION_WINDOW = 6;
/** Max allowed range (high-low)/mid within consolidation candles (e.g. 0.08 = 8%) */
export const CONSOLIDATION_MAX_RANGE_PCT = 0.08;
/**
 * Volume during consolidation must be at least this fraction of the
 * trailing average volume over the lookback window. (1.0 = at least average)
 */
export const CONSOLIDATION_MIN_VOL_RATIO = 0.7;

// ── Range suggestion (shown in alerts) ─────────────────────────────
export const RANGE_UPSIDE_PCT = 100;   // +100% max
export const RANGE_DOWNSIDE_PCT = 2;   //  -2%  min

// ── Rate limiting (Krystal free tier) ──────────────────────────────
/** Monthly unit budget */
export const KRYSTAL_MONTHLY_BUDGET = 50_000;
/** Units consumed per /v1/pools call */
export const KRYSTAL_UNITS_PER_CALL = 10;
/** Warn when remaining budget drops below this */
export const KRYSTAL_BUDGET_WARN_THRESHOLD = 5_000;

// ── DexScreener / GeckoTerminal ────────────────────────────────────
export const DEXSCREENER_CHAIN_SLUG = "robinhood";
export const GECKO_TERMINAL_BASE = "https://api.geckoterminal.com/api/v2";
/** GeckoTerminal network identifier — typically same as DexScreener slug */
export const GECKO_NETWORK = "robinhood-chain";

// ── Poll loop ──────────────────────────────────────────────────────
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 300_000;
/** Don't re-alert on the same pool within this window (ms). Default 24h. */
export const DEALERT_WINDOW_MS = 24 * 60 * 60 * 1000;
