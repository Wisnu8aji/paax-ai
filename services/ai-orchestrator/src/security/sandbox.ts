import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export type SandboxMode =
  | "full-access"
  | "read-only"
  | "restricted"
  | "elevated-deny";

export interface SandboxPolicyConfig {
  readonly mode: SandboxMode;
  readonly workspaceRoot: string;
  readonly allowedPaths?: readonly string[];
  readonly blockedPathPatterns?: readonly RegExp[];
  readonly allowSymlinks?: boolean;
  readonly blockedCommands?: readonly RegExp[];
}

export class SandboxSecurityError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SandboxSecurityError";
  }
}

export const DEFAULT_BLOCKED_PATH_PATTERNS: readonly RegExp[] = Object.freeze([
  /(?:^|[\\/])\.env(?:\.local|\.production|\.development)?$/i,
  /(?:^|[\\/])\.git[\\/]/i,
  /(?:^|[\\/])id_rsa(?:|\.pub)$/i,
  /(?:^|[\\/])\.aws[\\/]/i,
  /(?:^|[\\/])\.ssh[\\/]/i,
]);

export const DEFAULT_BLOCKED_COMMANDS: readonly RegExp[] = Object.freeze([
  /(?:format\s+[a-z]:|mkfs\b|diskpart\b|dd\s+if=)/i,
  /powershell.*-verb\s+runas|start-process.*-verb\s+runas/i,
  /sudo\s+|su\s+-/i,
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-f[a-zA-Z]*r[a-zA-Z]*)\s+[\/\\]/i,
]);

export class SandboxGuard {
  readonly mode: SandboxMode;
  readonly workspaceRoot: string;
  private readonly canonicalRoot: string;
  private readonly allowedPaths: readonly string[];
  private readonly blockedPathPatterns: readonly RegExp[];
  private readonly allowSymlinks: boolean;
  private readonly blockedCommands: readonly RegExp[];

  constructor(config: SandboxPolicyConfig) {
    this.mode = config.mode ?? "full-access";
    if (!config.workspaceRoot || !config.workspaceRoot.trim()) {
      throw new SandboxSecurityError("root_required", "Workspace root is required for SandboxGuard");
    }

    try {
      this.workspaceRoot = resolve(config.workspaceRoot.trim());
      this.canonicalRoot = existsSync(this.workspaceRoot)
        ? realpathSync(this.workspaceRoot)
        : this.workspaceRoot;
    } catch {
      throw new SandboxSecurityError("invalid_root", `Workspace root cannot be resolved: ${config.workspaceRoot}`);
    }

    this.allowedPaths = Object.freeze((config.allowedPaths ?? []).map((p) => resolve(this.canonicalRoot, p)));
    this.blockedPathPatterns = Object.freeze([...(config.blockedPathPatterns ?? DEFAULT_BLOCKED_PATH_PATTERNS)]);
    this.allowSymlinks = config.allowSymlinks ?? false;
    this.blockedCommands = Object.freeze([...(config.blockedCommands ?? DEFAULT_BLOCKED_COMMANDS)]);
  }

  /**
   * Validates that a path is safe and strictly inside the workspace boundary.
   * Throws SandboxSecurityError if path escapes root, points to a sensitive file,
   * or violates restricted sandbox rules.
   */
  assertSafePath(candidatePath: string, operation: "read" | "write" | "delete" = "read"): string {
    if (this.mode === "read-only" && (operation === "write" || operation === "delete")) {
      throw new SandboxSecurityError("read_only_mode", `Operation "${operation}" is forbidden in read-only sandbox mode`);
    }

    const resolved = resolve(this.canonicalRoot, candidatePath);

    // 1. Check relative traversal escaping root
    const rel = relative(this.canonicalRoot, resolved);
    const isEscaping = rel.startsWith("..") || isAbsolute(rel);
    if (isEscaping) {
      // Check if it matches an explicitly allowed additional path in restricted mode
      const isExplicitlyAllowed = this.allowedPaths.some((p) => {
        const r = relative(p, resolved);
        return !r.startsWith("..") && !isAbsolute(r);
      });
      if (!isExplicitlyAllowed) {
        throw new SandboxSecurityError("path_outside_sandbox", `Path escapes sandbox boundary: ${candidatePath}`);
      }
    }

    // 2. In restricted mode, ensure candidate is within workspace or allowed paths
    if (this.mode === "restricted" && this.allowedPaths.length > 0) {
      const allowed = [this.canonicalRoot, ...this.allowedPaths];
      const match = allowed.some((base) => {
        const r = relative(base, resolved);
        return !r.startsWith("..") && !isAbsolute(r);
      });
      if (!match) {
        throw new SandboxSecurityError("path_restricted", `Path is not in restricted sandbox allowlist: ${candidatePath}`);
      }
    }

    // 3. Block sensitive files (e.g. .env, .ssh, .git)
    const normalized = resolved.split(sep).join("/");
    for (const pattern of this.blockedPathPatterns) {
      if (pattern.test(normalized)) {
        throw new SandboxSecurityError("protected_path", `Access to protected path pattern is blocked: ${candidatePath}`);
      }
    }

    // 4. Symlink resolution check
    if (existsSync(resolved)) {
      try {
        const real = realpathSync(resolved);
        const realRel = relative(this.canonicalRoot, real);
        if (realRel.startsWith("..") || isAbsolute(realRel)) {
          throw new SandboxSecurityError("symlink_outside_sandbox", `Symlink target escapes sandbox root: ${candidatePath} -> ${real}`);
        }
      } catch (err) {
        if (err instanceof SandboxSecurityError) throw err;
        throw new SandboxSecurityError("symlink_resolution_failed", `Could not resolve symlink: ${candidatePath}`);
      }
    }

    return resolved;
  }

  /**
   * Validates a command against sandbox security rules.
   */
  assertSafeCommand(command: string): void {
    if (this.mode === "elevated-deny" || this.mode === "read-only" || this.mode === "full-access") {
      for (const pattern of this.blockedCommands) {
        if (pattern.test(command)) {
          throw new SandboxSecurityError("command_blocked", `Command violates sandbox safety policy: "${command.slice(0, 50)}"`);
        }
      }
    }
  }
}

export function createSandboxGuard(config: SandboxPolicyConfig): SandboxGuard {
  return new SandboxGuard(config);
}
