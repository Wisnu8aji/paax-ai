import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { McpClient, McpClientOptions, McpCallResult, McpServerConfig, McpToolDescriptor } from "./types";
import { McpProtocolError } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_FRAME_BYTES = 256_000;
const DEFAULT_BODY_BYTES = 512_000;

function positive(value: number | undefined, fallback: number, max: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, max) : fallback;
}

function boundedOptions(config: McpServerConfig, options: McpClientOptions): Required<Pick<McpClientOptions, "timeoutMs" | "maxFrameBytes" | "maxBodyBytes">> & McpClientOptions {
  return {
    ...options,
    timeoutMs: positive(options.timeoutMs ?? config.limits?.timeoutMs, DEFAULT_TIMEOUT_MS, 120_000),
    maxFrameBytes: positive(options.maxFrameBytes ?? config.limits?.maxFrameBytes, DEFAULT_FRAME_BYTES, 2_000_000),
    maxBodyBytes: positive(options.maxBodyBytes ?? config.limits?.maxBodyBytes, DEFAULT_BODY_BYTES, 4_000_000),
  };
}

function protocol(code: string, message: string): McpProtocolError {
  return new McpProtocolError(code, message);
}

function jsonBytes(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { throw protocol("json_invalid", "MCP JSON payload is not serializable"); }
}

