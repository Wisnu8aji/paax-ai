import type { ToolDefinition } from "../types";

export interface McpLimits {
  readonly timeoutMs: number;
  readonly maxFrameBytes: number;
  readonly maxBodyBytes: number;
}

export type McpServerConfig =
  | {
      readonly transport: "stdio";
      readonly id: string;
      readonly command: string;
      readonly args: readonly string[];
      readonly env: Readonly<Record<string, string>>;
      readonly allowedCommands?: readonly string[];
      readonly readOnlyTools?: readonly string[];
      readonly limits?: McpLimits;
    }
  | {
      readonly transport: "http";
      readonly id: string;
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
      readonly allowedHosts?: readonly string[];
      readonly allowedRedirectHosts?: readonly string[];
      readonly readOnlyTools?: readonly string[];
      readonly limits?: McpLimits;
    };

export interface McpToolDescriptor {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface McpCallResult {
  readonly content?: readonly unknown[];
  readonly structuredContent?: Readonly<Record<string, unknown>>;
  readonly isError?: boolean;
  readonly [key: string]: unknown;
}

export interface McpClient {
  initialize(signal?: AbortSignal): Promise<void>;
  listTools(signal?: AbortSignal): Promise<readonly McpToolDescriptor[]>;
  callTool(name: string, args: unknown, signal?: AbortSignal): Promise<McpCallResult>;
  close(): Promise<void>;
}

export interface McpClientOptions {
  readonly timeoutMs?: number;
  readonly maxFrameBytes?: number;
  readonly maxBodyBytes?: number;
  readonly allowedHosts?: readonly string[];
  readonly allowedRedirectHosts?: readonly string[];
  readonly fetchImpl?: typeof fetch;
}

export interface McpToolSource {
  discover(input: { signal?: AbortSignal }): Promise<readonly ToolDefinition[]>;
  close?(): Promise<void>;
}

export interface McpToolAdapterInput {
  readonly serverId: string;
  readonly client: McpClient;
  readonly descriptors: readonly McpToolDescriptor[];
  readonly provenance?: string;
  readonly readOnlyTools?: readonly string[];
}

export interface McpToolSourceOptions {
  readonly servers: readonly McpServerConfig[];
  readonly clientFactory?: (config: McpServerConfig) => McpClient;
}

export class McpProtocolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "McpProtocolError";
  }
}
