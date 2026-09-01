/**
 * Runtime-mutable config. Starts from static defaults in config.ts,
 * but can be changed via Telegram commands without redeploying.
 */

import {
  MIN_FEE_BPS,
  MAX_ALERTS_PER_CYCLE,
  DEALERT_WINDOW_MS,
} from "./config.js";

export const runtimeConfig = {
  /** Whether alerts are paused (scanning still runs) */
  paused: false,

  /** Minimum fee tier in bps — changeable via /setfee */
  minFeeBps: MIN_FEE_BPS,

  /** Max alerts per poll cycle — changeable via /setmax */
  maxAlertsPerCycle: MAX_ALERTS_PER_CYCLE,

  /** De-alert window in ms — changeable via /cooldown */
  dealertWindowMs: DEALERT_WINDOW_MS,

  /** Running count of alerts sent this session */
  totalAlertsSent: 0,
};
