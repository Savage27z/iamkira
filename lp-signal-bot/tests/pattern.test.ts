import { describe, it, expect } from "vitest";
import { analysePattern } from "../src/pattern.js";
import type { Candle } from "../src/types.js";

/** Build a sequence of candles with controllable shape */
function makeCandles(opts: {
  count: number;
  /** Price trajectory: array of close prices (length = count) */
  closes: number[];
  /** Optional per-candle volume (defaults to 1000) */
  volumes?: number[];
  /** How much each candle's high/low deviates from close (fraction, default 0.01) */
  spread?: number;
}): Candle[] {
  const spread = opts.spread ?? 0.01;
  return opts.closes.map((close, i) => ({
    timestamp: 1700000000 + i * 3600,
    open: close * (1 + spread * 0.5),
    high: close * (1 + spread),
    low: close * (1 - spread),
    close,
    volume: opts.volumes?.[i] ?? 1000,
  }));
}

describe("analysePattern", () => {
  it("returns no match when not enough candles", () => {
    const result = analysePattern([]);
    expect(result.match).toBe(false);
    expect(result.reason).toContain("Not enough");
  });

  it("detects a valid pump → retrace → base pattern", () => {
    // 48 candles: pump to 100, retrace to ~75, then consolidate at 75
    const closes = [
      // Ramp up (candles 0-19): 50 → 100
      ...Array.from({ length: 20 }, (_, i) => 50 + (50 * i) / 19),
      // Retrace (candles 20-35): 100 → 75
      ...Array.from({ length: 16 }, (_, i) => 100 - (25 * i) / 15),
      // Consolidation (candles 36-47): flat around 75
      ...Array.from({ length: 12 }, () => 75),
    ];
    const volumes = Array(48).fill(1000);

    const candles = makeCandles({ count: 48, closes, volumes, spread: 0.005 });
    const result = analysePattern(candles);

    expect(result.match).toBe(true);
    expect(result.retracePct).toBeGreaterThan(0.15);
    expect(result.retracePct).toBeLessThan(0.60);
    expect(result.reason).toContain("Pump→retrace→base");
  });

  it("rejects when price is still near the high (no retrace)", () => {
    // Flat at 100 — no meaningful retrace
    const closes = Array(48).fill(100);
    const candles = makeCandles({ count: 48, closes });
    const result = analysePattern(candles);

    expect(result.match).toBe(false);
    expect(result.reason).toContain("still near high");
  });

  it("rejects when price has crashed too far (retrace > max)", () => {
    // Pump to 100, crash to 30 — retrace 70%
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 50 + (50 * i) / 19),
      ...Array.from({ length: 28 }, () => 30),
    ];
    const candles = makeCandles({ count: 48, closes });
    const result = analysePattern(candles);

    expect(result.match).toBe(false);
    expect(result.reason).toContain("still crashing");
  });

  it("rejects when consolidation range is too wide", () => {
    // Pump to 100, retrace to ~75, but last 6 candles swing wildly
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 50 + (50 * i) / 19),
      ...Array.from({ length: 22 }, () => 75),
      // Wild swings in the last 6
      70, 82, 68, 84, 67, 80,
    ];
    const candles = makeCandles({ count: 48, closes, spread: 0.005 });
    const result = analysePattern(candles);

    expect(result.match).toBe(false);
    expect(result.reason).toContain("price not stable");
  });

  it("rejects when consolidation volume has dried up", () => {
    // Valid shape but volume drops to near-zero in consolidation
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 50 + (50 * i) / 19),
      ...Array.from({ length: 16 }, (_, i) => 100 - (25 * i) / 15),
      ...Array.from({ length: 12 }, () => 75),
    ];
    const volumes = [
      ...Array(42).fill(1000),
      // Last 6 candles: volume almost gone
      ...Array(6).fill(10),
    ];
    const candles = makeCandles({ count: 48, closes, volumes, spread: 0.005 });
    const result = analysePattern(candles);

    expect(result.match).toBe(false);
    expect(result.reason).toContain("volume dried up");
  });

  it("returns localHigh and retracePct in the result", () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 50 + (50 * i) / 19),
      ...Array.from({ length: 16 }, (_, i) => 100 - (25 * i) / 15),
      ...Array.from({ length: 12 }, () => 75),
    ];
    const candles = makeCandles({ count: 48, closes, spread: 0.005 });
    const result = analysePattern(candles);

    expect(result.localHigh).toBeDefined();
    expect(result.localHigh!).toBeGreaterThan(95); // near 100
    expect(result.retracePct).toBeDefined();
  });
});