function responseId(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw protocol("response_id_invalid", "MCP response id is invalid");
  return value as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface RpcResponse {
  readonly id: number;
  readonly result?: unknown;
  readonly error?: unknown;
}

function parseRpcResponse(value: unknown): RpcResponse {
  if (!isRecord(value) || value.jsonrpc !== "2.0") throw protocol("response_invalid", "MCP JSON-RPC response is invalid");
  const id = responseId(value.id);
  if (value.error !== undefined && value.error !== null) return { id, error: true };
  return { id, result: value.result };
}

function makeAbortSignal(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; timedOut: () => boolean; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

function safeMethodParams(method: string, params: unknown): Record<string, unknown> {
  if (!/^[A-Za-z0-9_./:-]{1,128}$/u.test(method)) throw protocol("method_invalid", "MCP method is invalid");
  if (params === undefined) return {};
  if (!isRecord(params)) throw protocol("params_invalid", "MCP method parameters are invalid");
  return params;
}

function validateToolList(result: unknown): readonly McpToolDescriptor[] {
  if (!isRecord(result) || !Array.isArray(result.tools)) throw protocol("tools_list_invalid", "MCP tools/list result is invalid");
  return result.tools.map((item) => {
    if (!isRecord(item) || typeof item.name !== "string" || !item.name.trim() || !isRecord(item.inputSchema)) throw protocol("tool_descriptor_invalid", "MCP tool descriptor is invalid");
    return {
      name: item.name.slice(0, 128),
      ...(typeof item.description === "string" ? { description: item.description.slice(0, 4_000) } : {}),
      inputSchema: item.inputSchema,
    };
  });
}

function validateCallResult(result: unknown): McpCallResult {
  if (!isRecord(result)) throw protocol("call_result_invalid", "MCP tools/call result is invalid");
  return result as McpCallResult;
}

class StdioMcpClient implements McpClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private initialized = false;
  private closed = false;
  private failed: McpProtocolError | undefined;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>();

  constructor(private readonly config: Extract<McpServerConfig, { transport: "stdio" }>, private readonly options: ReturnType<typeof boundedOptions>) {}

  async initialize(signal?: AbortSignal): Promise<void> {
    this.ensureOpen();
    if (this.initialized) return;
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "paax-command-room-worker", version: "phase5" },
    }, signal);
    this.initialized = true;
    await this.notify("notifications/initialized", {});
  }

  async listTools(signal?: AbortSignal): Promise<readonly McpToolDescriptor[]> {
    this.ensureInitialized();
    return validateToolList(await this.request("tools/list", {}, signal));
  }

  async callTool(name: string, args: unknown, signal?: AbortSignal): Promise<McpCallResult> {
    this.ensureInitialized();
    if (!/^[A-Za-z0-9_.:/-]{1,128}$/u.test(name)) throw protocol("tool_name_invalid", "MCP tool name is invalid");
    if (jsonBytes(args) > this.options.maxBodyBytes) throw protocol("request_too_large", "MCP tool arguments exceed the limit");
    return validateCallResult(await this.request("tools/call", { name, arguments: isRecord(args) ? args : {} }, signal));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const error = protocol("closed", "MCP client is closed");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    const child = this.child;
    this.child = undefined;
    if (child && !child.killed) {
      try { child.kill(); } catch { /* cleanup is best effort */ }
    }
  }

  private ensureOpen(): void {
    if (this.closed) throw protocol("closed", "MCP client is closed");
    if (this.failed) throw this.failed;
    if (this.child) return;
    try {
      const child = spawn(this.config.command, [...this.config.args], {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...this.config.env } as NodeJS.ProcessEnv,
      });
      this.child = child;
      child.stdout.on("data", (chunk: unknown) => this.consume(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(String(chunk), "utf8")));
      child.stdout.on("error", () => this.fail(protocol("stdout_failed", "MCP stdio output failed")));
      child.on("error", () => this.fail(protocol("process_failed", "MCP stdio process failed")));
      child.on("close", () => {
        if (!this.closed) this.fail(protocol("process_closed", "MCP stdio process closed unexpectedly"));
      });
    } catch {
      throw protocol("spawn_failed", "MCP stdio process could not be started");
    }
  }

  private ensureInitialized(): void {
    this.ensureOpen();
    if (!this.initialized) throw protocol("not_initialized", "MCP client is not initialized");
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    this.ensureOpen();
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params });
    if (Buffer.byteLength(payload, "utf8") > this.options.maxFrameBytes) throw protocol("request_too_large", "MCP notification exceeds the frame limit");
    await new Promise<void>((resolve, reject) => {
      try { this.child!.stdin.write(`${payload}\n`, "utf8", () => resolve()); } catch { reject(protocol("write_failed", "MCP stdio request failed")); }
    });
  }

  private request(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    this.ensureOpen();
    safeMethodParams(method, params);
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    if (Buffer.byteLength(payload, "utf8") > this.options.maxFrameBytes) return Promise.reject(protocol("request_too_large", "MCP request exceeds the frame limit"));
    const timeout = makeAbortSignal(signal, this.options.timeoutMs);
    return new Promise<unknown>((resolve, reject) => {
      const abort = () => {
        this.pending.delete(id);
        const error = timeout.timedOut() ? protocol("timeout", "MCP request timed out") : protocol("aborted", "MCP request was aborted");
        reject(error);
        void this.close();
      };
      if (timeout.signal.aborted) { timeout.cleanup(); abort(); return; }
      timeout.signal.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        resolve: (value) => { timeout.cleanup(); timeout.signal.removeEventListener("abort", abort); resolve(value); },
        reject: (error) => { timeout.cleanup(); timeout.signal.removeEventListener("abort", abort); reject(error); },
      });
      try { this.child!.stdin.write(`${payload}\n`, "utf8"); } catch {
        this.pending.delete(id);
        timeout.cleanup();
        timeout.signal.removeEventListener("abort", abort);
        reject(protocol("write_failed", "MCP stdio request failed"));
      }
    });
  }

  private consume(chunk: Buffer): void {
    if (this.closed) return;
    this.buffer = Buffer.from(`${this.buffer.toString("binary")}${chunk.toString("binary")}`, "binary");
    if (this.buffer.length > this.options.maxFrameBytes * 2) { this.fail(protocol("frame_too_large", "MCP stdio output exceeds the frame limit")); return; }
    while (this.buffer.length > 0) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      const framed = /^content-length\s*:/iu.test(this.buffer.subarray(0, Math.min(this.buffer.length, 128)).toString("ascii"));
      if (framed) {
        if (headerEnd < 0) {
          if (this.buffer.length > this.options.maxFrameBytes) this.fail(protocol("frame_too_large", "MCP frame header exceeds the limit"));
          return;
        }
        const headers = this.buffer.subarray(0, headerEnd).toString("ascii");
        const match = /^content-length\s*:\s*(\d+)\s*$/imu.exec(headers);
        if (!match) { this.fail(protocol("frame_invalid", "MCP frame header is invalid")); return; }
        const length = Number(match[1]);
        if (!Number.isSafeInteger(length) || length > this.options.maxFrameBytes) { this.fail(protocol("frame_too_large", "MCP frame exceeds the limit")); return; }
        const start = headerEnd + 4;
        if (this.buffer.length < start + length) return;
        const frame = this.buffer.subarray(start, start + length).toString("utf8");
        this.buffer = this.buffer.subarray(start + length);
        this.dispatch(frame);
        continue;
      }
      const newline = this.buffer.indexOf(0x0a);
      if (newline < 0) {
        if (this.buffer.length > this.options.maxFrameBytes) this.fail(protocol("frame_too_large", "MCP line frame exceeds the limit"));
        return;
      }
      const frameBuffer = this.buffer.subarray(0, newline);
      this.buffer = this.buffer.subarray(newline + 1);
      if (frameBuffer.length > this.options.maxFrameBytes) { this.fail(protocol("frame_too_large", "MCP line frame exceeds the limit")); return; }
      const frame = frameBuffer.toString("utf8").trim();
      if (frame) this.dispatch(frame);
    }
  }

  private dispatch(frame: string): void {
    let parsed: unknown;
    try { parsed = JSON.parse(frame); } catch { this.fail(protocol("json_invalid", "MCP response is malformed JSON")); return; }
    let response: RpcResponse;
    try { response = parseRpcResponse(parsed); } catch (error) { this.fail(error instanceof McpProtocolError ? error : protocol("response_invalid", "MCP response is invalid")); return; }
    const pending = this.pending.get(response.id);
    if (!pending) { this.fail(protocol("response_id_mismatch", "MCP response id did not match a pending request")); return; }
    this.pending.delete(response.id);
    if (response.error !== undefined) pending.reject(protocol("server_error", "MCP server returned an error"));
    else pending.resolve(response.result);
  }

  private fail(error: McpProtocolError): void {
    if (this.failed || this.closed) return;
    this.failed = error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    const child = this.child;
    this.child = undefined;
    try { child?.kill(); } catch { /* cleanup is best effort */ }
  }
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/gu, "");
}

