import { describe, expect, it } from "vitest";
import { buildWorkCatalog } from "./catalog";

describe("Work catalog", () => {
  it("reports neutral capabilities and honest unavailable adapters", () => {
    const catalog = buildWorkCatalog();
    expect(catalog.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "file_read", available: true }),
      expect.objectContaining({ name: "terminal_run", available: true }),
    ]));
    expect(catalog.subagents).toMatchObject({ available: false });
    expect(catalog.extensions).toMatchObject({ configured: false, servers: [] });
    expect(JSON.stringify(catalog)).not.toMatch(/deepseek|mimo|provider/i);
  });
});
