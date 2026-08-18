import { describe, expect, it } from "vitest";
import { TraceRecorder } from "../../src/observability/trace";

describe("minimal trace recorder", () => {
  it("creates parent/child spans with correlation and sanitized export", async () => {
    const exported: any[] = [];
    const traces = new TraceRecorder({ exporter: async (record) => { exported.push(record); } });
    const parent = traces.start("turn", { correlationId: "correlation-a", attributes: { status: "running", authorization: "trace-secret" } });
    const child = traces.start("tool", { traceId: parent.traceId, parentSpanId: parent.spanId, attributes: { tool: "workspace_list" } });
    child.end("ok");
    parent.annotate({ reasoning: "raw private chain" });
    parent.end("ok");
    await traces.flush();
    expect(exported).toHaveLength(2);
    expect(exported.find((item) => item.name === "tool")).toMatchObject({ parentSpanId: parent.spanId, traceId: parent.traceId });
    expect(JSON.stringify(exported)).not.toContain("trace-secret");
    expect(JSON.stringify(exported)).not.toContain("raw private chain");
  });

  it("ends a span only once and isolates exporter failure", async () => {
    const traces = new TraceRecorder({ exporter: async () => { throw new Error("trace failure"); } });
    const span = traces.start("turn");
    span.error(new Error("secret provider detail"));
    span.end("error");
    span.end("ok");
    await expect(traces.flush()).resolves.toBeUndefined();
  });
});
