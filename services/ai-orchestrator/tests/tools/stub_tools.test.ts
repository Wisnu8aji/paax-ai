import { describe, expect, it } from "vitest";

import { queryMaterialsTool } from "../../src/tools/query_materials";
import { queryProgressTool } from "../../src/tools/query_progress";

describe("stub tools", () => {
  it("query_progress always returns honest unavailable message", async () => {
    const expected = {
      available: false,
      message: "Monitoring progres lapangan (Site Agent) belum dibangun (rencana v2.0, docs/MASTER_PLAN.md §16) - fitur ini belum tersedia.",
    };

    await expect(queryProgressTool.execute({})).resolves.toEqual(expected);
    await expect(queryProgressTool.execute({ unexpected: "value" })).resolves.toEqual(expected);
  });

  it("query_materials always returns honest unavailable message", async () => {
    const expected = {
      available: false,
      message: "Prediksi & pengingat kebutuhan material belum dibangun (rencana v1.5, docs/MASTER_PLAN.md §16) - fitur ini belum tersedia.",
    };

    await expect(queryMaterialsTool.execute({})).resolves.toEqual(expected);
    await expect(queryMaterialsTool.execute({ unexpected: "value" })).resolves.toEqual(expected);
  });
});
