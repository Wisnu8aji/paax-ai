import { describe, expect, it, vi } from "vitest";

import { canPersistDurableMemory, selectRelevantMemories } from "./memory-runtime";
import { createStatusSummaryScheduler } from "./status-summarizer";

describe("Command Room durable memory runtime", () => {
  it("keeps preferences, project facts, corrections, decisions, and temporary state separated", () => {
    const selected = selectRelevantMemories({
      projectId: "p1", conversationId: "c1", query: "pondasi", memories: [
        { scope: "project", scope_ref_id: "p1", type: "fact", content: "Pondasi tertulis di gambar", source_type: "evidence", importance: 0.9, status: "active" },
        { scope: "conversation", scope_ref_id: "c1", type: "decision", content: "Gunakan opsi pondasi A", source_type: "user_message", importance: 0.8, status: "active" },
        { scope: "global_user", scope_ref_id: "u1", type: "preference", content: "Jawab ringkas", source_type: "user_message", importance: 0.7, status: "active" },
        { scope: "temporary_run", scope_ref_id: "other-run", type: "fact", content: "Tidak boleh bocor", source_type: "evidence", importance: 1, status: "active" },
      ],
    });
    expect(selected).toEqual(["Pondasi tertulis di gambar", "Gunakan opsi pondasi A", "Jawab ringkas"]);
  });

  it("never permits model output as a durable project fact", () => {
    expect(canPersistDurableMemory({ scope: "project", type: "fact", source_type: "model_output" })).toBe(false);
    expect(canPersistDurableMemory({ scope: "project", type: "fact", source_type: "evidence" })).toBe(true);
    expect(canPersistDurableMemory({ scope: "project", type: "correction", source_type: "user_message" })).toBe(true);
  });
});

describe("status summarizer scheduler", () => {
  it("is disabled without invoking the executor", async () => {
    const executor = vi.fn(async () => "ignored");
    const scheduler = createStatusSummaryScheduler({ enabled: false, executor });
    scheduler.schedule("run", "reasoning", vi.fn());
    await Promise.resolve();
    expect(executor).not.toHaveBeenCalled();
  });

  it("is asynchronous and rate limits each run", async () => {
    let resolve!: (value: string | null) => void;
    const executor = vi.fn(() => new Promise<string | null>((done) => { resolve = done; }));
    const onSummary = vi.fn();
    const scheduler = createStatusSummaryScheduler({ enabled: true, minIntervalMs: 60_000, executor, now: () => 100 });
    scheduler.schedule("run", "first", onSummary);
    scheduler.schedule("run", "second", onSummary);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(onSummary).not.toHaveBeenCalled();
    resolve("Menganalisis pondasi");
    await Promise.resolve();
    expect(onSummary).toHaveBeenCalledWith("Menganalisis pondasi");
  });
});
