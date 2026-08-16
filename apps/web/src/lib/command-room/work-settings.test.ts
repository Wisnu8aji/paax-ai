import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_SETTINGS, loadWorkSettings, saveWorkSettings } from "./work-settings";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("Work settings", () => {
  it("returns neutral defaults without requiring secrets", () => {
    const settings = loadWorkSettings(new MemoryStorage());
    expect(settings).toEqual(DEFAULT_WORK_SETTINGS);
    expect(JSON.stringify(settings)).not.toMatch(/key|token|secret|password/i);
  });

  it("persists persona, approval, technical view, and visible tools only", () => {
    const storage = new MemoryStorage();
    saveWorkSettings({
      ...DEFAULT_WORK_SETTINGS,
      persona: "Reviewer",
      approvalMode: "always",
      technical: true,
      visibleTools: ["file_read", "file_search"],
    }, storage);

    expect(loadWorkSettings(storage)).toMatchObject({
      persona: "Reviewer",
      approvalMode: "always",
      technical: true,
      visibleTools: ["file_read", "file_search"],
    });
  });
});
