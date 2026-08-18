import type { ProviderTool } from "../providers/base";
import { toJsonSchemaTool } from "./json-schema";
import { getToolPolicy } from "./tool-policy";
import type { ToolDefinition } from "./types";
import { selectTools, type ToolsetSelection } from "./toolsets";

export interface ProviderToolOptions {
  readonly selection?: ToolsetSelection;
  readonly allowedScopes?: readonly string[];
  readonly maxTools?: number;
  readonly maxSchemaBytes?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSchema(schema: unknown): asserts schema is Record<string, unknown> {
  if (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties)) throw new Error("provider tool schema must be an object schema");
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string" || !Object.prototype.hasOwnProperty.call(schema.properties, item))) {
      throw new Error("provider tool schema required fields are invalid");
    }
  }
}

function validateName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(name)) throw new Error("provider tool name is invalid");
}

export function toProviderTool(tool: ToolDefinition, options: ProviderToolOptions = {}): ProviderTool {
  const declaration = toJsonSchemaTool(tool.declaration);
  validateName(declaration.name);
  validateSchema(declaration.parameters);
  const maxSchemaBytes = Math.max(1, Math.min(Math.floor(options.maxSchemaBytes ?? 64_000), 256_000));
  if (Buffer.byteLength(JSON.stringify(declaration.parameters), "utf8") > maxSchemaBytes) throw new Error("provider tool schema exceeds configured size");
  return {
    name: declaration.name,
    description: declaration.description,
    inputSchema: declaration.parameters,
  };
}

export function toProviderTools(tools: readonly ToolDefinition[], options: ProviderToolOptions = {}): ProviderTool[] {
  if (options.maxTools !== undefined && (!Number.isInteger(options.maxTools) || options.maxTools <= 0)) return [];
  let selected = options.selection ? [...selectTools(tools, options.selection)] : [...tools];
  if (options.allowedScopes && options.allowedScopes.length > 0) {
    const scopes = new Set(options.allowedScopes);
    selected = selected.filter((tool) => {
      const scope = (tool as ToolDefinition & { scope?: string }).scope ?? getToolPolicy(tool).scope;
      return Boolean(scope && scopes.has(scope));
    });
  }
  selected = selected.filter((tool) => getToolPolicy(tool).available);
  if (options.maxTools !== undefined) selected = selected.slice(0, options.maxTools);
  const names = new Set<string>();
  return selected.map((tool) => {
    const name = tool.declaration.name;
    if (names.has(name)) throw new Error(`duplicate provider tool name: ${name}`);
    names.add(name);
    return toProviderTool(tool, options);
  });
}
