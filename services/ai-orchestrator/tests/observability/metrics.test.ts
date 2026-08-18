import { describe, expect, it } from "vitest";
import { MetricsRegistry } from "../../src/observability/metrics";

describe("bounded metrics registry", () => {
  it("keeps stable allowlisted labels and supports snapshot/reset", () => {
    const metrics = new MetricsRegistry({ maxSeries: 2 });
    metrics.increment("turn.completed", { status: "completed", provider: "deepseek", rawPrompt: "secret" });
    metrics.increment("turn.completed", { status: "completed", provider: "deepseek" });
    metrics.observe("gateway.delivery.latency_ms", 12, { adapter: "in-process" });
    const snapshot = metrics.snapshot();
    expect(snapshot).toEqual(expect.arrayContaining([expect.objectContaining({ name: "turn.completed", count: 2, labels: { provider: "deepseek", status: "completed" } })]));
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    metrics.reset();
    expect(metrics.snapshot()).toEqual([]);
  });

  it("caps cardinality and ignores invalid/unallowlisted labels", () => {
    const metrics = new MetricsRegistry({ maxSeries: 1 });
    metrics.increment("tool.completed", { tool: "one" });
    metrics.increment("tool.completed", { tool: "two" });
    expect(metrics.snapshot()).toHaveLength(1);
    expect(metrics.droppedSeries).toBe(1);
    expect(() => metrics.increment("tool.completed", { tool: "one" }, -1)).toThrow(/metric/i);
  });
});
