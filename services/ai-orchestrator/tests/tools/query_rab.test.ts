import { describe, expect, it } from "vitest";

import { queryRabTool } from "../../src/tools/query_rab";

const context = {
  rab_lines: [
    { id: "line-1", ahsp_code: "A.1", volume: 12.5, duration_days: 4 },
    { id: "line-2", ahsp_code: "B.2", volume: null, duration_days: null, ahsp_suggested: true },
  ],
};

describe("query_rab", () => {
  it("returns filtered rab lines from chat context", async () => {
    const result = await queryRabTool.execute({ filter_ahsp_code: "A" }, { context });

    expect(result).toEqual({
      available: true,
      lines: [{ ahsp_code: "A.1", volume: 12.5, duration_days: 4 }],
      total_lines: 1,
    });
  });

  it("returns unavailable when rab context is missing", async () => {
    await expect(queryRabTool.execute({}, { context: {} })).resolves.toEqual({
      available: false,
      message: "Data RAB tidak tersedia di konteks percakapan ini - user perlu membuka halaman RAB proyek dulu.",
    });
  });

  it("returns available empty result when filter has no matches", async () => {
    const result = await queryRabTool.execute({ filter_ahsp_code: "ZZZ" }, { context });

    expect(result).toEqual({ available: true, lines: [], total_lines: 0 });
  });
});
