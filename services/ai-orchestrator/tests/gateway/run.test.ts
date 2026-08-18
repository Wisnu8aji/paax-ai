import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config";
import { createGatewayRouter, GatewayRunner, type GatewayRunnerDependencies } from "../../src/gateway/run";
import { InMemorySessionStore } from "../../src/gateway/session";
import { SqliteSessionStore } from "../../src/gateway/session";
import { SessionDB } from "../../src/state/session-db";

const profileJson = JSON.stringify({
  lucent: {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    transport: "openai-compatible",
    supportsThinking: true,
  },
});

function config() {
  return loadConfig({ PAAX_MODEL_PROFILES_JSON: profileJson, PAAX_DEFAULT_MODEL_ALIAS: "lucent" });
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    mode: "work" as const,
    session: {
      channel: "command_room" as const,
      conversationId: "conversation-1",
      projectId: "project-1",
    },
    messages: [{ role: "user" as const, content: "Review this drawing" }],
    modelAlias: "lucent",
    ...overrides,
  };
}

function preparedAgent() {
  return {
    initializeTurn: async (input: any) => ({
      runId: input.runId,
      session: input.session,
      profile: {
        alias: "lucent",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        transport: "openai-compatible",
        supportsThinking: true,
      },
      prompt: {
        version: "command-room-worker.phase2.v1",
        systemPrompt: "server-only system prompt",
        stableText: "stable",
        contextText: "context",
        volatileText: "volatile",
        stableHash: "a".repeat(64),
        sectionSizes: { stable: 6, context: 7, volatile: 8 },
        injectionFindings: [],
      },
      tools: [],
      lifecycle: "prepared" as const,
    }),
  };
}

function deps(overrides: Partial<GatewayRunnerDependencies> = {}): GatewayRunnerDependencies {
  return {
    config: config(),
    sessionStore: new InMemorySessionStore(),
    createAgent: () => preparedAgent() as any,
    ...overrides,
  };
}

const auth = { actorId: "actor-1", tenantId: "tenant-1" };

