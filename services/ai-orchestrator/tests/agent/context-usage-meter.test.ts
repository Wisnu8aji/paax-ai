import { describe, expect, it } from "vitest";
import { createContextUsageMeter, ContextUsageMeter } from "../../src/agent/context-usage-meter";

describe("PAAX Context Usage Meter (paax-context)", () => {
  it("tracks turn token usage and calculates utilization percentage", () => {
    const meter = createContextUsageMeter({ maxWindowTokens: 100_000 });
    const snap1 = meter.recordUsage({
      turnIndex: 1,
      promptTokens: 15_000,
      completionTokens: 5_000,
    });

    expect(snap1.totalTokens).toBe(20_000);
    expect(snap1.utilizationPercent).toBe(20);
    expect(snap1.healthStatus).toBe("normal");
    expect(snap1.deltaTokens).toBe(20_000);

    const snap2 = meter.recordUsage({
      turnIndex: 2,
      promptTokens: 60_000,
      completionTokens: 15_000,
    });

    expect(snap2.totalTokens).toBe(75_000);
    expect(snap2.utilizationPercent).toBe(75);
    expect(snap2.healthStatus).toBe("warning");
    expect(snap2.deltaTokens).toBe(55_000);
  });

  it("identifies critical context window exhaustion", () => {
    const meter = createContextUsageMeter({ maxWindowTokens: 10_000 });
    const snap = meter.recordUsage({
      turnIndex: 1,
      promptTokens: 8_500,
      completionTokens: 1_000,
    });

    expect(snap.utilizationPercent).toBe(95);
    expect(snap.healthStatus).toBe("critical");
  });

  it("estimates tokens from raw text", () => {
    const text = "1234567890123456"; // 16 chars
    expect(ContextUsageMeter.estimateTokens(text)).toBe(4);
  });
});
