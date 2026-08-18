import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  SESSION_DB_SCHEMA_VERSION,
  applySessionDbMigrations,
  getSessionDbTables,
  safeJsonDecode,
  safeJsonEncode,
} from "../../src/state/schema";

describe("SessionDB schema", () => {
  it("creates the versioned durable schema idempotently with FTS5 and constraints", () => {
    const db = new DatabaseSync(":memory:");
    applySessionDbMigrations(db, { maxJsonBytes: 8_000 });
    applySessionDbMigrations(db, { maxJsonBytes: 8_000 });

    expect(db.prepare("select value from schema_meta where key = 'version'").get()).toEqual({
      value: String(SESSION_DB_SCHEMA_VERSION),
    });
    expect(getSessionDbTables(db)).toEqual(expect.arrayContaining([
      "schema_meta", "sessions", "messages", "state_fts", "memory_records", "lineage",
      "runs", "run_events", "tool_invocations", "compression_runs", "subagent_runs",
      "cron_jobs", "cron_runs", "audit_events",
    ]));
    expect(db.prepare("pragma foreign_keys").get()).toMatchObject({ foreign_keys: 1 });
    expect(db.prepare("pragma index_list('run_events')").all()).not.toHaveLength(0);
    expect(() => db.prepare("insert into messages(id, session_id, sequence, role, content, content_hash, created_at) values (?, ?, ?, ?, ?, ?, ?)").run("m", "missing", 0, "invalid", "x", "h", new Date().toISOString())).toThrow();
    db.close();
  });

  it("redacts recursive secret fields before bounded JSON persistence", () => {
    const encoded = safeJsonEncode({ apiKey: "FAKE_API_KEY_FOR_TEST_ONLY", nested: { authorization: "Bearer secret" }, ok: "value" }, 2_000);
    expect(encoded).not.toContain("FAKE_API_KEY_FOR_TEST_ONLY");
    expect(encoded).not.toContain("Bearer secret");
    expect(safeJsonDecode(encoded)).toEqual({ apiKey: "[REDACTED]", nested: { authorization: "[REDACTED]" }, ok: "value" });
    expect(() => safeJsonEncode({ value: "x".repeat(2_001) }, 100)).toThrow(/size/i);
  });
});