describe("GatewayRunner", () => {
  afterEach(() => {
    delete process.env.PAAX_TENANT_ID;
  });

  it("prepares a turn through session and agent boundaries without exposing the prompt", async () => {
    const dependencies = deps();
    const runner = new GatewayRunner(dependencies);
    const result = await runner.prepareTurn(request(), auth);

    expect(result.protocolVersion).toBe("command-room.gateway.v1");
    expect(result.binding).toMatchObject({
      channel: "command_room",
      tenantId: "tenant-1",
      actorId: "actor-1",
      projectId: "project-1",
    });
    expect(result.profile).toMatchObject({ alias: "lucent", model: "deepseek-v4-flash", selectedEffort: "high", thinking: "on" });
    expect(result.prompt).toEqual({
      version: "command-room-worker.phase2.v1",
      stableHash: "a".repeat(64),
      sectionSizes: { stable: 6, context: 7, volatile: 8 },
      injectionFindings: [],
    });
    expect(JSON.stringify(result)).not.toContain("server-only system prompt");
  });

  it("fails closed for an unknown profile before resolving or mutating a session", async () => {
    let resolved = 0;
    const sessionStore = new InMemorySessionStore();
    const runner = new GatewayRunner(deps({
      sessionStore: {
        resolve: async (...args) => {
          resolved += 1;
          return sessionStore.resolve(...args);
        },
        get: (...args) => sessionStore.get(...args),
        attachRun: (...args) => sessionStore.attachRun(...args),
        assertBinding: (...args) => sessionStore.assertBinding(...args),
      },
    }));

    await expect(runner.prepareTurn(request({ modelAlias: "missing" }), auth)).rejects.toMatchObject({ status: 503 });
    expect(resolved).toBe(0);
  });

  it("rejects an attached run bound to another project before agent preparation", async () => {
    let prepared = 0;
    const runner = new GatewayRunner(deps({
      findRunBinding: async () => ({
        tenantId: "tenant-1",
        projectId: "other-project",
        actorId: "actor-1",
        conversationId: "conversation-1",
        allowedToolScopes: [],
        issuedAt: new Date().toISOString(),
      }),
      createAgent: () => ({
        initializeTurn: async () => {
          prepared += 1;
          return preparedAgent().initializeTurn({});
        },
      }) as any,
    }));

    await expect(runner.prepareTurn(request({ runId: "run-existing" }), auth)).rejects.toMatchObject({ status: 409 });
    expect(prepared).toBe(0);
  });

  it("rejects a profile capability mismatch before creating session state", async () => {
    let resolved = 0;
    const sessionStore = new InMemorySessionStore();
    const limitedConfig = loadConfig({
      PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: { ...JSON.parse(profileJson).lucent, reasoningEffortMap: { high: "high" } } }),
    });
    const runner = new GatewayRunner(deps({
      config: limitedConfig,
      sessionStore: {
        resolve: async (...args) => {
          resolved += 1;
          return sessionStore.resolve(...args);
        },
        get: (...args) => sessionStore.get(...args),
        attachRun: (...args) => sessionStore.attachRun(...args),
        assertBinding: (...args) => sessionStore.assertBinding(...args),
      },
    }));

    await expect(runner.prepareTurn(request({ reasoningEffort: "low" }), auth)).rejects.toMatchObject({ status: 503 });
    expect(resolved).toBe(0);
  });

  it("exposes the documented endpoint status and safe error body", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      (req as any).user = { uid: "actor-1" };
      next();
    });
    app.use(createGatewayRouter(deps()));
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const ok = await fetch(`http://127.0.0.1:${port}/command-room/turn/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request()),
      });
      expect(ok.status).toBe(200);
      const body = await ok.json();
      expect(body.handoff).toBe("service-conversation-loop");
      expect(body.prompt.systemPrompt).toBeUndefined();

      const invalid = await fetch(`http://127.0.0.1:${port}/command-room/turn/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request({ modelAlias: "missing" })),
      });
      expect(invalid.status).toBe(503);
      const error = await invalid.json();
      expect(error.error).toBeTruthy();
      expect(JSON.stringify(error)).not.toContain("deepseek-v4-flash");

      const invalidSource = await fetch(`http://127.0.0.1:${port}/command-room/turn/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request({ session: { channel: "command_room", conversationId: "\u0000" } })),
      });
      expect(invalidSource.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("persists the durable run and inbound message before agent preparation", async () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const sessionStore = new SqliteSessionStore(db);
    let observed: { run: unknown; messages: unknown[] } | undefined;
    const runner = new GatewayRunner(deps({
      sessionStore,
      sessionDb: db,
      createAgent: () => ({
        initializeTurn: async (input: any) => {
          observed = { run: db.getRun(input.runId), messages: db.loadMessages({ sessionId: input.session.sessionId }) };
          return preparedAgent().initializeTurn(input);
        },
      }) as any,
    }));
    const execution = await runner.prepareExecution(request({ clientCorrelationId: "correlation-1" }), auth);
    expect(observed?.run).toMatchObject({ runId: execution.runId, status: "queued" });
    expect(observed?.messages).toEqual([expect.objectContaining({ role: "user", content: "Review this drawing" })]);
    await runner.attachExecution(execution);
    expect(db.getSession(execution.session.sessionId)).toMatchObject({ lastRunId: execution.runId });
    db.close();
  });

  it("persists the finalized assistant receipt and run status exactly once", async () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const sessionStore = new SqliteSessionStore(db);
    const runner = new GatewayRunner(deps({
      sessionStore,
      sessionDb: db,
      createAgent: () => ({
        initializeTurn: async (input: any) => preparedAgent().initializeTurn(input),
        runPreparedTurn: async (prepared: any) => ({ status: "completed", stopReason: "completed", content: "Durable answer", context: prepared.context, envelope: { status: "completed", stopReason: "completed", content: "Durable answer" } }),
      }) as any,
    }));
    const execution = await runner.prepareExecution(request({ clientCorrelationId: "correlation-final" }), auth);
    await runner.attachExecution(execution);
    await runner.executePrepared(execution, new AbortController().signal, { emit: () => undefined });
    expect(db.getRun(execution.runId)).toMatchObject({ status: "completed" });
    expect(db.loadMessages({ sessionId: execution.session.sessionId })).toEqual(expect.arrayContaining([expect.objectContaining({ role: "assistant", content: "Durable answer" })]));
    db.close();
  });

  it("persists WorkEvents before delivery and replays a finalized run without rerunning the agent", async () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 32_000, maxEventBytes: 32_000, busyTimeoutMs: 100 });
    let executions = 0;
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => { req.user = { uid: "actor-1" }; next(); });
    app.use(createGatewayRouter(deps({
      sessionStore: new SqliteSessionStore(db),
      sessionDb: db,
      createAgent: () => ({
        initializeTurn: async (input: any) => preparedAgent().initializeTurn(input),
        runPreparedTurn: async (_prepared: any, _signal: AbortSignal, events: any) => {
          executions += 1;
          events.emit({ type: "assistant_delta", delta: "Durable stream" });
          return { status: "completed", stopReason: "completed", content: "Durable stream", context: {} };
        },
      }) as any,
    })));
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const body = request({ runId: "run-replay" });
    const previousTenant = process.env.PAAX_TENANT_ID;
    process.env.PAAX_TENANT_ID = "tenant-1";
    try {
      const first = await fetch(`http://127.0.0.1:${port}/command-room/turn/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      expect(first.status).toBe(200);
      await first.text();
      expect(executions).toBe(1);
      const run = db.getRun("run-replay");
      expect(run).toMatchObject({ status: "completed" });
      const stored = db.readWorkEvents({ runId: "run-replay", sessionId: run!.sessionId });
      expect(stored.map((event) => event.type)).toEqual(expect.arrayContaining(["turn.started", "assistant.delta", "turn.completed"]));

      const replay = await fetch(`http://127.0.0.1:${port}/command-room/turn/stream`, { method: "POST", headers: { "Content-Type": "application/json", "Last-Event-ID": "0" }, body: JSON.stringify(body) });
      expect(replay.status).toBe(200);
      const replayBody = await replay.text();
      expect(executions).toBe(1);
      expect(replayBody).toContain("Durable stream");
    } finally {
      if (previousTenant === undefined) delete process.env.PAAX_TENANT_ID;
      else process.env.PAAX_TENANT_ID = previousTenant;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    }
  });
});
