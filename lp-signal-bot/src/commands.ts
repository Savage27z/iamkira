/**
 * Telegram bot command handler.
 * Polls for incoming messages and handles slash commands
 * to control the bot without redeploying.
 *
 * Commands:
 *   /pause           — stop sending alerts (scanning continues)
 *   /resume          — resume sending alerts
 *   /status          — show current config + stats
 *   /setfee <pct>    — set minimum fee tier (e.g. /setfee 2)
 *   /setmax <n>      — set max alerts per cycle (e.g. /setmax 3)
 *   /cooldown <hrs>  — set de-alert window in hours (e.g. /cooldown 12)
 *   /help            — show available commands
 */

import { fetchWithBackoff } from "./rateLimit.js";
import { getKrystalBudgetRemaining } from "./rateLimit.js";
import { runtimeConfig } from "./runtimeConfig.js";

const TG_API = "https://api.telegram.org";
let lastUpdateId = 0;

/** Poll Telegram for new messages and handle commands */
export async function pollCommands(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const url = `${TG_API}/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=0`;
    const res = await fetchWithBackoff(url);
    if (!res.ok) return;

    const body = (await res.json()) as {
      ok: boolean;
      result: Array<{
        update_id: number;
        message?: {
          chat: { id: number };
          text?: string;
        };
      }>;
    };

    if (!body.ok || !body.result?.length) return;

    for (const update of body.result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg?.text || String(msg.chat.id) !== chatId) continue;

      const text = msg.text.trim();
      if (!text.startsWith("/")) continue;

      const reply = handleCommand(text);
      if (reply) {
        await sendReply(token, chatId, reply);
      }
    }
  } catch {
    // Silently ignore polling errors — don't crash the bot
  }
}

function handleCommand(text: string): string | null {
  const [cmd, ...args] = text.split(/\s+/);

  switch (cmd.toLowerCase()) {
    case "/pause":
      runtimeConfig.paused = true;
      return "⏸️ Alerts paused. Scanning continues in the background.\nUse /resume to start alerts again.";

    case "/resume":
      runtimeConfig.paused = false;
      return "▶️ Alerts resumed! You'll receive signals on the next matching pool.";

    case "/status": {
      const fee = (runtimeConfig.minFeeBps / 10_000).toFixed(1);
      const cooldown = (runtimeConfig.dealertWindowMs / 3_600_000).toFixed(1);
      return [
        `📊 <b>LP Signal Bot Status</b>`,
        ``,
        `State: ${runtimeConfig.paused ? "⏸️ Paused" : "▶️ Active"}`,
        `Min fee: ${fee}%`,
        `Max alerts/cycle: ${runtimeConfig.maxAlertsPerCycle}`,
        `Cooldown: ${cooldown}h`,
        `Krystal budget: ${getKrystalBudgetRemaining()} units left`,
        `Alerts sent this session: ${runtimeConfig.totalAlertsSent}`,
      ].join("\n");
    }

    case "/setfee": {
      const pct = parseFloat(args[0]);
      if (isNaN(pct) || pct < 0.01 || pct > 100) {
        return "❌ Usage: /setfee <percent>\nExample: /setfee 2 (for 2% min fee)";
      }
      runtimeConfig.minFeeBps = Math.round(pct * 10_000);
      return `✅ Min fee set to ${pct}% (${runtimeConfig.minFeeBps} bps)`;
    }

    case "/setmax": {
      const n = parseInt(args[0]);
      if (isNaN(n) || n < 1 || n > 50) {
        return "❌ Usage: /setmax <number>\nExample: /setmax 3 (max 3 alerts per cycle)";
      }
      runtimeConfig.maxAlertsPerCycle = n;
      return `✅ Max alerts per cycle set to ${n}`;
    }

    case "/cooldown": {
      const hrs = parseFloat(args[0]);
      if (isNaN(hrs) || hrs < 0.5 || hrs > 168) {
        return "❌ Usage: /cooldown <hours>\nExample: /cooldown 12 (12h between re-alerts)";
      }
      runtimeConfig.dealertWindowMs = Math.round(hrs * 3_600_000);
      return `✅ Cooldown set to ${hrs}h — won't re-alert the same pool within ${hrs} hours`;
    }

    case "/help":
      return [
        `🤖 <b>LP Signal Bot Commands</b>`,
        ``,
        `/pause — stop alerts`,
        `/resume — resume alerts`,
        `/status — show config & stats`,
        `/setfee <pct> — min fee tier (e.g. /setfee 2)`,
        `/setmax <n> — max alerts per cycle`,
        `/cooldown <hrs> — hours before re-alerting same pool`,
        `/help — this message`,
      ].join("\n");

    default:
      return null;
  }
}

async function sendReply(token: string, chatId: string, text: string): Promise<void> {
  const url = `${TG_API}/bot${token}/sendMessage`;
  await fetchWithBackoff(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
}
