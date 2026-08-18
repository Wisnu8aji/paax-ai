import { Buffer } from "node:buffer";
import type { SkillMetadata, SkillScope, SkillTrigger, SkillTrust } from "./types";

export interface ParsedSkillDocument {
  readonly metadata: SkillMetadata;
  readonly body: string;
  readonly metadataBytes: number;
  readonly bodyBytes: number;
}

export interface SkillParseLimits {
  readonly maxMetadataBytes?: number;
  readonly maxBodyBytes?: number;
}

export class SkillFormatError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SkillFormatError";
  }
}

const ALLOWED_FIELDS = new Set(["name", "version", "description", "scope", "trust", "trigger", "allowed_tools", "allowed_scopes", "pinned"]);
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,96}$/u;

function parseScalar(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new SkillFormatError("field_required", `skill field is empty: ${field}`);
  if ((trimmed.startsWith("\"") && !trimmed.endsWith("\"")) || (trimmed.startsWith("'") && !trimmed.endsWith("'"))) throw new SkillFormatError("malformed_scalar", `skill field is malformed: ${field}`);
  const unquoted = (trimmed.startsWith("\"") || trimmed.startsWith("'")) ? trimmed.slice(1, -1) : trimmed;
  if (!unquoted || unquoted.length > 512) throw new SkillFormatError("field_limit", `skill field exceeds limit: ${field}`);
  return unquoted;
}

function parseList(value: string, field: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) throw new SkillFormatError("malformed_list", `skill list is malformed: ${field}`);
  const body = trimmed.slice(1, -1).trim();
  if (!body) return [];
  const values = body.split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length > 64) throw new SkillFormatError("list_limit", `skill list exceeds limit: ${field}`);
  return values.map((item) => {
    const valueItem = parseScalar(item, field);
    if (!SAFE_TOKEN.test(valueItem)) throw new SkillFormatError("unsafe_list_item", `skill list item is unsafe: ${field}`);
    return valueItem;
  });
}

function parseBoolean(value: string, field: string): boolean {
  if (value.trim() === "true") return true;
  if (value.trim() === "false") return false;
  throw new SkillFormatError("malformed_boolean", `skill boolean is invalid: ${field}`);
}

function safeName(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,64}$/u.test(value) || value.includes("..")) throw new SkillFormatError("unsafe_name", "skill name is unsafe");
  return value;
}

function enumValue<T extends string>(value: string, values: readonly T[], field: string): T {
  if (!values.includes(value as T)) throw new SkillFormatError("invalid_enum", `skill field is invalid: ${field}`);
  return value as T;
}

export function parseSkillDocument(content: string, limits: SkillParseLimits = {}): ParsedSkillDocument {
  if (typeof content !== "string" || !content.startsWith("---\n")) throw new SkillFormatError("frontmatter_required", "SKILL.md frontmatter is required");
  const normalized = content.replace(/\r\n?/gu, "\n");
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) throw new SkillFormatError("frontmatter_unclosed", "SKILL.md frontmatter is not closed");
  const frontmatter = normalized.slice(4, closing);
  const body = normalized.slice(closing + "\n---\n".length);
  const metadataBytes = Buffer.byteLength(frontmatter, "utf8");
  const bodyBytes = Buffer.byteLength(body, "utf8");
  const maxMetadataBytes = limits.maxMetadataBytes ?? 16_000;
  const maxBodyBytes = limits.maxBodyBytes ?? 128_000;
  if (metadataBytes > maxMetadataBytes) throw new SkillFormatError("metadata_too_large", "skill metadata exceeds limit");
  if (bodyBytes > maxBodyBytes) throw new SkillFormatError("body_too_large", "skill body exceeds limit");
  if (/^\s*(?:run|exec|shell|command|script|hook|install)\s*:/imu.test(body)) throw new SkillFormatError("executable_directive", "skill body contains an executable directive");

  const values = new Map<string, string | string[] | boolean>();
  for (const line of frontmatter.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/u.exec(line);
    if (!match) throw new SkillFormatError("malformed_field", "skill metadata field is malformed");
    const [, key, rawValue] = match;
    if (!ALLOWED_FIELDS.has(key)) throw new SkillFormatError("unknown_field", `skill metadata field is unknown: ${key}`);
    if (values.has(key)) throw new SkillFormatError("duplicate_field", `skill metadata field is duplicated: ${key}`);
    if (key === "allowed_tools" || key === "allowed_scopes") values.set(key, parseList(rawValue, key));
    else if (key === "pinned") values.set(key, parseBoolean(rawValue, key));
    else values.set(key, parseScalar(rawValue, key));
  }

  const name = values.get("name");
  const version = values.get("version");
  const description = values.get("description");
  if (typeof name !== "string" || typeof version !== "string" || typeof description !== "string") throw new SkillFormatError("required_field", "skill name, version, and description are required");
  const metadata: SkillMetadata = Object.freeze({
    name: safeName(name),
    version: version.slice(0, 64),
    description,
    scope: enumValue(String(values.get("scope") ?? "project"), ["project", "user", "system"], "scope") as SkillScope,
    trust: enumValue(String(values.get("trust") ?? "untrusted"), ["trusted", "untrusted", "quarantined"], "trust") as SkillTrust,
    trigger: enumValue(String(values.get("trigger") ?? "manual"), ["manual", "explicit"], "trigger") as SkillTrigger,
    allowedTools: Object.freeze((values.get("allowed_tools") as string[] | undefined) ?? []),
    allowedScopes: Object.freeze((values.get("allowed_scopes") as string[] | undefined) ?? []),
    pinned: values.get("pinned") === true,
  });
  return Object.freeze({ metadata, body, metadataBytes, bodyBytes });
}
