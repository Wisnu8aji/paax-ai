/**
 * Server-only gateway preparation client. This module is imported only by the
 * Next server route; credentials are read from the server process and are
 * never derived from a browser payload or returned in the response.
 */
import {
  GatewayTurnPreparedSchema,
  type GatewayTurnPrepared,
  type GatewayTurnRequest,
} from "@paax/schemas";
import { getPortableServiceKey } from "@/lib/portable-service-auth";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

export class GatewayClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "GatewayClientError";
  }
}

function timeoutMs(): number {
  const parsed = Number(process.env.PAAX_GATEWAY_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.floor(parsed), MAX_TIMEOUT_MS);
}

function errorCode(status: number): string {
  if (status === 400) return "invalid_request";
  if (status === 401) return "auth_failed";
  if (status === 403) return "binding_forbidden";
  if (status === 409) return "binding_conflict";
  if (status === 413) return "request_too_large";
  if (status === 503) return "profile_unavailable";
  return "gateway_unavailable";
}

function serviceUrl(): string {
  return process.env.AI_ORCHESTRATOR_URL?.trim().replace(/\/+$/, "") || "";
}

function combinedSignal(externalSignal?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abort);
    },
  };
}

export async function prepareGatewayTurn(
  request: GatewayTurnRequest,
  options: {
    requestHeaders?: Headers;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<GatewayTurnPrepared> {
  const baseUrl = serviceUrl();
  const key = getPortableServiceKey();
  if (!baseUrl || !key) {
    throw new GatewayClientError("Gateway service unavailable", 503, "gateway_unavailable");
  }

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("X-Internal-Key", key);
  const userId = options.requestHeaders?.get("x-user-id") || process.env.PAAX_PORTABLE_ACTOR_ID?.trim();
  if (userId) headers.set("X-User-Id", userId);
  const correlationId = request.clientCorrelationId || options.requestHeaders?.get("x-correlation-id");
  if (correlationId) headers.set("X-Correlation-Id", correlationId);

  const combined = combinedSignal(options.signal);
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/gateway/command-room/turn/prepare`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: combined.signal,
    });
  } catch {
    throw new GatewayClientError("Gateway service unavailable", 503, "gateway_unavailable");
  } finally {
    combined.dispose();
  }

  if (!response.ok) {
    throw new GatewayClientError("Gateway service unavailable", response.status, errorCode(response.status));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GatewayClientError("Gateway returned an invalid response", 502, "invalid_gateway_response");
  }
  const parsed = GatewayTurnPreparedSchema.safeParse(payload);
  if (!parsed.success) {
    throw new GatewayClientError("Gateway returned an invalid response", 502, "invalid_gateway_response");
  }
  return parsed.data;
}

interface GatewayStreamOptions {
  requestHeaders?: Headers;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function serviceRequestHeaders(request: GatewayTurnRequest, options: GatewayStreamOptions, key: string): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("X-Internal-Key", key);
  const userId = options.requestHeaders?.get("x-user-id") || process.env.PAAX_PORTABLE_ACTOR_ID?.trim();
  if (userId) headers.set("X-User-Id", userId);
  const correlationId = request.clientCorrelationId || options.requestHeaders?.get("x-correlation-id");
  if (correlationId) headers.set("X-Correlation-Id", correlationId);
  return headers;
}

function pipeGatewayStream(response: Response, dispose: () => void): Response {
  if (!response.body) {
    dispose();
    throw new GatewayClientError("Gateway stream unavailable", 502, "invalid_gateway_response");
  }
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          dispose();
          controller.close();
        } else controller.enqueue(chunk.value);
      } catch {
        dispose();
        controller.error(new GatewayClientError("Gateway stream unavailable", 503, "gateway_unavailable"));
      }
    },
    async cancel(reason) {
      dispose();
      await reader.cancel(reason);
    },
  });
  const headers = new Headers();
  for (const name of ["content-type", "cache-control", "connection"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(body, { status: response.status, headers });
}

export async function streamGatewayTurn(request: GatewayTurnRequest, options: GatewayStreamOptions = {}): Promise<Response> {
  const baseUrl = serviceUrl();
  const key = getPortableServiceKey();
  if (!baseUrl || !key) throw new GatewayClientError("Gateway service unavailable", 503, "gateway_unavailable");
  const combined = combinedSignal(options.signal);
  try {
    const response = await (options.fetchImpl ?? fetch)(`${baseUrl}/gateway/command-room/turn/stream`, {
      method: "POST",
      headers: serviceRequestHeaders(request, options, key),
      body: JSON.stringify(request),
      signal: combined.signal,
    });
    if (!response.ok) {
      combined.dispose();
      throw new GatewayClientError("Gateway service unavailable", response.status, errorCode(response.status));
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/event-stream")) {
      combined.dispose();
      throw new GatewayClientError("Gateway returned an invalid stream", 502, "invalid_gateway_response");
    }
    return pipeGatewayStream(response, combined.dispose);
  } catch (error) {
    if (error instanceof GatewayClientError) throw error;
    combined.dispose();
    throw new GatewayClientError("Gateway service unavailable", 503, "gateway_unavailable");
  }
}

export interface GatewayApprovalInput {
  approvalId: string;
  sessionId: string;
  decision: "approved" | "denied";
  note?: string;
}

export interface GatewayApprovalResult {
  ok: true;
  approvalId: string;
  decision: "approved" | "denied";
}

export async function resolveGatewayApproval(input: GatewayApprovalInput, options: GatewayStreamOptions = {}): Promise<GatewayApprovalResult> {
  const baseUrl = serviceUrl();
  const key = getPortableServiceKey();
  if (!baseUrl || !key) throw new GatewayClientError("Gateway service unavailable", 503, "gateway_unavailable");
  const combined = combinedSignal(options.signal);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${baseUrl}/gateway/command-room/approval/resolve`, {
      method: "POST",
      headers: serviceRequestHeaders(input as unknown as GatewayTurnRequest, options, key),
      body: JSON.stringify(input),
      signal: combined.signal,
    });
  } catch {
    combined.dispose();
    throw new GatewayClientError("Gateway service unavailable", 503, "gateway_unavailable");
  } finally {
    combined.dispose();
  }
  if (!response.ok) throw new GatewayClientError("Gateway approval unavailable", response.status, errorCode(response.status));
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new GatewayClientError("Gateway returned an invalid approval response", 502, "invalid_gateway_response"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new GatewayClientError("Gateway returned an invalid approval response", 502, "invalid_gateway_response");
  const result = payload as Record<string, unknown>;
  if (result.ok !== true || result.approvalId !== input.approvalId || (result.decision !== "approved" && result.decision !== "denied")) throw new GatewayClientError("Gateway returned an invalid approval response", 502, "invalid_gateway_response");
  return { ok: true, approvalId: result.approvalId, decision: result.decision };
}
