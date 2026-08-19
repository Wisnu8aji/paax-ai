export interface EnvironmentPolicyConfig {
  readonly allowedPrefixes?: readonly string[];
  readonly allowedSystemVars?: readonly string[];
  readonly blockedPatterns?: readonly RegExp[];
  readonly setEnvironment?: Readonly<Record<string, string>>;
}

export const DEFAULT_ALLOWED_PREFIXES: readonly string[] = Object.freeze([
  "PAAX_",
  "NODE_",
  "NPM_",
  "PNPM_",
  "PYTHON",
  "UV_",
  "VITEST",
]);

export const DEFAULT_ALLOWED_SYSTEM_VARS: readonly string[] = Object.freeze([
  "PATH",
  "Path",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "HOME",
  "HOMEPATH",
  "HOMEDRIVE",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMFILES",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
  "LANG",
  "LC_ALL",
  "TERM",
  "TZ",
  "PORT",
  "NODE_ENV",
]);

export const DEFAULT_SECRET_PATTERNS: readonly RegExp[] = Object.freeze([
  /(?:API[_-]?KEY|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CREDENTIAL|AUTH)/i,
]);

export class EnvironmentPolicy {
  private readonly allowedPrefixes: readonly string[];
  private readonly allowedSystemVars: ReadonlySet<string>;
  private readonly blockedPatterns: readonly RegExp[];
  private readonly setEnvironment: Readonly<Record<string, string>>;

  constructor(config: EnvironmentPolicyConfig = {}) {
    this.allowedPrefixes = Object.freeze([...(config.allowedPrefixes ?? DEFAULT_ALLOWED_PREFIXES)]);
    this.allowedSystemVars = new Set([...(config.allowedSystemVars ?? DEFAULT_ALLOWED_SYSTEM_VARS)]);
    this.blockedPatterns = Object.freeze([...(config.blockedPatterns ?? DEFAULT_SECRET_PATTERNS)]);
    this.setEnvironment = Object.freeze({ ...(config.setEnvironment ?? {}) });
  }

  isSecretVar(key: string): boolean {
    return this.blockedPatterns.some((pattern) => pattern.test(key));
  }

  isAllowedVar(key: string): boolean {
    // If it's a sensitive credential key, it is blocked by default from child subshells
    if (this.isSecretVar(key)) {
      return false;
    }

    if (this.allowedSystemVars.has(key)) {
      return true;
    }

    return this.allowedPrefixes.some((prefix) => key.startsWith(prefix));
  }

  /**
   * Sanitizes an environment map according to policy, stripping unallowlisted and secret variables,
   * then applying explicit policy sets.
   */
  sanitize(rawEnv: NodeJS.ProcessEnv = process.env): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(rawEnv)) {
      if (value !== undefined && this.isAllowedVar(key)) {
        sanitized[key] = value;
      }
    }

    // Apply explicit policy overrides ([shell_environment_policy.set])
    for (const [key, value] of Object.entries(this.setEnvironment)) {
      sanitized[key] = value;
    }

    return sanitized;
  }
}

export function createEnvironmentPolicy(config?: EnvironmentPolicyConfig): EnvironmentPolicy {
  return new EnvironmentPolicy(config);
}

export function sanitizeProcessEnvironment(
  rawEnv: NodeJS.ProcessEnv = process.env,
  config?: EnvironmentPolicyConfig,
): Record<string, string> {
  return createEnvironmentPolicy(config).sanitize(rawEnv);
}
