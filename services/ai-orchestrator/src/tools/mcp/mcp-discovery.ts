import type { McpServerConfig } from "./types";
import { parseMcpServers, type McpConfigOptions } from "./config";

export interface McpDiscoveryOptions extends McpConfigOptions {
  readonly includeDefaultPaaxServers?: boolean;
  readonly coreEngineUrl?: string;
  readonly documentIntelligenceUrl?: string;
  readonly dbApiUrl?: string;
  readonly siteAgentUrl?: string;
}

/**
 * Discovers available MCP servers from environment variables, configuration strings,
 * or standard PAAX service URLs.
 */
export function discoverMcpServers(
  env: NodeJS.ProcessEnv = process.env,
  options: McpDiscoveryOptions = {},
): readonly McpServerConfig[] {
  const discovered: McpServerConfig[] = [];
  const registeredIds = new Set<string>();

  // 1. Explicit PAAX_MCP_SERVERS json config
  if (env.PAAX_MCP_SERVERS) {
    try {
      const parsed = parseMcpServers(env.PAAX_MCP_SERVERS, options);
      for (const s of parsed) {
        if (!registeredIds.has(s.id)) {
          discovered.push(s);
          registeredIds.add(s.id);
        }
      }
    } catch {
      // ignore parsing errors from malformed env during discovery
    }
  }

  // 2. Default PAAX microservices discovery
  if (options.includeDefaultPaaxServers !== false) {
    const coreEngineUrl = options.coreEngineUrl ?? env.CORE_ENGINE_URL ?? "http://localhost:8000";
    if (isValidHttpUrl(coreEngineUrl) && !registeredIds.has("core-engine")) {
      discovered.push({
        transport: "http",
        id: "core-engine",
        url: `${coreEngineUrl.replace(/\/+$/, "")}/mcp`,
        headers: {},
        allowedHosts: ["localhost", "127.0.0.1"],
      });
      registeredIds.add("core-engine");
    }

    const docIntelUrl = options.documentIntelligenceUrl ?? env.DOCUMENT_INTELLIGENCE_URL ?? "http://localhost:8002";
    if (isValidHttpUrl(docIntelUrl) && !registeredIds.has("document-intelligence")) {
      discovered.push({
        transport: "http",
        id: "document-intelligence",
        url: `${docIntelUrl.replace(/\/+$/, "")}/mcp`,
        headers: {},
        allowedHosts: ["localhost", "127.0.0.1"],
      });
      registeredIds.add("document-intelligence");
    }

    const dbApiUrl = options.dbApiUrl ?? env.DB_API_URL ?? "http://localhost:8001";
    if (isValidHttpUrl(dbApiUrl) && !registeredIds.has("paax-db")) {
      discovered.push({
        transport: "http",
        id: "paax-db",
        url: `${dbApiUrl.replace(/\/+$/, "")}/mcp`,
        headers: {},
        allowedHosts: ["localhost", "127.0.0.1"],
      });
      registeredIds.add("paax-db");
    }
  }

  return Object.freeze(discovered);
}

function isValidHttpUrl(candidate: string): boolean {
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
