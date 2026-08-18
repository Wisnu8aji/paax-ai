import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/index";
import { loadConfig } from "../src/config";
import { SessionDB } from "../src/state/session-db";

describe("composition root durable state", () => {
  it("creates one SessionDB-backed production session store under runtime sessions", () => {
    const root = mkdtempSync(join(tmpdir(), "paax-composition-"));
    const config = loadConfig({ PAAX_RUNTIME_HOME: root, PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: { provider: "deepseek", model: "deepseek-v4-flash", transport: "openai-compatible", supportsThinking: true } }) });
    const app = createApp({ config });
    const db = (app as typeof app & { locals: { paaxSessionDb: SessionDB } }).locals.paaxSessionDb;
    expect(db).toBeInstanceOf(SessionDB);
    expect(db.filename).toBe(join(root, "sessions", "session.db"));
    expect(db.health()).toMatchObject({ journalMode: "wal", fts5: true });
    expect((app as typeof app & { locals: { paaxSessionStore: { constructor: { name: string } } } }).locals.paaxSessionStore.constructor.name).toBe("SqliteSessionStore");
    expect((app as typeof app & { locals: { paaxAgentRunStore: { constructor: { name: string } } } }).locals.paaxAgentRunStore.constructor.name).toBe("SqliteMatureAgentRunStore");
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("exposes an explicit disabled cron host and idempotent shutdown lifecycle", async () => {
    const root = mkdtempSync(join(tmpdir(), "paax-composition-shutdown-"));
    const config = loadConfig({ PAAX_RUNTIME_HOME: root, PAAX_MODEL_PROFILES_JSON: JSON.stringify({ lucent: { provider: "deepseek", model: "deepseek-v4-flash", transport: "openai-compatible", supportsThinking: true } }) });
    const app = createApp({ config });
    const locals = (app as typeof app & { locals: { paaxCronHost: { running: boolean }; paaxCronScheduler: unknown; paaxShutdown: () => Promise<void> } }).locals;
    expect(locals.paaxCronHost.running).toBe(false);
    expect(locals.paaxCronScheduler).toBeDefined();
    await locals.paaxShutdown();
    await locals.paaxShutdown();
    await expect(locals.paaxShutdown()).resolves.toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });
});
