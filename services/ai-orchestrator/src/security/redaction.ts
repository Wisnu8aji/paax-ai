import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, dirname } from "node:path";

const SECRET_KEY = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|credential)/i;
const SECRET_VALUE = /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential)\s*[:=]\s*)[^\s,;]+/gi;
const BEARER = /(authorization\s*:\s*bearer\s+)[^\s,;]+/gi;
const INJECTION = [/ignore\s+(?:all|previous|prior)\s+instructions/i, /system\s+prompt/i, /bypass\s+(?:approval|policy|security)/i];
const EXFILTRATION = [/reveal\s+(?:secret|token|password|key)/i, /(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]/i, /authorization\s*:\s*bearer/i];

export function redactText(value: string): string {
  return value.replace(BEARER, "$1[REDACTED]").replace(SECRET_VALUE, "$1[REDACTED]").slice(0, 16_000);
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.slice(0, 256).map((item) => redactValue(item, depth + 1));
  if (!value || typeof value !== "object") return "[UNSUPPORTED]";
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 256)) result[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactValue(child, depth + 1);
  return result;
}

export function scanSecurityContent(text: string): string[] {
  const findings: string[] = [];
  if (INJECTION.some((pattern) => pattern.test(text))) findings.push("prompt_injection");
  if (EXFILTRATION.some((pattern) => pattern.test(text))) findings.push("secret_exfiltration");
  return findings;
}

function contained(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${relativePath.includes("\\") ? "\\" : "/"}`) && !isAbsolute(relativePath));
}

/** Resolves a path under a runtime root and rejects traversal or symlink escape. */
export function assertContainedPath(root: string, target: string): string {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  if (!contained(rootPath, targetPath)) throw new Error("path escapes runtime root");
  let realRoot: string;
  try { realRoot = realpathSync(rootPath); } catch { throw new Error("runtime root is unavailable"); }
  if (existsSync(targetPath)) {
    let realTarget: string;
    try { realTarget = realpathSync(targetPath); } catch { throw new Error("path cannot be resolved safely"); }
    if (!contained(realRoot, realTarget)) throw new Error("path escapes runtime root through symlink");
  } else {
    const parent = dirname(targetPath);
    if (existsSync(parent)) {
      let realParent: string;
      try { realParent = realpathSync(parent); } catch { throw new Error("path cannot be resolved safely"); }
      if (!contained(realRoot, realParent)) throw new Error("path escapes runtime root through symlink");
    }
  }
  return targetPath;
}
