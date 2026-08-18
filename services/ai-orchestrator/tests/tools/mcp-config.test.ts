import { describe, expect, it } from "vitest";
import { parseMcpServers } from "../../src/tools/mcp/config";

describe("strict MCP configuration", () => {
  it("keeps missing configuration disabled and validates exact command/host allowlists", () => {
    expect(parseMcpServers(undefined)).toEqual([]);
    expect(parseMcpServers(JSON.stringify([{ transport: "stdio", id: "fake", command: process.execPath, args: [], env: {} }]), { allowedCommands: [process.execPath] })).toMatchObject([{ id: "fake", transport: "stdio" }]);
    expect(() => parseMcpServers(JSON.stringify([{ transport: "stdio", id: "fake", command: `${process.execPath} && whoami`, args: [], env: {} }]), { allowedCommands: [process.execPath] })).toThrow(/command|allowlist|invalid/i);
    expect(() => parseMcpServers(JSON.stringify([{ transport: "http", id: "remote", url: "https://example.invalid/mcp", headers: {} }]), { allowedHosts: ["127.0.0.1"] })).toThrow(/host|allowlist/i);
  });

  it("rejects duplicates, unknown fields, and credential-shaped config without echoing values", () => {
    const secretLike = "fixture-not-a-real-secret";
    expect(() => parseMcpServers(JSON.stringify([
      { transport: "http", id: "one", url: "http://127.0.0.1/mcp", headers: { Authorization: `Bearer ${secretLike}` } },
    ]), { allowedHosts: ["127.0.0.1"] })).toThrow(/header|credential|secret/i);
    try {
      parseMcpServers(JSON.stringify([
        { transport: "stdio", id: "one", command: process.execPath, args: [], env: {} },
        { transport: "stdio", id: "one", command: process.execPath, args: [], env: {} },
      ]), { allowedCommands: [process.execPath] });
    } catch (error) {
      expect(String(error)).not.toContain(secretLike);
      expect(String(error)).toMatch(/duplicate/i);
    }
    expect(() => parseMcpServers(JSON.stringify([{ transport: "stdio", id: "bad", command: process.execPath, args: [], env: {}, extra: true }]), { allowedCommands: [process.execPath] })).toThrow(/field|unsupported|config/i);
  });
});
