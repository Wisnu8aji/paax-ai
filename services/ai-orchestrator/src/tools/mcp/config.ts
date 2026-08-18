import { isAbsolute } from "node:path";
import type { McpLimits, McpServerConfig } from "./types";

export interface McpConfigOptions {
  readonly allowedCommands?: readonly string[];
  readonly allowedHosts?: readonly string[];
  readonly allowedRedirectHosts?: readonly string[];
  readonly defaultLimits?: Partial<McpLimits>;
}

export class McpConfigError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "McpConfigError";
  }
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/u;
const SENSITIVE_NAME_PATTERN = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|private[_-]?key|cookie)/iu;
const SAFE_HEADER_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,96}$/u;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"] as const;

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new McpConfigError("record_invalid", message);
  return value as Record<string, unknown>;
}

function boundedInteger(value: unknown, fallback: number, max: number, code: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > max) throw new McpConfigError(code, "MCP limit is invalid");
  return value as number;
}

function limits(value: unknown, defaults: Partial<McpLimits> | undefined): McpLimits | undefined {
  if (value === undefined && !defaults) return undefined;
  const input = value === undefined ? {} : record(value, "MCP limits must be an object");
  for (const key of Object.keys(input)) if (!["timeoutMs", "maxFrameBytes", "maxBodyBytes"].includes(key)) throw new McpConfigError("limits_field_unknown", "MCP limits contain an unsupported field");
  return Object.freeze({
    timeoutMs: boundedInteger(input.timeoutMs, defaults?.timeoutMs ?? 10_000, 120_000, "timeout_invalid"),
    maxFrameBytes: boundedInteger(input.maxFrameBytes, defaults?.maxFrameBytes ?? 256_000, 2_000_000, "frame_limit_invalid"),
    maxBodyBytes: boundedInteger(input.maxBodyBytes, defaults?.maxBodyBytes ?? 512_000, 4_000_000, "body_limit_invalid"),
  });
}

function safeString(value: unknown, code: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000\r\n]/u.test(value)) throw new McpConfigError(code, "MCP string value is invalid");
  return value.trim();
}

function safeStringArray(value: unknown, code: string, maxItems: number, maxItemLength: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new McpConfigError(code, "MCP string array is invalid");
  return Object.freeze(value.map((item) => safeString(item, code, maxItemLength)));
}

function allowedSet(values: readonly string[] | undefined, fallback: readonly string[]): Set<string> {
  return new Set((values && values.length > 0 ? values : fallback).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function normalizedHost(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/gu, "");
}

function validateHeaders(value: unknown): Readonly<Record<string, string>> {
  const input = record(value, "MCP headers must be an object");
  const result: Record<string, string> = {};
  for (const [name, raw] of Object.entries(input)) {
    if (!SAFE_HEADER_PATTERN.test(name) || SENSITIVE_NAME_PATTERN.test(name)) throw new McpConfigError("header_not_allowed", "MCP credential-bearing headers are not accepted in static configuration");
    const headerValue = safeString(raw, "header_invalid", 4_000);
    if (/^\s*(?:bearer|basic)\s+/iu.test(headerValue) || SENSITIVE_NAME_PATTERN.test(headerValue)) throw new McpConfigError("header_secret_like", "MCP header value is not accepted");
    result[name.toLowerCase()] = headerValue;
  }
  return Object.freeze(result);
}

function validateEnv(value: unknown): Readonly<Record<string, string>> {
  const input = record(value, "MCP environment must be an object");
  const result: Record<string, string> = {};
  for (const [name, raw] of Object.entries(input)) {
    if (!ENV_KEY_PATTERN.test(name) || SENSITIVE_NAME_PATTERN.test(name)) throw new McpConfigError("env_not_allowed", "MCP environment contains a credential-shaped key");
    result[name] = safeString(raw, "env_invalid", 4_000);
  }
  return Object.freeze(result);
}

function parseId(value: unknown): string {
  const id = safeString(value, "server_id_invalid", 64);
  if (!ID_PATTERN.test(id)) throw new McpConfigError("server_id_invalid", "MCP server id is invalid");
  return id;
}

function parseReadOnlyTools(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const tools = safeStringArray(value, "read_only_tools_invalid", 128, 128);
  if (tools.some((tool) => !ID_PATTERN.test(tool) && !/^[A-Za-z0-9_.:-]{1,128}$/u.test(tool))) throw new McpConfigError("read_only_tools_invalid", "MCP read-only tool allowlist contains an invalid name");
  return tools;
}

function rejectUnknown(input: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(input).some((key) => !allowedSet.has(key))) throw new McpConfigError("field_unknown", "MCP server configuration contains an unsupported field");
}

