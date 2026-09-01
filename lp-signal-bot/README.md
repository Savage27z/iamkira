# LP Signal Bot

Krystal DeFi concentrated-liquidity scanner for **Robinhood Chain** (Chain ID 4663).  
**Alert-only** — surfaces LP candidates for manual review. No wallet interaction.

## What it does

1. **Scans** Uniswap V3 pools on Robinhood Chain via the Krystal Cloud API
2. **Filters** to pools paired against USDG/WETH/ETH with fee ≥ 1%
3. **Ranks** by vol/TVL ratio (the real APR driver)
4. **Pattern-checks** each candidate via OHLC candles (GeckoTerminal): looks for the "pumped → retraced → basing with volume" setup
5. **Alerts** via Telegram (and optionally Discord) with links to Bubblemaps + GMGN for manual holder/activity checks

## Setup

```bash
cd lp-signal-bot
npm install
cp .env.example .env
# Fill in KRYSTAL_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
# Optionally set DISCORD_WEBHOOK_URL for Discord alerts
```

## Run

```bash
npm run dev      # dev mode (tsx, no build step)
npm run build    # compile to dist/
npm start        # run compiled output
```

## Tests

```bash
npm test         # run once
npm run test:watch  # watch mode
```

## Configuration

All tunable thresholds live in [`src/config.ts`](src/config.ts):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MIN_FEE_BPS` | 10,000 (1%) | Minimum pool fee tier |
| `MIN_TVL_USD` | $5,000 | TVL floor |
| `MIN_VOLUME_24H_USD` | $1,000 | 24h volume floor |
| `RETRACE_MIN_PCT` | 15% | Min retrace from local high |
| `RETRACE_MAX_PCT` | 60% | Max retrace (beyond = still crashing) |
| `CONSOLIDATION_WINDOW` | 6 candles | How many recent candles must be "tight" |
| `CONSOLIDATION_MAX_RANGE_PCT` | 8% | Max price spread in consolidation |
| `CONSOLIDATION_MIN_VOL_RATIO` | 0.7x | Min vol vs trailing avg during consolidation |
| `RANGE_UPSIDE_PCT` | +100% | Suggested LP range (upside) |
| `RANGE_DOWNSIDE_PCT` | -2% | Suggested LP range (downside) |
| `DEALERT_WINDOW_MS` | 24h | Don't re-alert same pool within this window |

## Architecture

```
src/
├── config.ts      ← all thresholds, chain constants, API config
├── types.ts       ← shared TypeScript types
├── krystal.ts     ← Krystal Cloud API client
├── filters.ts     ← base-asset filter, fee/TVL/volume gates, vol/TVL ranking
├── pattern.ts     ← OHLC candle analysis (pump→retrace→base detection)
├── telegram.ts    ← Telegram alert sender
├── discord.ts     ← Discord webhook sender (optional)
├── db.ts          ← SQLite persistence for alert de-dupe
├── rateLimit.ts   ← Krystal budget tracker + 429 back-off
└── index.ts       ← poll loop orchestrator
```

## Rate Limits

- **Krystal free tier**: 50,000 units/month @ 10 units per `/v1/pools` call. The bot tracks usage and warns as you approach the cap; it stops calling once exhausted.
- **GeckoTerminal**: Free tier, rate-limited. 429s are retried with exponential back-off.
- **DexScreener**: Not called directly in this version (pattern detection moved to GeckoTerminal OHLCV).

## Persistence

Alert de-dupe state is stored in SQLite (`data/alerts.db` by default, configurable via `DB_PATH` env var). Survives restarts. Old entries are pruned automatically.
