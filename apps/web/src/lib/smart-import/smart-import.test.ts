import { describe, expect, it } from "vitest";

import {
  detectPriceAnomalies,
  guessColumnMapping,
  mapRowsToRabDraft,
  mergeManualAhspCorrections,
  parseCsvText,
} from "./smart-import";

const ahspList = [
  { code: "AHSP.CK.001", name: "Pasangan dinding bata merah 1/2 batu", unit: "m2", bidang: "Cipta Karya" },
  { code: "AHSP.CK.002", name: "Plesteran dinding", unit: "m2", bidang: "Cipta Karya" },
];

describe("Smart Import", () => {
  it("parses CSV text with quoted cells", () => {
    const parsed = parseCsvText('Uraian,Vol,Satuan,Harga\n"Pasangan, bata",12,m2,50000');

    expect(parsed.headers).toEqual(["Uraian", "Vol", "Satuan", "Harga"]);
    expect(parsed.rows[0]).toEqual(["Pasangan, bata", "12", "m2", "50000"]);
  });

  it("guesses non-standard RAB columns deterministically", () => {
    const mapping = guessColumnMapping(["Pekerjaan", "Qty", "Sat", "Harga Satuan", "Kode"]);

    expect(mapping.description).toBe("Pekerjaan");
    expect(mapping.volume).toBe("Qty");
    expect(mapping.unit).toBe("Sat");
    expect(mapping.unit_price).toBe("Harga Satuan");
    expect(mapping.ahsp_code).toBe("Kode");
  });

  it("maps imported rows to RAB draft input without calculating totals", () => {
    const rows = [
      ["Pasangan dinding bata merah", "12", "m2", "50000", ""],
      ["Plesteran dinding", "20", "m2", "10000", "AHSP.CK.002"],
    ];

    const mapped = mapRowsToRabDraft({
      headers: ["Uraian", "Volume", "Satuan", "Harga", "Kode"],
      rows,
      mapping: {
        description: "Uraian",
        volume: "Volume",
        unit: "Satuan",
        unit_price: "Harga",
        ahsp_code: "Kode",
      },
      ahspList,
    });

    expect(mapped[0]).toMatchObject({
      description: "Pasangan dinding bata merah",
      volume: 12,
      ahsp_code: "AHSP.CK.001",
      needs_review: false,
    });
    expect(mapped[1].ahsp_code).toBe("AHSP.CK.002");
    expect(mapped[1]).not.toHaveProperty("amount");
  });

  it("flags imported unit prices that differ from engine HSP by threshold", () => {
    const anomalies = detectPriceAnomalies(
      [
        { row_index: 0, description: "Dinding", ahsp_code: "AHSP.CK.001", imported_unit_price: 150000 },
        { row_index: 1, description: "Plester", ahsp_code: "AHSP.CK.002", imported_unit_price: 99000 },
        { row_index: 2, description: "Manual", ahsp_code: null, imported_unit_price: 10000 },
      ],
      {
        "AHSP.CK.001": { hsp: 100000, name: "Dinding" },
        "AHSP.CK.002": { hsp: 100000, name: "Plester" },
      },
      0.2,
    );

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      row_index: 0,
      direction: "above",
      imported_unit_price: 150000,
      reference_hsp: 100000,
      threshold_pct: 20,
    });
  });

  it("preserves user AHSP corrections before rerunning engine validation", () => {
    const mapped = mapRowsToRabDraft({
      headers: ["Uraian", "Volume", "Satuan", "Harga", "Kode"],
      rows: [["Pasangan dinding bata merah", "12", "m2", "50000", ""]],
      mapping: {
        description: "Uraian",
        volume: "Volume",
        unit: "Satuan",
        unit_price: "Harga",
        ahsp_code: "Kode",
      },
      ahspList,
    });

    const merged = mergeManualAhspCorrections(mapped, [{ ...mapped[0], ahsp_code: "AHSP.CK.002" }]);

    expect(merged[0]).toMatchObject({
      ahsp_code: "AHSP.CK.002",
      confidence: 1,
      needs_review: false,
      reason: "Kode AHSP dikoreksi pengguna.",
    });
  });
});
