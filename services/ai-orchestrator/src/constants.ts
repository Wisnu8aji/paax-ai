import { isAbsolute, relative, resolve } from "node:path";

export interface RuntimePaths {
  root: string;
  profiles: string;
  profile: string;
  cache: string;
  sessions: string;
  logs: string;
}

export class RuntimePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimePathError";
  }
}

const SAFE_PROFILE = /^[A-Za-z0-9._-]{1,64}$/;

function contained(root: string, candidate: string): string {
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new RuntimePathError("runtime path escaped configured root");
  return candidate;
}

export function resolveRuntimePaths(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): RuntimePaths {
  const configuredRoot = env.PAAX_RUNTIME_HOME?.trim();
  const dataRoot = env.PAAX_DATA_ROOT?.trim();
  const root = configuredRoot
    ? resolve(cwd, configuredRoot)
    : dataRoot
      ? resolve(cwd, dataRoot, "ai-orchestrator")
      : resolve(cwd, ".paax-runtime");
  const profileName = env.PAAX_PROFILE?.trim() || "default";
  if (!SAFE_PROFILE.test(profileName)) throw new RuntimePathError("PAAX_PROFILE must be a safe path segment");

  const profiles = contained(root, resolve(root, "profiles"));
  const profile = contained(root, resolve(profiles, profileName));
  const cache = contained(root, resolve(root, "cache"));
  const sessions = contained(root, resolve(root, "sessions"));
  const logs = contained(root, resolve(root, "logs"));
  return { root, profiles, profile, cache, sessions, logs };
}

export function resolveSessionDbPath(paths: RuntimePaths, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PAAX_SESSION_DB_PATH?.trim();
  const candidate = configured ? resolve(paths.root, configured) : resolve(paths.sessions, "session.db");
  return contained(paths.root, candidate);
}
