/**
 * Task 3 — Discord webhook sender.
 * Same alert content as Telegram, sent to a Discord channel via webhook.
 * Skipped entirely if DISCORD_WEBHOOK_URL is unset.
 */

import { DEXSCREENER_CHAIN_SLUG, RANGE_UPSIDE_PCT, RANGE_DOWNSIDE_PCT } from "./config.js";
import { fetchWithBackoff } from "./rateLimit.js";
import type { RankedPool, PatternResult } from "./types.js";

/**
 * Format as a Discord embed (rich card).
 * Discord uses Markdown, not HTML — different format from Telegram.
 */
function buildEmbed(pool: RankedPool, pattern: PatternResult) {
  const target = pool.targetToken;
  const base = pool.baseToken;
  const fee = (pool.feeTier / 10_000).toFixed(2);

  const dexScreenerUrl = `https://dexscreener.com/${DEXSCREENER_CHAIN_SLUG}/${pool.address}`;
  const bubblemapsUrl = `https://app.bubblemaps.io/eth/token/${target.address}`;
  const gmgnUrl = `https://gmgn.ai/sol/token/${target.address}`;

  return {
    embeds: [
      {
        title: `🔔 LP Signal: ${target.symbol}/${base.symbol} (${fee}%)`,
        url: dexScreenerUrl,
        color: 0x00c853, // green
        fields: [
          {
            name: "📊 Pool Stats",
            value: `TVL: $${fmtNum(pool.tvlUsd)} | Vol 24h: $${fmtNum(pool.volume24hUsd)}\nVol/TVL: ${pool.volTvlRatio.toFixed(2)}${pool.apr24h != null ? ` | APR: ${pool.apr24h.toFixed(1)}%` : ""}`,
          },
          {
            name: "🧠 Pattern",
            value: pattern.reason + (pattern.retracePct != null
              ? `\nRetrace: ${(pattern.retracePct * 100).toFixed(1)}% from local high`
              : ""),
          },
          {
            name: "📐 Suggested Range",
            value: `+${RANGE_UPSIDE_PCT}% / -${RANGE_DOWNSIDE_PCT}%`,
            inline: true,
          },
          {
            name: "🔍 Manual Checks",
            value: `[Bubblemaps](${bubblemapsUrl}) — holder clustering\n[GMGN](${gmgnUrl}) — trading patterns`,
          },
        ],
        footer: {
          text: "⚠️ DYOR — signal only, not advice",
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export async function sendDiscordAlert(
  pool: RankedPool,
  pattern: PatternResult,
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return; // silently skip

  const payload = buildEmbed(pool, pattern);

  try {
    const res = await fetchWithBackoff(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[discord] Webhook failed ${res.status}: ${body}`);
    } else {
      console.log(
        `[discord] Alert sent for ${pool.targetToken.symbol}/${pool.baseToken.symbol}`
      );
    }
  } catch (err) {
    console.error("[discord] Webhook error:", err);
  }
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
