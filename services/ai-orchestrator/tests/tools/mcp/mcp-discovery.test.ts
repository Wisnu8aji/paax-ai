import { describe, expect, it } from "vitest";
import { discoverMcpServers } from "../../../src/tools/mcp/mcp-discovery";

describe("PAAX MCP Discovery (paax-mcp)", () => {
  it("discovers standard PAAX microservices endpoints", () => {
    const servers = discoverMcpServers({}, {
      coreEngineUrl: "http://localhost:8000",
      documentIntelligenceUrl: "http://localhost:8002",
      dbApiUrl: "http://localhost:8001",
    });

    expect(servers.length).toBeGreaterThanOrEqual(3);
    const ids = servers.map((s) => s.id);
    expect(ids).toContain("core-engine");
    expect(ids).toContain("document-intelligence");
    expect(ids).toContain("paax-db");
  });

  it("parses PAAX_MCP_SERVERS environment variable", () => {
    const customConfig = JSON.stringify([
      {
        transport: "http",
        id: "custom-site-mcp",
        url: "http://localhost:8005/mcp",
        headers: {},
      },
    ]);

    const servers = discoverMcpServers({ PAAX_MCP_SERVERS: customConfig }, { includeDefaultPaaxServers: false });
    expect(servers.length).toBe(1);
    expect(servers[0].id).toBe("custom-site-mcp");
  });
});
