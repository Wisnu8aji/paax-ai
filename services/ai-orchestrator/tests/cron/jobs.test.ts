import { describe, expect, it } from "vitest";
import { InMemoryCronJobStore, type CronJob } from "../../src/cron/jobs";

const job: CronJob = {
  jobId: "job-1",
  bindingId: "binding-1",
  schedule: { kind: "once", at: "2026-08-18T01:00:00.000Z" },
  prompt: "Review the current work state",
  enabled: true,
  nextRunAt: "2026-08-18T01:00:00.000Z",
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

describe("in-memory cron job store", () => {
  it("copies jobs at write and read boundaries", () => {
    const store = new InMemoryCronJobStore();
    store.put(job);
    const read = store.get(job.jobId)!;
    read.schedule.kind = "interval";
    read.schedule.intervalMs = 1_000;
    expect(store.get(job.jobId)?.schedule.kind).toBe("once");
    expect(store.list()).toHaveLength(1);
  });

  it("disables and removes jobs without persistence claims", () => {
    const store = new InMemoryCronJobStore();
    store.put(job);
    store.disable(job.jobId);
    expect(store.get(job.jobId)?.enabled).toBe(false);
    store.remove(job.jobId);
    expect(store.get(job.jobId)).toBeUndefined();
  });
});
