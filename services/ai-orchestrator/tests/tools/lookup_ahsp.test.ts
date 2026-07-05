import { describe, expect, it } from "vitest";

import { createLookupAhspTool } from "../../src/tools/lookup_ahsp";

function response(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

const catalog = [
  { code: "A", name: "Pengecatan dinding interior", unit: "m2", bidang: "CK" },
  { code: "B", name: "Pemasangan bata dinding", unit: "m2", bidang: "CK" },
  { code: "C", name: "Beton kolom praktis", unit: "m3", bidang: "CK" },
];

describe("lookup_ahsp", () => {
  it("returns relevant candidates ordered by token match", async () => {
    const tool = createLookupAhspTool({ coreEngineUrl: "http://core", fetchImpl: async () => response(catalog) });

    const result = await tool.execute({ query: "cat dinding", limit: 5 });

    expect(result).toEqual({
      candidates: [{ code: "A", name: "Pengecatan dinding interior", unit: "m2" }],
      total_matched: 1,
    });
  });

  it("returns empty candidates when nothing matches", async () => {
    const tool = createLookupAhspTool({ coreEngineUrl: "http://core", fetchImpl: async () => response(catalog) });

    await expect(tool.execute({ query: "atap baja" })).resolves.toEqual({ candidates: [], total_matched: 0 });
  });

  it("returns an error object when core-engine cannot be reached", async () => {
    const tool = createLookupAhspTool({ coreEngineUrl: "http://core", fetchImpl: async () => { throw new Error("offline"); } });

    await expect(tool.execute({ query: "cat" })).resolves.toEqual({
      candidates: [],
      total_matched: 0,
      error: "core-engine tidak dapat dihubungi",
    });
  });

  it("caches catalog within ttl", async () => {
    let calls = 0;
    const tool = createLookupAhspTool({
      coreEngineUrl: "http://core",
      fetchImpl: async () => {
        calls += 1;
        return response(catalog);
      },
      now: () => 1000,
    });

    await tool.execute({ query: "dinding" });
    await tool.execute({ query: "kolom" });

    expect(calls).toBe(1);
  });
});
