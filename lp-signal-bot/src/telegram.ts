/**
 * Telegram alert sender.
 * Formats the candidate pool into a message with links to
 * Bubblemaps + GMGN for manual holder/pattern review.
 */

import { DEXSCREENER_CHAIN_SLUG, RANGE_UPSIDE_PCT, RANGE_DOWNSIDE_PCT } from "./config.js";
import { fetchWithBackoff } from "./rateLimit.js";
import type { RankedPool, PatternResult } from "./types.js";

const TG_API = "https://api.telegram.org";

export function formatAlert(pool: RankedPool, pattern: PatternResult): string {
  const target = pool.targetToken;
  const base = pool.baseToken;
  const fee = (pool.feeTier / 10_000).toFixed(2);

  const dexScreenerUrl = `https://dexscreener.com/${DEXSCREENER_CHAIN_SLUG}/${pool.address}`;
  const bubblemapsUrl = `https://app.bubblemaps.io/eth/token/${target.address}`;
  const gmgnUrl = `https://gmgn.ai/sol/token/${target.address}`;

  const lines = [
    `🔔 <b>LP Signal: ${target.symbol}/${base.symbol}</b>`,
    ``,
    `📊 <b>Pool:</b> <a href="${dexScreenerUrl}">${target.symbol}/${base.symbol} (${fee}%)</a>`,
    `💰 TVL: $${fmtNum(pool.tvlUsd)} | Vol 24h: $${fmtNum(pool.volume24hUsd)}`,
    `📈 Vol/TVL: ${pool.volTvlRatio.toFixed(2)}`,
    pool.apr24h != null ? `🔥 APR (24h): ${pool.apr24h.toFixed(1)}%` : null,
    ``,
    `🧠 <b>Pattern:</b> ${pattern.reason}`,
    pattern.retracePct != null
      ? `   Retrace: ${(pattern.retracePct * 100).toFixed(1)}% from local high`
      : null,
    ``,
    `📐 <b>Suggested range:</b> +${RANGE_UPSIDE_PCT}% / -${RANGE_DOWNSIDE_PCT}%`,
    ``,
    `🔍 <b>Manual checks:</b>`,
    `   <a href="${bubblemapsUrl}">Bubblemaps</a> — holder clustering`,
    `   <a href="${gmgnUrl}">GMGN</a> — trading patterns`,
    ``,
    `⚠️ DYOR — this is a signal, not advice. Check holders & activity before entering.`,
  ];

  return lines.filter((l) => l !== null).join("\n");
}

export async function sendTelegramAlert(
  pool: RankedPool,
  pattern: PatternResult,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping");
    return;
  }

  const text = formatAlert(pool, pattern);

  const url = `${TG_API}/bot${token}/sendMessage`;
  const res = await fetchWithBackoff(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[telegram] Send failed ${res.status}: ${body}`);
  } else {
    console.log(`[telegram] Alert sent for ${pool.targetToken.symbol}/${pool.baseToken.symbol}`);
  }
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
