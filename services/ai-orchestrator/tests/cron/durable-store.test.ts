import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionDB } from "../../src/state/session-db";
import { SqliteCronJobStore, type CronJob } from "../../src/cron/jobs";

const paths: string[] = [];
const job: CronJob = {
  jobId: "job-durable",
  bindingId: "binding-a",
  tenantId: "tenant-a",
  actorId: "actor-a",
  schedule: { kind: "once", at: "2026-08-18T01:00:00.000Z" },
  prompt: "Review the current work state",
  enabled: true,
  nextRunAt: "2026-08-18T01:00:00.000Z",
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

function open(filename: string): SessionDB {
  return new SessionDB({ filename, testOnly: filename === ":memory:", maxJsonBytes: 32_000, maxEventBytes: 32_000, busyTimeoutMs: 100 });
}

afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("SqliteCronJobStore", () => {
  it("reopens durable jobs and keeps secret-bearing prompts rejected", () => {
    const directory = mkdtempSync(join(tmpdir(), "paax-cron-"));
    paths.push(directory);
    const filename = join(directory, "session.db");
    const firstDb = open(filename);
    const first = new SqliteCronJobStore(firstDb);
    first.put(job);
    expect(first.get(job.jobId)).toMatchObject({ jobId: job.jobId, tenantId: "tenant-a", bindingId: "binding-a" });
    expect(() => first.put({ ...job, jobId: "secret-job", prompt: "api_key=secret-value" })).toThrow(/prompt|secret/i);
    firstDb.close();
    const secondDb = open(filename);
    expect(new SqliteCronJobStore(secondDb).get(job.jobId)).toMatchObject({ prompt: "Review the current work state" });
    secondDb.close();
  });

  it("claims one occurrence atomically, completes it idempotently, and does not rerun completed work", () => {
    const db = open(":memory:");
    const store = new SqliteCronJobStore(db);
    store.put(job);
    const first = store.claim(job.jobId, job.nextRunAt, "worker-a", 10_000, "2026-08-18T01:00:00.000Z");
    const duplicate = store.claim(job.jobId, job.nextRunAt, "worker-b", 10_000, "2026-08-18T01:00:00.000Z");
    expect(first).toMatchObject({ claimed: true, runId: expect.any(String) });
    expect(duplicate).toMatchObject({ claimed: false, runId: first.runId });
    expect(store.complete(first.runId!, "completed", { safe: true })).toMatchObject({ status: "completed" });
    expect(store.complete(first.runId!, "failed", { ignored: true })).toMatchObject({ status: "completed" });
    expect(store.claim(job.jobId, job.nextRunAt, "worker-c", 10_000, "2026-08-18T01:00:00.000Z").claimed).toBe(false);
    db.close();
  });

  it("recovers an expired lease and allows a new worker to claim the occurrence", () => {
    const db = open(":memory:");
    const store = new SqliteCronJobStore(db);
    store.put(job);
    const first = store.claim(job.jobId, job.nextRunAt, "worker-a", 1_000, "2026-08-18T01:00:00.000Z");
    expect(store.recover("2026-08-18T01:00:02.000Z")).toBe(1);
    const recovered = store.claim(job.jobId, job.nextRunAt, "worker-b", 1_000, "2026-08-18T01:00:02.000Z");
    expect(recovered).toMatchObject({ claimed: true, runId: first.runId });
    db.close();
  });
});
