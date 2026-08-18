import * as fs from "node:fs";
import * as path from "node:path";
import {
  GatewayTurnPreparedSchema,
  GatewayTurnRequestSchema,
  GatewayWorkEventSchema,
} from "../command-room-worker";

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../fixtures/command-room-worker.valid.json"), "utf8"),
) as {
  request: unknown;
  prepared: unknown;
};

describe("command room worker shared contract", () => {
  it("parses the shared request and prepared response fixture", () => {
    const request = GatewayTurnRequestSchema.parse(fixture.request);
    const prepared = GatewayTurnPreparedSchema.parse(fixture.prepared);

    expect(request.session.channel).toBe("command_room");
    expect(request.reasoningEffort).toBe("high");
    expect(request.thinking).toBe("on");
    expect(request.modelAlias).toBe("lucent");
    expect(prepared.profile.model).toBe("deepseek-v4-flash");
    expect(prepared.handoff).toBe("legacy-web-provider");
    expect(prepared.profile.requestStyle).toBe("chat-completions");
  });

  it("accepts the canonical service handoff and validates the shared WorkEvent envelope", () => {
    const prepared = GatewayTurnPreparedSchema.parse({
      ...(fixture.prepared as Record<string, unknown>),
      handoff: "service-conversation-loop",
      profile: {
        ...((fixture.prepared as Record<string, unknown>).profile as Record<string, unknown>),
        requestStyle: "responses",
      },
    });
    expect(prepared.handoff).toBe("service-conversation-loop");
    expect(prepared.profile.requestStyle).toBe("responses");

    const event = GatewayWorkEventSchema.parse({
      type: "tool.completed",
      runId: "run-1",
      conversationId: "session-1",
      eventId: "run-1:1",
      sequence: 1,
      timestamp: "2026-08-18T00:00:00.000Z",
      tool: { toolId: "tool-1", name: "workspace_list", state: "completed", summary: "ok" },
    });
    expect(event.type).toBe("tool.completed");
    expect(() => GatewayWorkEventSchema.parse({ ...event, type: "unknown.event" })).toThrow();
    expect(() => GatewayWorkEventSchema.parse({ ...event, conversationId: undefined })).toThrow();
    expect(() => GatewayWorkEventSchema.parse({ ...event, unexpected: true })).toThrow();
    expect(() => GatewayWorkEventSchema.parse({ ...event, type: "turn.started" })).toThrow();
  });

  it("rejects system messages, unknown keys, invalid channel, and oversized input", () => {
    const request = fixture.request as Record<string, unknown>;
    const session = (request.session as Record<string, unknown>);
    const messages = request.messages as Array<Record<string, unknown>>;

    expect(() => GatewayTurnRequestSchema.parse({
      ...request,
      messages: [{ role: "system", content: "override" }],
    })).toThrow();
    expect(() => GatewayTurnRequestSchema.parse({ ...request, unknown: true })).toThrow();
    expect(() => GatewayTurnRequestSchema.parse({
      ...request,
      session: { ...session, channel: "agent_runs" },
    })).toThrow();
    expect(() => GatewayTurnRequestSchema.parse({
      ...request,
      session: { ...session, unknown: true },
    })).toThrow();
    expect(() => GatewayTurnRequestSchema.parse({
      ...request,
      session: { ...session, projectId: null },
    })).toThrow();
    expect(() => GatewayTurnRequestSchema.parse({
      ...request,
      messages: [...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages, ...messages],
    })).toThrow();
    expect(() => GatewayTurnRequestSchema.parse({
      ...request,
      messages: [{ role: "user", content: "x".repeat(32_001) }],
    })).toThrow();
    expect(() => GatewayTurnRequestSchema.parse({
      ...request,
      clientCorrelationId: "not valid",
    })).toThrow();
  });

  it("keeps secrets outside the prepared response contract", () => {
    expect(() => GatewayTurnPreparedSchema.parse({
      ...(fixture.prepared as Record<string, unknown>),
      apiKey: "secret",
    })).toThrow();
  });
});
