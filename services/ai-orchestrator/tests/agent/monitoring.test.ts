import { describe, expect, it } from "vitest";
import { createBoundedLoopObserver, type RuntimeObservation } from "../../src/agent/monitoring";

describe("bounded loop monitoring", () => {
  it("caps events and truncates identifiers/metadata before invoking the observer", async () => {
    const values: unknown[] = [];
    const observer: RuntimeObservation = { onLoop: (value) => { values.push(value); } };
    const observe = createBoundedLoopObserver(observer, { maxEvents: 1, maxStringLength: 11, maxMetadataEntries: 1 });

    await observe({
      runId: "run-with-a-long-id",
      turnId: "turn-with-a-long-id",
      iteration: 1,
      stage: "before_model",
      toolName: "tool-with-a-long-name",
      metadata: { first: "value-that-is-long", second: true },
    });
    await observe({ runId: "run-2", turnId: "turn-2", iteration: 2, stage: "after_model", metadata: {} });

    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ runId: "run-with-a-", turnId: "turn-with-a", toolName: "tool-with-a" });
    expect(Object.keys((values[0] as { metadata: Record<string, unknown> }).metadata)).toEqual(["first"]);
    expect(JSON.stringify(values[0])).not.toContain("value-that-is-long");
  });

  it("isolates observer failures", async () => {
    const observe = createBoundedLoopObserver({ onLoop: () => { throw new Error("observer unavailable"); } });
    await expect(observe({ runId: "run", turnId: "turn", iteration: 0, stage: "turn_started", metadata: {} })).resolves.toBeUndefined();
  });
});
