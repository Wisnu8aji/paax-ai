import type { ToolDefinition } from "../types";
import { createMcpClient } from "./client";
import { adaptMcpTools } from "./adapter";
import type {
  McpClient,
  McpServerConfig,
  McpToolDescriptor,
} from "./types";

export interface McpServerStatus {
  readonly id: string;
  readonly transport: "stdio" | "http";
  readonly initialized: boolean;
  readonly toolsCount: number;
  readonly toolNames: readonly string[];
  readonly lastError?: string;
}

export interface McpRegistryOptions {
  readonly clientFactory?: (config: McpServerConfig) => McpClient;
}

export class McpRegistry {
  private readonly configs = new Map<string, McpServerConfig>();
  private readonly clients = new Map<string, McpClient>();
  private readonly descriptors = new Map<string, readonly McpToolDescriptor[]>();
  private readonly errors = new Map<string, string>();
  private readonly clientFactory: (config: McpServerConfig) => McpClient;

  constructor(options: McpRegistryOptions = {}) {
    this.clientFactory = options.clientFactory ?? ((config) => createMcpClient(config));
  }

  registerServer(config: McpServerConfig): this {
    this.configs.set(config.id, config);
    return this;
  }

  unregisterServer(serverId: string): boolean {
    const client = this.clients.get(serverId);
    if (client) {
      void client.close().catch(() => undefined);
      this.clients.delete(serverId);
    }
    this.descriptors.delete(serverId);
    this.errors.delete(serverId);
    return this.configs.delete(serverId);
  }

  getServerConfig(serverId: string): McpServerConfig | undefined {
    return this.configs.get(serverId);
  }

  listServers(): readonly McpServerStatus[] {
    const statuses: McpServerStatus[] = [];
    for (const config of this.configs.values()) {
      const toolList = this.descriptors.get(config.id) ?? [];
      statuses.push({
        id: config.id,
        transport: config.transport,
        initialized: this.clients.has(config.id),
        toolsCount: toolList.length,
        toolNames: toolList.map((t) => t.name),
        lastError: this.errors.get(config.id),
      });
    }
    return Object.freeze(statuses);
  }

  async initializeServer(serverId: string, signal?: AbortSignal): Promise<readonly ToolDefinition[]> {
    const config = this.configs.get(serverId);
    if (!config) throw new Error(`MCP server not registered: ${serverId}`);

    try {
      let client = this.clients.get(serverId);
      if (!client) {
        client = this.clientFactory(config);
        await client.initialize(signal);
        this.clients.set(serverId, client);
      }

      const toolDescriptors = await client.listTools(signal);
      this.descriptors.set(serverId, toolDescriptors);
      this.errors.delete(serverId);

      const adapted = adaptMcpTools({
        serverId: config.id,
        client,
        descriptors: toolDescriptors,
        readOnlyTools: config.readOnlyTools,
      });

      return adapted;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errors.set(serverId, msg);
      throw err;
    }
  }

  async initializeAll(signal?: AbortSignal): Promise<readonly ToolDefinition[]> {
    const allTools: ToolDefinition[] = [];
    for (const serverId of this.configs.keys()) {
      try {
        const tools = await this.initializeServer(serverId, signal);
        allTools.push(...tools);
      } catch {
        // Individual server failures do not prevent remaining servers from loading
      }
    }
    return Object.freeze(allTools);
  }

  async close(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
    this.clients.clear();
    this.descriptors.clear();
  }
}

export function createMcpRegistry(options?: McpRegistryOptions): McpRegistry {
  return new McpRegistry(options);
}
