import { describe, expect, it } from "vitest";
import { buildPrompt } from "../../src/agent/prompt-builder";
import { InMemorySessionStore } from "../../src/gateway/session";
import { TurnContext } from "../../src/agent/turn-context";
import { IterationBudget } from "../../src/agent/iteration-budget";
import { runConversation, type ConversationEvent, type ToolExecutorLike } from "../../src/agent/conversation-loop";
import type { LoopHookContext } from "../../src/agent/loop-hooks";
import type { ModelProfile } from "../../src/config";
import type { ProviderCompletion, ProviderMessage, ProviderRequest, ProviderToolCall, ProviderTransport } from "../../src/providers/base";

const profile: ModelProfile = {
  alias: "lucent",
  provider: "deepseek",
  model: "deepseek-v4-flash",
  transport: "openai-compatible",
  requestStyle: "chat-completions",
  supportsThinking: true,
};

async function context() {
  const session = await new InMemorySessionStore().resolve({
    channel: "command_room",
    tenantId: "tenant-1",
    actorId: "actor-1",
    conversationId: "conversation-1",
    projectId: "project-1",
  });
  const prompt = buildPrompt({
    stable: { locale: "id-ID", channel: "command_room", profileName: "review" },
    session: session.source,
    messages: [{ role: "user", content: "Review the drawing" }],
    now: "2026-08-18T00:00:00.000Z",
  });
  return TurnContext.create({
    runId: "run-1",
    session,
    prompt,
    messages: [{ role: "user", content: "Review the drawing" }],
    tokenBudget: { maxInputTokens: 4_000, maxOutputTokens: 2_000, maxTotalTokens: 6_000, maxToolResultBytes: 4_000 },
    provenance: { source: "conversation-loop-test", version: "1" },
    now: "2026-08-18T00:00:00.000Z",
  });
}

class ScriptedTransport implements ProviderTransport {
  readonly id = "scripted-transport";
  readonly capabilities = new Set(["stream"]);
  readonly requests: ProviderRequest[] = [];
  private readonly scripts: Array<ProviderCompletion | Error>;

  constructor(...scripts: Array<ProviderCompletion | Error>) {
    this.scripts = [...scripts];
  }

  async complete(request: ProviderRequest): Promise<ProviderCompletion> {
    this.requests.push(request);
    return this.next();
  }

  async *stream(request: ProviderRequest) {
    this.requests.push(request);
    const completion = this.next();
    yield { type: "completed" as const, completion };
  }

  private next(): ProviderCompletion {
    const next = this.scripts.shift();
    if (!next) throw new Error("script exhausted");
    if (next instanceof Error) throw next;
    return next;
  }
}

class StreamingContentTransport implements ProviderTransport {
  readonly id = "streaming-content-transport";
  readonly capabilities = new Set(["stream"]);

  async complete(): Promise<ProviderCompletion> {
    throw new Error("complete should not be called for a streaming transport");
  }

  async *stream() {
    yield { type: "reasoning" as const, delta: "hidden reasoning" };
    yield { type: "delta" as const, delta: "Selesai." };
    yield { type: "completed" as const, completion: { content: "Selesai.", finishReason: "stop" as const } };
  }
}

function toolExecutor(results: Array<{ toolCallId: string; name: string; result: Record<string, unknown> }>, calls: ProviderToolCall[] = []): ToolExecutorLike & { calls: ProviderToolCall[] } {
  return {
    calls,
    async execute(toolCalls) {
      calls.push(...toolCalls);
      return results.map((result) => ({ ...result, status: "completed" as const }));
    },
  };
}

function events() {
  const values: ConversationEvent[] = [];
  return { values, sink: { emit: (event: ConversationEvent) => values.push(event) } };
}

function budget(overrides: Partial<ConstructorParameters<typeof IterationBudget>[0]["limits"]> = {}) {
  return new IterationBudget({
    limits: {
      maxIterations: 4,
      maxModelAttempts: 4,
      maxToolCalls: 8,
      maxDurationMs: 30_000,
      maxInputTokens: 20_000,
      maxOutputTokens: 10_000,
      maxTotalTokens: 30_000,
      ...overrides,
    },
  });
}

function input(overrides: Partial<Parameters<typeof runConversation>[0]> = {}) {
  return {
    context: undefined as never,
    profile,
    transport: undefined as never,
    toolExecutor: toolExecutor([]),
    budget: budget(),
    reasoningEffort: "high",
    thinking: "on" as const,
    providerTools: [],
    signal: new AbortController().signal,
    events: { emit: () => undefined },
    ...overrides,
  };
}

