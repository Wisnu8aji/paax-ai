import type { ProviderToolCall } from "../providers/base";
import { getToolPolicy } from "../tools/tool-policy";
import { scanToolThreats, type ToolThreatFinding } from "../tools/threat-patterns";
import type { ToolDefinition, ToolPolicyMetadata } from "../tools/types";

export interface ToolGuardInput {
  readonly registry: readonly ToolDefinition[];
  readonly call: ProviderToolCall;
  readonly allowedScopes?: readonly string[];
  readonly maxArgumentBytes?: number;
}

export interface ToolGuardSuccess {
  readonly ok: true;
  readonly tool: ToolDefinition;
  readonly policy: ToolPolicyMetadata;
}

export interface ToolGuardFailure {
  readonly ok: false;
  readonly errorCode: string;
  readonly message: string;
  readonly findings?: readonly ToolThreatFinding[];
}

export type ToolGuardResult = ToolGuardSuccess | ToolGuardFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(errorCode: string, message: string, findings?: readonly ToolThreatFinding[]): ToolGuardFailure {
  return { ok: false, errorCode, message, ...(findings && findings.length > 0 ? { findings } : {}) };
}

export function preflightToolCall(input: ToolGuardInput): ToolGuardResult {
  const call = input.call;
  if (!isRecord(call) || typeof call.id !== "string" || !call.id.trim() || typeof call.name !== "string" || !call.name.trim() || !isRecord(call.arguments)) {
    return fail("tool_call_invalid", "panggilan tool tidak valid");
  }
  const matching = input.registry.filter((tool) => tool.declaration.name === call.name);
  if (matching.length === 0) return fail("tool_not_registered", "tool belum terdaftar pada registry kanonik");
  if (matching.length > 1) return fail("tool_registry_collision", "nama tool duplikat pada registry kanonik");
  const tool = matching[0];
  const policy = getToolPolicy(tool);
  if (!policy.available) return fail("tool_unavailable", "tool tidak tersedia");
  const scope = tool.scope ?? policy.scope;
  if (scope && input.allowedScopes && input.allowedScopes.length > 0 && !input.allowedScopes.includes(scope)) {
    return fail("tool_scope_forbidden", "scope tool tidak diizinkan");
  }
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(call.arguments), "utf8");
  } catch {
    return fail("tool_arguments_invalid", "argumen tool tidak dapat diserialisasi");
  }
  const maxArgumentBytes = Math.max(256, Math.min(Math.floor(input.maxArgumentBytes ?? 32_000), 256_000));
  if (bytes > maxArgumentBytes) return fail("tool_arguments_too_large", "argumen tool melebihi batas");
  const findings = scanToolThreats(call.arguments);
  if (findings.length > 0) return fail(findings[0].code, "argumen tool ditolak oleh guardrail", findings);
  return { ok: true, tool, policy };
}
