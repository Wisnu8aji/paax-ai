import { describe, expect, it, vi } from "vitest";
import { createMcpRegistry } from "../../../src/tools/mcp/mcp-registry";
import type { McpClient, McpServerConfig, McpToolDescriptor } from "../../../src/tools/mcp/types";

describe("PAAX MCP Registry (paax-mcp)", () => {
  const mockTools: readonly McpToolDescriptor[] = [
    {
      name: "calculate_volume",
      description: "Calculates concrete volume",
      inputSchema: { type: "object", properties: { length: { type: "number" } } },
    },
  ];

  const mockClient: McpClient = {
    initialize: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue(mockTools),
    callTool: vi.fn().mockResolvedValue({ content: ["result"] }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const sampleServerConfig: McpServerConfig = {
    transport: "http",
    id: "core-engine",
    url: "http://localhost:8000/mcp",
    headers: {},
    allowedHosts: ["localhost"],
  };

  it("registers servers and lists server status", () => {
    const registry = createMcpRegistry({ clientFactory: () => mockClient });
    registry.registerServer(sampleServerConfig);

    const servers = registry.listServers();
    expect(servers.length).toBe(1);
    expect(servers[0].id).toBe("core-engine");
    expect(servers[0].initialized).toBe(false);
  });

  it("initializes server and adapts tools into canonical ToolDefinitions", async () => {
    const registry = createMcpRegistry({ clientFactory: () => mockClient });
    registry.registerServer(sampleServerConfig);

    const tools = await registry.initializeServer("core-engine");
    expect(tools.length).toBe(1);
    expect(tools[0].declaration.name).toBe("mcp__core-engine__calculate_volume");

    const servers = registry.listServers();
    expect(servers[0].initialized).toBe(true);
    expect(servers[0].toolsCount).toBe(1);
  });

  it("closes all client connections cleanly", async () => {
    const registry = createMcpRegistry({ clientFactory: () => mockClient });
    registry.registerServer(sampleServerConfig);
    await registry.initializeServer("core-engine");

    await registry.close();
    expect(mockClient.close).toHaveBeenCalled();
  });
});
