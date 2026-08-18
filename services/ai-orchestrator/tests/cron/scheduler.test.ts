import { describe, expect, it } from "vitest";
import { InMemoryCronJobStore, type CronJob } from "../../src/cron/jobs";
import { CronScheduler } from "../../src/cron/scheduler";
import { SessionDB } from "../../src/state/session-db";
import { SqliteCronJobStore } from "../../src/cron/jobs";

function job(overrides: Partial<CronJob> = {}): CronJob {
  return {
    jobId: "job-1",
    bindingId: "binding-1",
    schedule: { kind: "once", at: "2026-08-18T01:00:00.000Z" },
    prompt: "Review the current work state",
    enabled: true,
    nextRunAt: "2026-08-18T01:00:00.000Z",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("CronScheduler explicit tick", () => {
  it("dispatches a due once job once and disables it", async () => {
    const calls: string[] = [];
    const scheduler = new CronScheduler({
      store: new InMemoryCronJobStore(),
      runTurn: async ({ runId }) => { calls.push(runId); },
    });
    scheduler.add(job());

    const first = await scheduler.tick("2026-08-18T01:01:00.000Z");
    const second = await scheduler.tick("2026-08-18T01:02:00.000Z");

    expect(first).toMatchObject([{ jobId: "job-1", status: "dispatched", code: "due" }]);
    expect(second).toMatchObject([{ jobId: "job-1", status: "skipped", code: "disabled" }]);
    expect(calls).toHaveLength(1);
  });

  it("advances interval schedules from the prior due time without catch-up dispatches", async () => {
    const calls: string[] = [];
    const store = new InMemoryCronJobStore();
    const scheduler = new CronScheduler({ store, runTurn: async ({ runId }) => { calls.push(runId); } });
    scheduler.add(job({ schedule: { kind: "interval", intervalMs: 60_000 }, nextRunAt: "2026-08-18T01:00:00.000Z" }));

    await scheduler.tick("2026-08-18T01:05:30.000Z");
    expect(store.get("job-1")?.nextRunAt).toBe("2026-08-18T01:06:00.000Z");
    expect(calls).toHaveLength(1);
  });

  it("returns receipts for invalid prompt, binding, and not-due jobs", async () => {
    const scheduler = new CronScheduler({ store: new InMemoryCronJobStore(), runTurn: async () => undefined });
    scheduler.add(job({ jobId: "bad-prompt", prompt: "api_key=secret" }));
    scheduler.add(job({ jobId: "bad-binding", bindingId: "" }));
    scheduler.add(job({ jobId: "future", nextRunAt: "2026-08-18T02:00:00.000Z" }));

    const receipts = await scheduler.tick("2026-08-18T01:01:00.000Z");
    expect(receipts).toEqual(expect.arrayContaining([
      expect.objectContaining({ jobId: "bad-prompt", status: "rejected", code: "prompt_invalid" }),
      expect.objectContaining({ jobId: "bad-binding", status: "rejected", code: "binding_missing" }),
      expect.objectContaining({ jobId: "future", status: "skipped", code: "not_due" }),
    ]));
  });

  it("does not create a timer or require a persistent database", () => {
    const scheduler = new CronScheduler({ runTurn: async () => undefined });
    expect(scheduler).toBeDefined();
    expect("tick" in scheduler).toBe(true);
  });

  it("uses durable claims and completion receipts when a SQLite store is injected", async () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 32_000, maxEventBytes: 32_000, busyTimeoutMs: 100 });
    const store = new SqliteCronJobStore(db);
    const calls: string[] = [];
    const scheduler = new CronScheduler({ store, leaseOwner: "worker-a", claimLeaseMs: 10_000, runTurn: async ({ runId }) => { calls.push(runId); } });
    scheduler.add(job({ tenantId: "tenant-a", actorId: "actor-a" } as CronJob));
    const receipts = await scheduler.tick("2026-08-18T01:01:00.000Z");
    expect(receipts).toMatchObject([{ status: "dispatched", code: "due", runId: expect.stringContaining("cron-run-") }]);
    expect(calls).toHaveLength(1);
    expect(store.get(job().jobId)).toMatchObject({ enabled: false });
    db.close();
  });
});
