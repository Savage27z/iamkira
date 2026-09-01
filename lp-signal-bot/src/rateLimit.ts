/**
 * Task 4 — Simple budget tracker for Krystal API (50k units/month @ 10/call).
 * Also handles 429 back-off for any HTTP call.
 */

import {
  KRYSTAL_MONTHLY_BUDGET,
  KRYSTAL_UNITS_PER_CALL,
  KRYSTAL_BUDGET_WARN_THRESHOLD,
} from "./config.js";

// ── Krystal budget tracker ─────────────────────────────────────────

let budgetUsed = 0;
let budgetMonth = new Date().getMonth();

function resetIfNewMonth() {
  const now = new Date().getMonth();
  if (now !== budgetMonth) {
    budgetUsed = 0;
    budgetMonth = now;
    console.log("[rate-limit] New month — budget reset");
  }
}

/** Record that we made a Krystal /v1/pools call. Returns false if over budget. */
export function recordKrystalCall(): boolean {
  resetIfNewMonth();
  budgetUsed += KRYSTAL_UNITS_PER_CALL;

  const remaining = KRYSTAL_MONTHLY_BUDGET - budgetUsed;
  if (remaining <= 0) {
    console.warn(
      `[rate-limit] ⛔ Krystal budget exhausted (${budgetUsed}/${KRYSTAL_MONTHLY_BUDGET} units). Skipping call.`
    );
    return false;
  }
  if (remaining <= KRYSTAL_BUDGET_WARN_THRESHOLD) {
    console.warn(
      `[rate-limit] ⚠️  Krystal budget low: ${remaining} units remaining (${budgetUsed} used)`
    );
  }
  return true;
}

export function getKrystalBudgetRemaining(): number {
  resetIfNewMonth();
  return KRYSTAL_MONTHLY_BUDGET - budgetUsed;
}

// ── Generic fetch with 429 back-off ────────────────────────────────

const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 2_000;

export async function fetchWithBackoff(
  url: string,
  init?: RequestInit,
  retries = DEFAULT_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const delay = retryAfter
        ? Number(retryAfter) * 1000
        : BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `[rate-limit] 429 from ${new URL(url).hostname} — retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${retries})`
      );
      await sleep(delay);
      continue;
    }

    return res;
  }

  throw new Error(`[rate-limit] Exhausted retries on 429 for ${url}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
