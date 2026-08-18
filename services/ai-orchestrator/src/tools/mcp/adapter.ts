import type { ToolDefinition, ToolPolicyMetadata } from "../types";
import type { McpCallResult, McpClient, McpToolAdapterInput, McpToolSource, McpToolSourceOptions } from "./types";
import { createMcpClient } from "./client";
import { McpProtocolError } from "./types";

const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/u;
const SERVER_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;

const MCP_POLICY: ToolPolicyMetadata = Object.freeze({
  available: true,
  riskTier: "high",
  sideEffect: "external",
  approval: "always",
  concurrency: "sequential",
  timeoutMs: 30_000,
  executionMode: "sequential",
  requiresApproval: true,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSchema(schema: unknown): asserts schema is Record<string, unknown> {
  if (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties)) throw new McpProtocolError("schema_invalid", "MCP tool schema must be a JSON object schema");
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string" || !Object.prototype.hasOwnProperty.call(schema.properties, item)))) throw new McpProtocolError("schema_invalid", "MCP tool schema required fields are invalid");
}

export function normalizeMcpToolName(name: string): string {
  const normalized = name.trim().replace(/[^A-Za-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 64);
  if (!normalized || !TOOL_NAME.test(normalized)) throw new McpProtocolError("tool_name_invalid", "MCP tool name is invalid");
  return normalized;
}

export function mcpToolName(serverId: string, toolName: string): string {
  if (!SERVER_ID.test(serverId)) throw new McpProtocolError("server_id_invalid", "MCP server id is invalid");
  return `mcp__${serverId}__${normalizeMcpToolName(toolName)}`;
}

function boundedResult(result: McpCallResult): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  if (Array.isArray(result.content)) output.content = result.content.slice(0, 128);
  if (isRecord(result.structuredContent)) output.structuredContent = result.structuredContent;
  if (typeof result.isError === "boolean") output.isError = result.isError;
  return output;
}

function policyFor(readOnly: boolean, serverId: string): ToolPolicyMetadata {
  return readOnly
    ? Object.freeze({ ...MCP_POLICY, riskTier: "low", sideEffect: "read", approval: "never", requiresApproval: false, scope: `mcp:${serverId}:read` })
    : Object.freeze({ ...MCP_POLICY, scope: `mcp:${serverId}:execute` });
}

export function adaptMcpTools(input: McpToolAdapterInput): ToolDefinition[] {
  if (!SERVER_ID.test(input.serverId)) throw new McpProtocolError("server_id_invalid", "MCP server id is invalid");
  const names = new Set<string>();
  const readOnly = new Set(input.readOnlyTools ?? []);
  const tools: ToolDefinition[] = [];
  for (const descriptor of input.descriptors) {
    if (!descriptor || typeof descriptor.name !== "string" || !descriptor.name.trim()) throw new McpProtocolError("tool_descriptor_invalid", "MCP tool descriptor is invalid");
    const normalized = normalizeMcpToolName(descriptor.name);
    const exportedName = mcpToolName(input.serverId, descriptor.name);
    if (names.has(exportedName)) throw new McpProtocolError("tool_collision", "MCP tool name collision after normalization");
    names.add(exportedName);
    validateSchema(descriptor.inputSchema);
    const readOnlyTool = readOnly.has(descriptor.name);
    const policy = policyFor(readOnlyTool, input.serverId);
    const tool: ToolDefinition = {
      declaration: {
        name: exportedName,
        description: typeof descriptor.description === "string" ? descriptor.description.slice(0, 4_000) : `MCP tool ${normalized}`,
        parameters: descriptor.inputSchema as never,
      },
      execute: async (args, params) => {
        try {
          return boundedResult(await input.client.callTool(descriptor.name, args, params?.signal));
        } catch {
          return { available: false, executed: false, code: "mcp_call_failed", manual_fallback: true };
        }
      },
      policy,
      toolset: "mcp",
      scope: policy.scope,
      provenance: { source: "mcp", serverId: input.serverId, toolName: descriptor.name, ...(input.provenance ? { config: input.provenance } : {}) },
      summarize: (result) => result.available === false ? "MCP tool unavailable" : "MCP result received",
    };
    tools.push(tool);
  }
  return tools;
}

export const createMcpToolAdapters = adaptMcpTools;

export function createMcpToolSource(options: McpToolSourceOptions): McpToolSource {
  const clients = new Set<McpClient>();
  return {
    async discover(input) {
      const discovered: ToolDefinition[] = [];
      const names = new Set<string>();
      for (const server of options.servers) {
        const client = (options.clientFactory ?? createMcpClient)(server);
        clients.add(client);
        try {
          await client.initialize(input.signal);
          const tools = adaptMcpTools({ serverId: server.id, client, descriptors: await client.listTools(input.signal), provenance: server.transport, readOnlyTools: server.readOnlyTools });
          for (const tool of tools) {
            if (names.has(tool.declaration.name)) throw new McpProtocolError("tool_collision", "MCP tool name collision in the canonical registry");
            names.add(tool.declaration.name);
            discovered.push(tool);
          }
        } catch {
          clients.delete(client);
          await client.close();
          // A discovery failure must not leak a partial registry view.
          await Promise.all([...clients].map(async (active) => { try { await active.close(); } catch { /* cleanup is best effort */ } }));
          clients.clear();
          return Object.freeze([]);
        }
      }
      return Object.freeze(discovered);
    },
    async close() {
      const active = [...clients];
      clients.clear();
      await Promise.all(active.map(async (client) => { try { await client.close(); } catch { /* cleanup is best effort */ } }));
    },
  };
}
