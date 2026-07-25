import type { GeminiFunctionDeclaration } from "../gemini/types";

/**
 * Tool declarations di registry.ts ditulis dalam format Gemini (type: "OBJECT"/"STRING"/dst,
 * huruf besar). OpenRouter (OpenAI-compatible) dan Anthropic Messages API keduanya memakai
 * JSON Schema standar (type: "object"/"string", huruf kecil). Konversi di sini supaya
 * registry tool tidak perlu ditulis dua kali per provider.
 */
const TYPE_MAP: Record<string, string> = {
  OBJECT: "object",
  STRING: "string",
  NUMBER: "number",
  INTEGER: "integer",
  BOOLEAN: "boolean",
  ARRAY: "array",
};

function convertSchema(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const source = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "type" && typeof value === "string") {
      result.type = TYPE_MAP[value] ?? value.toLowerCase();
    } else if (key === "properties" && value && typeof value === "object") {
      const props: Record<string, unknown> = {};
      for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
        props[propKey] = convertSchema(propValue);
      }
      result.properties = props;
    } else if (key === "items") {
      result.items = convertSchema(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface JsonSchemaTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function toJsonSchemaTool(declaration: GeminiFunctionDeclaration): JsonSchemaTool {
  return {
    name: declaration.name,
    description: declaration.description,
    parameters: convertSchema(declaration.parameters) as Record<string, unknown>,
  };
}

/** Format OpenRouter/OpenAI-compatible: {type: "function", function: {...}}. */
export function toOpenRouterTool(declaration: GeminiFunctionDeclaration): Record<string, unknown> {
  return {
    type: "function",
    function: toJsonSchemaTool(declaration),
  };
}

/** Format Anthropic Messages API: {name, description, input_schema}. */
export function toAnthropicTool(declaration: GeminiFunctionDeclaration): Record<string, unknown> {
  const { name, description, parameters } = toJsonSchemaTool(declaration);
  return { name, description, input_schema: parameters };
}
