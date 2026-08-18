import { describe, expect, it, vi } from "vitest";
import { preflightToolCall } from "../../src/agent/tool-guardrails";
import { TurnJournal } from "../../src/agent/turn-state";
import { ToolExecutor } from "../../src/agent/tool-executor";
import { ApprovalService } from "../../src/agentic/approval-service";
import type { ProjectContextBinding } from "../../src/agentic/types";
import type { ProviderToolCall } from "../../src/providers/base";
import type { ToolDefinition } from "../../src/tools/types";
import { buildPrompt } from "../../src/agent/prompt-builder";
import { TurnContext, type TurnTokenBudget } from "../../src/agent/turn-context";
import { InMemorySessionStore } from "../../src/gateway/session";

const binding: ProjectContextBinding = {
  tenantId: "tenant-1",
  projectId: "project-1",
  actorId: "actor-1",
  conversationId: "conversation-1",
  allowedToolScopes: ["workspace:read"],
  issuedAt: new Date().toISOString(),
};

const readTool: ToolDefinition = {
  declaration: { name: "file_read", description: "read", parameters: { type: "OBJECT", properties: { path: { type: "STRING" } } } },
  policy: { available: true, riskTier: "low", sideEffect: "read", approval: "never", concurrency: "safe", scope: "workspace:read" },
  execute: vi.fn(async () => ({ ok: true })),
};

function call(argumentsValue: unknown, name = "file_read"): ProviderToolCall {
  return { id: "call-1", name, arguments: argumentsValue as Readonly<Record<string, unknown>> };
}

function errorCode(result: ReturnType<typeof preflightToolCall>): string | undefined {
  return result.ok ? undefined : result.errorCode;
}

describe("preflight tool guardrails", () => {
  it("denies malformed, unavailable, out-of-scope, and threat-bearing calls without side effects", () => {
    expect(errorCode(preflightToolCall({ registry: [readTool], call: call([]), allowedScopes: binding.allowedToolScopes }))).toBe("tool_call_invalid");
    expect(errorCode(preflightToolCall({ registry: [readTool], call: call({ path: "../secret" }), allowedScopes: binding.allowedToolScopes }))).toBe("path_traversal");
    expect(errorCode(preflightToolCall({ registry: [readTool], call: call({ path: "C:\\secret" }), allowedScopes: binding.allowedToolScopes }))).toBe("absolute_path");
    expect(errorCode(preflightToolCall({ registry: [readTool], call: call({ path: "safe" }, "missing"), allowedScopes: binding.allowedToolScopes }))).toBe("tool_not_registered");
  });

  it("runs before journal and approval for command injection", async () => {
    const handler = vi.fn(async () => ({ executed: true }));
    const terminal: ToolDefinition = {
      declaration: { name: "terminal_run", description: "terminal", parameters: { type: "OBJECT", properties: { command: { type: "STRING" } } } },
      policy: { available: true, riskTier: "high", sideEffect: "external", approval: "on-risk", concurrency: "sequential", scope: "workspace:read" },
      execute: handler,
    };
    const journal = new TurnJournal();
    const executor = new ToolExecutor({ registry: [terminal], binding, journal, approvals: new ApprovalService() });
    const session = await new InMemorySessionStore().resolve({ ...binding, channel: "command_room" });
    const prompt = buildPrompt({ stable: { locale: "id-ID", channel: "command_room", profileName: "test" }, session: session.source, messages: [{ role: "user", content: "run" }], now: "2026-08-18T00:00:00.000Z" });
    const context = TurnContext.create({ runId: "run-guard", session, prompt, messages: [{ role: "user", content: "run" }], tokenBudget: { maxInputTokens: 1000, maxOutputTokens: 500, maxTotalTokens: 1500, maxToolResultBytes: 1000 } satisfies TurnTokenBudget, provenance: { source: "guard-test", version: "1" }, now: "2026-08-18T00:00:00.000Z" });

    const result = await executor.execute([call({ command: "Get-Content safe.txt; whoami" }, "terminal_run")], context, new AbortController().signal);

    expect(result[0]).toMatchObject({ status: "failed", result: { errorCode: "shell_metacharacter" } });
    expect(journal.snapshot().entries).toHaveLength(0);
    expect(handler).not.toHaveBeenCalled();
  });
});
