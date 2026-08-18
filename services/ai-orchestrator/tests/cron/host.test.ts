import { describe, expect, it } from "vitest";
import { CronHost } from "../../src/cron/host";

describe("CronHost", () => {
  it("is disabled by default, starts/stops explicitly, and does not overlap ticks", async () => {
    let calls = 0;
    let active = 0;
    let maxActive = 0;
    const host = new CronHost({ enabled: false, intervalMs: 10, scheduler: { tick: async () => { calls += 1; active += 1; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 20)); active -= 1; return []; } } });
    await host.start();
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(calls).toBe(0);
    await host.stop();

    const enabled = new CronHost({ enabled: true, intervalMs: 10, scheduler: { tick: async () => { calls += 1; active += 1; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 20)); active -= 1; return []; } } });
    await enabled.start();
    await new Promise((resolve) => setTimeout(resolve, 65));
    await enabled.stop();
    expect(calls).toBeGreaterThan(0);
    expect(maxActive).toBe(1);
    expect(enabled.running).toBe(false);
  });

  it("supports a deterministic manual tick and catches scheduler failures", async () => {
    const errors: unknown[] = [];
    const host = new CronHost({ enabled: true, intervalMs: 100, scheduler: { tick: async () => { throw new Error("secret scheduler detail"); } }, onError: (error) => { errors.push(error); } });
    await expect(host.tick("2026-08-18T01:00:00.000Z")).resolves.toEqual([]);
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors)).not.toContain("secret scheduler detail");
    await host.stop();
  });
});
