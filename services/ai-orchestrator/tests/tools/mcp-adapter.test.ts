import { describe, expect, it, vi } from "vitest";
import { ApprovalService } from "../../src/agentic/approval-service";
import { buildPrompt } from "../../src/agent/prompt-builder";
import { ToolExecutor, type ToolExecutorEvent } from "../../src/agent/tool-executor";
import { TurnContext } from "../../src/agent/turn-context";
import { TurnJournal } from "../../src/agent/turn-state";
import { InMemorySessionStore } from "../../src/gateway/session";
import type { ProjectContextBinding } from "../../src/agentic/types";
import { adaptMcpTools } from "../../src/tools/mcp/adapter";
import { createMcpToolSource } from "../../src/tools/mcp/adapter";
import type { McpClient, McpToolDescriptor } from "../../src/tools/mcp/types";
import { createToolRegistry } from "../../src/tools/registry";
import { toProviderTools } from "../../src/tools/model-tools";

const descriptor = (name: string): McpToolDescriptor => ({ name, description: "fixture tool", inputSchema: { type: "object", properties: { value: { type: "string" } } } });

function client(): McpClient {
  return {
    initialize: vi.fn(async () => undefined),
    listTools: vi.fn(async () => []),
    callTool: vi.fn(async () => ({ content: [{ type: "text", text: "fixture" }] })),
    close: vi.fn(async () => undefined),
  };
}

const binding: ProjectContextBinding = {
  tenantId: "tenant-1",
  projectId: "project-1",
  actorId: "actor-1",
  conversationId: "conversation-1",
  allowedToolScopes: ["mcp:demo:execute"],
  issuedAt: "2026-08-18T00:00:00.000Z",
};

async function turnContext() {
  const session = await new InMemorySessionStore().resolve({ ...binding, channel: "command_room" });
  const messages = [{ role: "user" as const, content: "run the MCP fixture" }];
  const prompt = buildPrompt({
    stable: { locale: "id-ID", channel: "command_room", profileName: "test" },
    session: { channel: "command_room", ...binding },
    messages,
    workspaceSnapshot: [],
    memorySummaries: [],
    skillSummaries: [],
    now: "2026-08-18T00:00:00.000Z",
  });
  return TurnContext.create({
    runId: "run-mcp",
    session,
    prompt,
    messages,
    tokenBudget: { maxInputTokens: 2_000, maxOutputTokens: 1_000, maxTotalTokens: 3_000, maxToolResultBytes: 4_000 },
    provenance: { source: "mcp-test", version: "1" },
    now: "2026-08-18T00:00:00.000Z",
  });
}

describe("canonical MCP tool adapter", () => {
  it("prefixes names, preserves provenance, and calls the same client boundary", async () => {
    const source = client();
    const [tool] = adaptMcpTools({ serverId: "demo", client: source, descriptors: [descriptor("echo")], provenance: "fixture-config" });
    expect(tool.declaration.name).toBe("mcp__demo__echo");
    expect(tool).toMatchObject({ toolset: "mcp", provenance: { source: "mcp", serverId: "demo", toolName: "echo" }, policy: { approval: "always", sideEffect: "external" } });
    await expect(tool.execute({ value: "x" }, { signal: new AbortController().signal })).resolves.toMatchObject({ content: [{ text: "fixture" }] });
    expect(source.callTool).toHaveBeenCalledWith("echo", { value: "x" }, expect.any(AbortSignal));
  });

  it("rejects invalid schemas and normalized collisions fail closed", () => {
    expect(() => adaptMcpTools({ serverId: "demo", client: client(), descriptors: [{ ...descriptor("bad"), inputSchema: { type: "string" } }] })).toThrow(/schema/i);
    expect(() => adaptMcpTools({ serverId: "demo", client: client(), descriptors: [descriptor("a-b"), descriptor("a b")] })).toThrow(/collision|duplicate/i);
  });

  it("can be injected into the single canonical registry and provider conversion", () => {
    const tools = adaptMcpTools({ serverId: "demo", client: client(), descriptors: [descriptor("echo")] });
    const registry = createToolRegistry({ coreEngineUrl: "http://core.test", documentIntelligenceUrl: "http://doc.test", mode: "canonical", mcpTools: tools });
    expect(registry.filter((tool) => tool.declaration.name === "mcp__demo__echo")).toHaveLength(1);
    expect(toProviderTools(registry).some((tool) => tool.name === "mcp__demo__echo")).toBe(true);
  });

  it("routes a discovered MCP call through canonical journal and approval", async () => {
    const source = client();
    const [tool] = adaptMcpTools({ serverId: "demo", client: source, descriptors: [descriptor("echo")] });
    const journal = new TurnJournal();
    const approvals = new ApprovalService();
    const events: ToolExecutorEvent[] = [];
    const executor = new ToolExecutor({ registry: [tool], binding, journal, approvals, onEvent: (event) => events.push(event) });

    const resultPromise = executor.execute([{ id: "mcp-call-1", name: tool.declaration.name, arguments: { value: "x" } }], await turnContext(), new AbortController().signal);
    await vi.waitFor(() => expect(events.some((event) => event.type === "approval.requested")).toBe(true));
    const requested = events.find((event) => event.type === "approval.requested");
    approvals.decide(String(requested?.approvalId), "approver", ["owner"], "approved", undefined, {
      tenantId: binding.tenantId,
      projectId: binding.projectId,
      conversationId: binding.conversationId,
      runId: "run-mcp",
    });

    const result = await resultPromise;
    expect(result[0]).toMatchObject({ status: "completed", name: tool.declaration.name });
    expect(source.callTool).toHaveBeenCalledWith("echo", { value: "x" }, expect.any(AbortSignal));
    expect(journal.snapshot().entries[0]).toMatchObject({ status: "completed", toolCallId: "mcp-call-1" });
  });

  it("does not create a client when MCP is disabled by an empty server set", async () => {
    const factory = vi.fn(() => client());
    const source = createMcpToolSource({ servers: [], clientFactory: factory });
    await expect(source.discover({})).resolves.toEqual([]);
    expect(factory).not.toHaveBeenCalled();
    await source.close?.();
  });
});