function allowedHost(url: URL, allowlist: readonly string[]): boolean {
  return new Set((allowlist.length ? allowlist : ["localhost", "127.0.0.1", "::1"]).map(normalizeHost)).has(normalizeHost(url.hostname));
}

function safeHttpUrl(value: string, allowlist: readonly string[]): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw protocol("url_invalid", "MCP HTTP URL is invalid"); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.hash || !allowedHost(url, allowlist)) throw protocol("host_not_allowed", "MCP HTTP host is not allowed");
  return url;
}

async function boundedResponseBody(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > maxBytes) throw protocol("body_too_large", "MCP HTTP response exceeds the body limit");
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw protocol("body_too_large", "MCP HTTP response exceeds the body limit");
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = "";
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw protocol("body_too_large", "MCP HTTP response exceeds the body limit");
      output += decoder.decode(next.value, { stream: true });
    }
  } finally {
    try { await reader.cancel(); } catch { /* cleanup is best effort */ }
  }
  output += decoder.decode();
  return output;
}

class HttpMcpClient implements McpClient {
  private initialized = false;
  private closed = false;
  private nextId = 1;
  private readonly fetchImpl: typeof fetch;
  private readonly allowedHosts: readonly string[];
  private readonly allowedRedirectHosts: readonly string[];

  constructor(private readonly config: Extract<McpServerConfig, { transport: "http" }>, private readonly options: ReturnType<typeof boundedOptions>) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.allowedHosts = options.allowedHosts ?? config.allowedHosts ?? ["localhost", "127.0.0.1", "::1"];
    this.allowedRedirectHosts = options.allowedRedirectHosts ?? config.allowedRedirectHosts ?? this.allowedHosts;
    for (const [name, value] of Object.entries(config.headers)) if (/authorization|cookie|token|secret|password|api[_-]?key/iu.test(name) || /bearer|basic/iu.test(value)) throw protocol("header_not_allowed", "MCP credential-bearing headers are not accepted");
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    this.ensureOpen();
    if (this.initialized) return;
    await this.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "paax-command-room-worker", version: "phase5" } }, signal);
    this.initialized = true;
    await this.notify("notifications/initialized", {}, signal);
  }

  async listTools(signal?: AbortSignal): Promise<readonly McpToolDescriptor[]> {
    this.ensureInitialized();
    return validateToolList(await this.request("tools/list", {}, signal));
  }

  async callTool(name: string, args: unknown, signal?: AbortSignal): Promise<McpCallResult> {
    this.ensureInitialized();
    if (!/^[A-Za-z0-9_.:/-]{1,128}$/u.test(name)) throw protocol("tool_name_invalid", "MCP tool name is invalid");
    if (jsonBytes(args) > this.options.maxBodyBytes) throw protocol("request_too_large", "MCP tool arguments exceed the limit");
    return validateCallResult(await this.request("tools/call", { name, arguments: isRecord(args) ? args : {} }, signal));
  }

  async close(): Promise<void> { this.closed = true; }

  private ensureOpen(): void { if (this.closed) throw protocol("closed", "MCP client is closed"); }
  private ensureInitialized(): void { this.ensureOpen(); if (!this.initialized) throw protocol("not_initialized", "MCP client is not initialized"); }

  private async notify(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
    const timeout = makeAbortSignal(signal, this.options.timeoutMs);
    try {
      await this.fetchJson({ method, params }, timeout.signal, false);
    } catch (error) {
      if (error instanceof McpProtocolError) throw error;
      throw protocol(timeout.timedOut() ? "timeout" : "aborted", timeout.timedOut() ? "MCP request timed out" : "MCP request failed");
    } finally { timeout.cleanup(); }
  }

  private async request(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const timeout = makeAbortSignal(signal, this.options.timeoutMs);
    try {
      const response = await this.fetchJson({ method, params }, timeout.signal, true);
      if (response.id !== this.nextId - 1) throw protocol("response_id_mismatch", "MCP response id did not match the request");
      if (response.error !== undefined) throw protocol("server_error", "MCP server returned an error");
      return response.result;
    } catch (error) {
      if (error instanceof McpProtocolError) throw error;
      throw protocol(timeout.timedOut() ? "timeout" : (timeout.signal.aborted ? "aborted" : "request_failed"), timeout.timedOut() ? "MCP request timed out" : "MCP HTTP request failed");
    } finally { timeout.cleanup(); }
  }

  private async fetchJson(payload: { method: string; params: Record<string, unknown> }, signal: AbortSignal, withId: boolean): Promise<RpcResponse> {
    const id = withId ? this.nextId++ : undefined;
    const body = JSON.stringify({ jsonrpc: "2.0", ...(id !== undefined ? { id } : {}), method: payload.method, params: payload.params });
    if (Buffer.byteLength(body, "utf8") > this.options.maxBodyBytes) throw protocol("request_too_large", "MCP HTTP request exceeds the body limit");
    let url = safeHttpUrl(this.config.url, this.allowedHosts);
    for (let redirect = 0; redirect <= 1; redirect += 1) {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...this.config.headers },
        body,
        redirect: "manual",
        signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect >= 1) throw protocol("redirect_denied", "MCP HTTP redirect is not allowed");
        const next = safeHttpUrl(new URL(location, url).toString(), this.allowedRedirectHosts);
        url = next;
        continue;
      }
      if (!response.ok) throw protocol("http_status", "MCP HTTP request failed");
      const bodyText = await boundedResponseBody(response, this.options.maxBodyBytes);
      if (!withId && !bodyText.trim()) return { id: 0, result: undefined };
      let parsed: unknown;
      try { parsed = JSON.parse(bodyText); } catch (error) { if (error instanceof McpProtocolError) throw error; throw protocol("json_invalid", "MCP HTTP response is malformed JSON"); }
      if (!withId && isRecord(parsed) && parsed.jsonrpc === "2.0" && parsed.id === undefined) return { id: 0, result: parsed.result };
      return parseRpcResponse(parsed);
    }
    throw protocol("redirect_denied", "MCP HTTP redirect is not allowed");
  }
}

export function createStdioMcpClient(config: Extract<McpServerConfig, { transport: "stdio" }>, options: McpClientOptions = {}): McpClient {
  if (!config.command || !Array.isArray(config.args)) throw protocol("config_invalid", "MCP stdio configuration is invalid");
  return new StdioMcpClient(config, boundedOptions(config, options));
}

export function createHttpMcpClient(config: Extract<McpServerConfig, { transport: "http" }>, options: McpClientOptions = {}): McpClient {
  if (!config.url || !config.headers) throw protocol("config_invalid", "MCP HTTP configuration is invalid");
  return new HttpMcpClient(config, boundedOptions(config, options));
}

export function createMcpClient(config: McpServerConfig, options: McpClientOptions = {}): McpClient {
  return config.transport === "stdio" ? createStdioMcpClient(config, options) : createHttpMcpClient(config, options);
}