export function parseMcpServers(raw: string | undefined, options: McpConfigOptions = {}): readonly McpServerConfig[] {
  if (!raw || !raw.trim()) return Object.freeze([]);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new McpConfigError("json_invalid", "MCP server configuration is malformed"); }
  if (!Array.isArray(parsed) || parsed.length > 32) throw new McpConfigError("servers_invalid", "MCP server configuration must be a bounded array");

  const commandAllowlist = options.allowedCommands?.map((command) => command.trim()) ?? [];
  const hostAllowlist = allowedSet(options.allowedHosts, LOCAL_HOSTS);
  const redirectAllowlist = allowedSet(options.allowedRedirectHosts, [...hostAllowlist]);
  const ids = new Set<string>();
  const result: McpServerConfig[] = [];
  for (const item of parsed) {
    const input = record(item, "MCP server entry must be an object");
    const id = parseId(input.id);
    if (ids.has(id)) throw new McpConfigError("duplicate_server_id", "MCP server id is duplicated");
    ids.add(id);
    const transport = input.transport;
    const readOnlyTools = parseReadOnlyTools(input.readOnlyTools);
    const serverLimits = limits(input.limits, options.defaultLimits);
    if (transport === "stdio") {
      rejectUnknown(input, ["transport", "id", "command", "args", "env", "readOnlyTools", "limits"]);
      const command = safeString(input.command, "command_invalid", 2_000);
      if (!isAbsolute(command) || /[;&|`$<>\r\n]/u.test(command) || commandAllowlist.length === 0 || !commandAllowlist.includes(command)) throw new McpConfigError("command_not_allowed", "MCP stdio command is not in the exact allowlist");
      const args = safeStringArray(input.args, "args_invalid", 64, 8_000);
      result.push(Object.freeze({ transport: "stdio", id, command, args, env: validateEnv(input.env), allowedCommands: Object.freeze(commandAllowlist), ...(readOnlyTools ? { readOnlyTools } : {}), ...(serverLimits ? { limits: serverLimits } : {}) }));
      continue;
    }
    if (transport === "http") {
      rejectUnknown(input, ["transport", "id", "url", "headers", "readOnlyTools", "limits"]);
      const urlText = safeString(input.url, "url_invalid", 2_000);
      let url: URL;
      try { url = new URL(urlText); } catch { throw new McpConfigError("url_invalid", "MCP HTTP URL is invalid"); }
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !hostAllowlist.has(normalizedHost(url.hostname))) throw new McpConfigError("host_not_allowed", "MCP HTTP host is not in the exact allowlist");
      if (url.hash) throw new McpConfigError("url_invalid", "MCP HTTP URL must not include a fragment");
      // Validate the redirect allowlist even though the client uses manual redirect handling.
      if ([...redirectAllowlist].some((host) => !/^[a-z0-9.:[\]-]{1,255}$/u.test(host))) throw new McpConfigError("redirect_allowlist_invalid", "MCP redirect host allowlist is invalid");
      result.push(Object.freeze({ transport: "http", id, url: url.toString(), headers: validateHeaders(input.headers), allowedHosts: Object.freeze([...hostAllowlist]), allowedRedirectHosts: Object.freeze([...redirectAllowlist]), ...(readOnlyTools ? { readOnlyTools } : {}), ...(serverLimits ? { limits: serverLimits } : {}) }));
      continue;
    }
    throw new McpConfigError("transport_invalid", "MCP transport must be stdio or http");
  }
  return Object.freeze(result);
}

export function loadMcpConfig(env: NodeJS.ProcessEnv = process.env, options: McpConfigOptions = {}): readonly McpServerConfig[] {
  return parseMcpServers(env.PAAX_MCP_SERVERS, options);
}

export function redactMcpConfig(config: McpServerConfig): Record<string, unknown> {
  return config.transport === "stdio"
    ? { transport: config.transport, id: config.id, command: config.command, args: [...config.args] }
    : { transport: config.transport, id: config.id, url: config.url, headers: Object.keys(config.headers).map((name) => name.toLowerCase()) };
}