describe("canonical conversation loop", () => {
  it("returns a final response without invoking tools", async () => {
    const transport = new ScriptedTransport({ content: "Selesai.", finishReason: "stop" });
    const executor = toolExecutor([]);
    const eventLog = events();
    const result = await runConversation(input({ context: await context(), transport, toolExecutor: executor, events: eventLog.sink }));

    expect(result).toMatchObject({ status: "completed", stopReason: "completed", content: "Selesai." });
    expect(transport.requests).toHaveLength(1);
    expect(executor.calls).toHaveLength(0);
    expect(eventLog.values.map((event) => event.type)).toContain("calling_model");
  });

  it("forwards streamed answer deltas once and never forwards raw reasoning", async () => {
    const eventLog = events();
    const result = await runConversation(input({ context: await context(), transport: new StreamingContentTransport(), events: eventLog.sink }));

    expect(result).toMatchObject({ status: "completed", content: "Selesai." });
    expect(eventLog.values.filter((event) => event.type === "assistant_delta")).toEqual([{ type: "assistant_delta", delta: "Selesai." }]);
    expect(eventLog.values.some((event) => event.type === "reasoning_delta")).toBe(false);
  });

  it("allows a valid final answer on the exact last model iteration", async () => {
    const transport = new ScriptedTransport({ content: "Batas terakhir tetap selesai.", finishReason: "stop" });
    const result = await runConversation(input({ context: await context(), transport, budget: budget({ maxIterations: 1, maxModelAttempts: 1 }) }));

    expect(result).toMatchObject({ status: "completed", stopReason: "completed", content: "Batas terakhir tetap selesai." });
  });

  it("retries one malformed provider response before allowing a valid completion", async () => {
    const transport = new ScriptedTransport(
      { content: null, finishReason: "tool_calls", toolCalls: [] },
      { content: "Pulih setelah response invalid.", finishReason: "stop" },
    );
    const result = await runConversation(input({ context: await context(), transport, retryCount: 1 }));

    expect(result).toMatchObject({ status: "completed", content: "Pulih setelah response invalid." });
    expect(transport.requests).toHaveLength(2);
  });

  it("executes a validated tool call, appends the result, then makes one follow-up model request", async () => {
    const call = { id: "call-1", name: "workspace_list", arguments: { path: "." } };
    const transport = new ScriptedTransport(
      { content: null, finishReason: "tool_calls", toolCalls: [call] },
      { content: "Daftar selesai.", finishReason: "stop" },
    );
    const executor = toolExecutor([{ toolCallId: "call-1", name: "workspace_list", result: { files: ["README.md"] } }]);
    const result = await runConversation(input({ context: await context(), transport, toolExecutor: executor }));

    expect(result).toMatchObject({ status: "completed", content: "Daftar selesai." });
    expect(transport.requests).toHaveLength(2);
    expect(executor.calls).toEqual([call]);
    expect(transport.requests[1].messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
  });

  it("retries a retryable model error within the model-attempt budget", async () => {
    const transport = new ScriptedTransport(
      Object.assign(new Error("temporary provider outage"), { retryable: true }),
      { content: "Pulih.", finishReason: "stop" },
    );
    const result = await runConversation(input({ context: await context(), transport, retryCount: 1 }));

    expect(result).toMatchObject({ status: "completed", content: "Pulih." });
    expect(transport.requests).toHaveLength(2);
  });

  it("stops at the iteration boundary and does not start an unbounded third loop", async () => {
    const call = { id: "call-1", name: "workspace_list", arguments: {} };
    const transport = new ScriptedTransport({ content: null, finishReason: "tool_calls", toolCalls: [call] });
    const executor = toolExecutor([{ toolCallId: "call-1", name: "workspace_list", result: { ok: true } }]);
    const result = await runConversation(input({ context: await context(), transport, toolExecutor: executor, budget: budget({ maxIterations: 1 }) }));

    expect(result.status).toBe("stopped");
    expect(result.stopReason).toBe("iteration_limit");
    expect(transport.requests).toHaveLength(1);
  });

  it("does not dispatch invalid completions to the tool executor and aborts before a request", async () => {
    const transport = new ScriptedTransport({ content: null, finishReason: "tool_calls", toolCalls: [{ id: "bad", name: "unknown", arguments: {} }] });
    const executor = toolExecutor([]);
    const controller = new AbortController();
    controller.abort();
    const aborted = await runConversation(input({ context: await context(), transport, toolExecutor: executor, signal: controller.signal }));
    expect(aborted.stopReason).toBe("aborted");
    expect(transport.requests).toHaveLength(0);
    expect(executor.calls).toHaveLength(0);

    const invalidTransport = new ScriptedTransport({ content: null, finishReason: "tool_calls", toolCalls: [] });
    const invalidExecutor = toolExecutor([]);
    const invalid = await runConversation(input({
      context: await context(),
      transport: invalidTransport,
      toolExecutor: invalidExecutor,
      validateCompletion: () => { throw new Error("provider response invalid"); },
    }));
    expect(invalid.stopReason).toBe("response_invalid");
    expect(invalidExecutor.calls).toHaveLength(0);
  });

  it("emits formal loop stages in deterministic order without changing the canonical turn", async () => {
    const stages: string[] = [];
    const transport = new ScriptedTransport({ content: "Formal hook selesai.", finishReason: "stop" });
    const result = await runConversation(input({
      context: await context(),
      transport,
      loopHooks: [{
        name: "test-observer",
        stages: ["turn_started", "before_model", "after_model", "turn_finalized"],
        onStage: (value: LoopHookContext) => { stages.push(value.stage); },
      }],
    }));

    expect(result).toMatchObject({ status: "completed", content: "Formal hook selesai." });
    expect(stages).toEqual(["turn_started", "before_model", "after_model", "turn_finalized"]);
  });

  it("continues the turn when a formal hook throws", async () => {
    const transport = new ScriptedTransport({ content: "Tetap selesai.", finishReason: "stop" });
    const result = await runConversation(input({
      context: await context(),
      transport,
      loopHooks: [{ name: "throwing", stages: ["before_model"], onStage: () => { throw new Error("raw completion"); } }],
    }));

    expect(result).toMatchObject({ status: "completed", content: "Tetap selesai." });
  });
});
