import { describe, expect, it } from "vitest";

import { createRabExcelRequest, downloadRabFormulaExcel } from "./rab-excel-export";

describe("formula Excel export", () => {
  it("builds the engine export request from editor lines", () => {
    const request = createRabExcelRequest(
      [{ ahsp_code: "AHSP.CK.001", volume: 12, duration_days: 7 }],
      "semarang",
      0.11,
    );

    expect(request).toEqual({
      region_code: "semarang",
      ppn_rate: 0.11,
      lines: [{ ahsp_code: "AHSP.CK.001", volume: 12, duration_days: 7 }],
    });
  });

  it("rejects export when there are no valid engine lines", async () => {
    await expect(downloadRabFormulaExcel([], "jateng", 0.11, "Demo")).rejects.toThrow(
      "Belum ada baris RAB valid",
    );
  });
});
