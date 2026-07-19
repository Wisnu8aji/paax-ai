import { describe, expect, it } from "vitest";

import { verifyAndComposeClaims } from "./claim-pipeline";

describe("Command Room claim pipeline", () => {
  it("removes unsupported project numeric claims and requests Core Engine authority", () => {
    const result = verifyAndComposeClaims({
      responseText: "Volume pekerjaan adalah 125 m3.",
      toolsCalled: [],
      authority: { quantityAuthority: "none" },
    });
    expect(result.responseText).not.toContain("125 m3");
    expect(result.rejected).toHaveLength(1);
    expect(result.requiresCoreEngine).toBe(true);
  });

  it("surfaces retrieval conflicts instead of hiding them", () => {
    const result = verifyAndComposeClaims({
      responseText: "Data gambar perlu ditinjau.",
      toolsCalled: [],
      authority: { quantityAuthority: "none", conflicts: [{ reason: "dimensi berbeda" }] },
    });
    expect(result.responseText).toContain("Konflik data perlu direview");
    expect(result.conflicts).toEqual([{ reason: "dimensi berbeda" }]);
  });

  it("refuses contextual occurrence as a physical quantity", () => {
    const result = verifyAndComposeClaims({
      responseText: "Terdapat 3 kelompok konteks, jadi jumlah fisik kolom adalah 3.",
      toolsCalled: [],
      authority: { quantityAuthority: "measurement_fact" },
    });
    expect(result.responseText).not.toContain("jumlah fisik kolom adalah 3");
    expect(result.responseText.toLowerCase()).toContain("kelompok konteks");
    expect(result.requiresCoreEngine).toBe(true);
  });

  it("labels Core Engine numeric output with its authoritative class", () => {
    const result = verifyAndComposeClaims({
      responseText: "Volume tervalidasi 12 m3.",
      toolsCalled: ["query_rab"],
      authority: { quantityAuthority: "core_engine" },
    });
    expect(result.claims[0]).toMatchObject({ numericClass: "core_engine_result", status: "verified" });
    expect(result.responseText).toContain("12 m3");
  });

  it("uses conservative numeric classes for measurements, written facts, and references", () => {
    expect(verifyAndComposeClaims({
      responseText: "Dimensi terukur 4 m3.", toolsCalled: [],
      authority: { quantityAuthority: "measurement_fact", evidenceCount: 1 },
    }).claims[0]).toMatchObject({ numericClass: "verified_measurement", status: "verified" });
    expect(verifyAndComposeClaims({
      responseText: "Teks gambar menyebut 4 m3.", toolsCalled: [],
      authority: { quantityAuthority: "none", evidenceCount: 1 },
    }).claims[0]).toMatchObject({ numericClass: "written_fact", status: "manual_review_required" });
    expect(verifyAndComposeClaims({
      responseText: "Referensi AHSP 4 m3.", toolsCalled: ["lookup_ahsp"],
      authority: { quantityAuthority: "none" },
    }).claims[0]).toMatchObject({ numericClass: "non_authoritative_reference", status: "manual_review_required" });
  });
});
