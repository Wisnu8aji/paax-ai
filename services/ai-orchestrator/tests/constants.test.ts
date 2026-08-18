import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRuntimePaths, resolveSessionDbPath, RuntimePathError } from "../src/constants";

describe("runtime path resolver", () => {
  it("derives absolute contained paths without creating directories", () => {
    const root = resolve(process.cwd(), "test-runtime-root");
    const paths = resolveRuntimePaths({ PAAX_RUNTIME_HOME: root, PAAX_PROFILE: "review-1" }, process.cwd());

    expect(paths.root).toBe(root);
    expect(paths.profile).toBe(resolve(root, "profiles", "review-1"));
    expect([paths.root, paths.profiles, paths.profile, paths.cache, paths.sessions, paths.logs].every(isAbsolute)).toBe(true);
    expect([paths.profiles, paths.profile, paths.cache, paths.sessions, paths.logs].every((path) => {
      const rel = relative(root, path);
      return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    })).toBe(true);
    expect(existsSync(root)).toBe(false);
  });

  it("uses the configured data root without touching a user home directory", () => {
    const paths = resolveRuntimePaths({ PAAX_DATA_ROOT: "D:/paax-data", PAAX_PROFILE: "default" }, "D:/service-workspace");
    expect(paths.root).toBe(resolve("D:/paax-data", "ai-orchestrator"));
    expect(paths.profile).toContain("profiles");
    expect(paths.root).not.toMatch(/Users|AppData|HOME/i);
  });

  it("rejects unsafe profile path segments", () => {
    expect(() => resolveRuntimePaths({ PAAX_PROFILE: "../outside" }, process.cwd())).toThrow(RuntimePathError);
    expect(() => resolveRuntimePaths({ PAAX_PROFILE: "profile/name" }, process.cwd())).toThrow(RuntimePathError);
  });

  it("keeps the production SessionDB path inside the runtime root", () => {
    const paths = resolveRuntimePaths({ PAAX_RUNTIME_HOME: "D:/safe-runtime" }, process.cwd());
    expect(resolveSessionDbPath(paths, {})).toBe(resolve(paths.sessions, "session.db"));
    expect(() => resolveSessionDbPath(paths, { PAAX_SESSION_DB_PATH: "D:/outside/session.db" })).toThrow(RuntimePathError);
  });
});
