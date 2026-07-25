import { describe, expect, it } from "vitest";

import { verifyAndComposeClaims } from "./claim-pipeline";
import type { ToolResultRecord } from "./claim-provenance";

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

  it("labels a claim whose value is genuinely present in a Core Engine tool result", () => {
    const toolResults: ToolResultRecord[] = [
      { result_id: "query_rab:0", tool: "query_rab", result: { total_volume_m3: 12 } },
    ];
    const result = verifyAndComposeClaims({
      responseText: "Volume tervalidasi 12 m3.",
      toolsCalled: ["query_rab"],
      authority: { quantityAuthority: "core_engine" },
      toolResults,
    });
    expect(result.claims[0]).toMatchObject({ numericClass: "core_engine_result", status: "verified" });
    expect(result.responseText).toContain("12 m3");
    expect(result.structuredClaims[0].source_result_id).toBe("query_rab:0");
  });

  it("rejects unsupported element counts without evidence", () => {
    const result = verifyAndComposeClaims({
      responseText: "Lantai 2 memiliki 12 kolom K1.",
      toolsCalled: [],
      authority: { quantityAuthority: "none" },
    });
    expect(result.responseText).not.toContain("12 kolom");
    expect(result.rejected).toHaveLength(1);
    expect(result.requiresCoreEngine).toBe(true);
  });

  it("rejects unsupported mm/cm dimension claims without evidence", () => {
    const mm = verifyAndComposeClaims({
      responseText: "Dimensi kolom K1 adalah 400 mm x 400 mm.",
      toolsCalled: [],
      authority: { quantityAuthority: "none" },
    });
    expect(mm.responseText).not.toContain("400 mm");
    expect(mm.rejected.length).toBeGreaterThan(0);

    const cm = verifyAndComposeClaims({
      responseText: "Tebal pelat 30 cm.",
      toolsCalled: [],
      authority: { quantityAuthority: "none" },
    });
    expect(cm.responseText).not.toContain("30 cm");
    expect(cm.rejected).toHaveLength(1);
  });

  it("rejects unsupported elevation claims without evidence", () => {
    const result = verifyAndComposeClaims({
      responseText: "Elevasi lantai adalah +4.000 m dari peil ±0.00.",
      toolsCalled: [],
      authority: { quantityAuthority: "none" },
    });
    expect(result.responseText).not.toContain("+4.000 m");
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("verifies element counts and dimensions only when their exact value is present in a Core Engine result", () => {
    const toolResults: ToolResultRecord[] = [
      { result_id: "query_rab:0", tool: "query_rab", result: { columns: { K1: { count: 12, width_mm: 400 } } } },
    ];
    const result = verifyAndComposeClaims({
      responseText: "Lantai 2 memiliki 12 kolom K1 dengan dimensi 400 mm x 400 mm.",
      toolsCalled: ["query_rab"],
      authority: { quantityAuthority: "core_engine" },
      toolResults,
    });
    expect(result.rejected).toHaveLength(0);
    expect(result.responseText).toContain("12 kolom");
    expect(result.responseText).toContain("400 mm");
  });

  it("uses conservative numeric classes for measurements, written facts, and references", () => {
    expect(verifyAndComposeClaims({
      responseText: "Dimensi terukur 4 m3.", toolsCalled: [],
      authority: { quantityAuthority: "measurement_fact", evidenceCount: 1 },
    }).claims[0]).toMatchObject({ numericClass: "measurement_fact", status: "verified" });
    expect(verifyAndComposeClaims({
      responseText: "Teks gambar menyebut 4 m3.", toolsCalled: [],
      authority: { quantityAuthority: "none", evidenceCount: 1 },
    }).claims[0]).toMatchObject({ numericClass: "written_fact", status: "manual_review_required" });
    expect(verifyAndComposeClaims({
      responseText: "Referensi AHSP A.2.1.1-3.", toolsCalled: ["lookup_ahsp"],
      authority: { quantityAuthority: "none" },
      toolResults: [{ result_id: "lookup_ahsp:0", tool: "lookup_ahsp", result: { code: "A.2.1.1-3" } }],
    }).claims[0]).toMatchObject({ numericClass: "non_authoritative_reference", status: "manual_review_required" });
  });

  // ── Target 3 adversarial tests (instruction file's exact scenarios) ──────

  it("adversarial: a real Core Engine dimension does not authorize an unrelated fabricated count", () => {
    const toolResults: ToolResultRecord[] = [
      { result_id: "query_rab:0", tool: "query_rab", result: { columns: { K1: { width_mm: 400 } } } },
    ];
    const result = verifyAndComposeClaims({
      responseText: "Dimensi K1 400 mm dan lantai 3 memiliki 999 kolom.",
      toolsCalled: ["query_rab"],
      authority: { quantityAuthority: "core_engine" },
      toolResults,
    });
    const byText = Object.fromEntries(result.claims.map((claim) => [claim.claim, claim]));
    expect(byText["400 mm"]).toMatchObject({ status: "verified" });
    expect(byText["999 kolom"]).toMatchObject({ status: "rejected" });
    expect(result.responseText).not.toContain("999 kolom");
    expect(result.responseText).toContain("400 mm");
  });

  it("adversarial: a Core Engine volume result does not authorize an unrelated price claim", () => {
    const toolResults: ToolResultRecord[] = [
      { result_id: "query_rab:0", tool: "query_rab", result: { volume_m3: 0.56 } },
    ];
    const result = verifyAndComposeClaims({
      responseText: "Volume K1 0,56 m3 dan nilai proyek Rp999 miliar.",
      toolsCalled: ["query_rab"],
      authority: { quantityAuthority: "core_engine" },
      toolResults,
    });
    const byText = Object.fromEntries(result.claims.map((claim) => [claim.claim, claim]));
    expect(byText["0,56 m3"]).toMatchObject({ status: "verified" });
    expect(byText["Rp999"].status).toBe("rejected");
  });

  it("adversarial: conflicting schedule/drawing counts surface as a conflict, not a silent pick", () => {
    const result = verifyAndComposeClaims({
      responseText: "Schedule menunjukkan 12 unit, tetapi gambar menunjukkan 8 unit.",
      toolsCalled: ["query_schedule"],
      authority: { quantityAuthority: "core_engine", conflicts: [{ reason: "count mismatch: schedule=12 vs drawing=8" }] },
      toolResults: [{ result_id: "query_schedule:0", tool: "query_schedule", result: { unit_count: 12 } }],
    });
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.responseText).toContain("Konflik data perlu direview");
  });

  it("adversarial: a bare physical-element count claim is rejected without any authority", () => {
    const result = verifyAndComposeClaims({
      responseText: "Lantai 2 memiliki 12 kolom.",
      toolsCalled: [],
      authority: { quantityAuthority: "none" },
    });
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.responseText).not.toContain("12 kolom");
  });

  it("adversarial: a drawing-context symbol count is not silently treated as a physical column count", () => {
    const result = verifyAndComposeClaims({
      responseText: "Terdapat 12 simbol K1 pada drawing context, jadi jumlah fisik kolom adalah 12.",
      toolsCalled: [],
      authority: { quantityAuthority: "none" },
    });
    expect(result.responseText).not.toContain("jumlah fisik kolom adalah 12");
  });

  it("treats Drawing Intelligence label counts and dimensions as written facts, never Core Engine results", () => {
    const toolResults: ToolResultRecord[] = [{
      result_id: "query_project_graph:0",
      tool: "query_project_graph",
      result: {
        human_drawing_view: {
          work_items: [{
            code: "K2", observed_label_count: 3, count_label: "3 label/simbol teramati",
            dimensions_text: "250 × 600 mm", count_is_final: false,
          }],
        },
      },
    }];
    const result = verifyAndComposeClaims({
      responseText: "K2 memiliki 3 label/simbol teramati dan ukuran tertulis 250 mm × 600 mm.",
      toolsCalled: ["query_project_graph"],
      authority: { quantityAuthority: "none", evidenceCount: 2 },
      toolResults,
    });
    const byType = Object.fromEntries(result.structuredClaims.map((claim) => [claim.claim_type, claim]));
    expect(byType.label_observation_count).toMatchObject({ authority_class: "written_fact", verification_status: "manual_review_required" });
    expect(result.structuredClaims.filter((claim) => claim.claim_type === "dimension").every((claim) => claim.authority_class === "written_fact")).toBe(true);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects a physical column count even when the same number exists as a Drawing Intelligence label observation", () => {
    const result = verifyAndComposeClaims({
      responseText: "Lantai 2 memiliki 3 kolom K2.",
      toolsCalled: ["query_project_graph"],
      authority: { quantityAuthority: "none", evidenceCount: 1 },
      toolResults: [{
        result_id: "query_project_graph:0", tool: "query_project_graph",
        result: { observed_label_count: 3, count_is_final: false },
      }],
    });
    expect(result.rejected).toHaveLength(1);
    expect(result.responseText).not.toContain("3 kolom");
  });

});


it("binds both sides of a compound written dimension to Drawing Intelligence provenance", () => {
  const result = verifyAndComposeClaims({
    responseText: "Ukuran tertulis K2 adalah 250 × 600 mm.",
    toolsCalled: ["query_project_graph"],
    authority: { quantityAuthority: "none", evidenceCount: 4 },
    toolResults: [{
      result_id: "query_project_graph:0",
      tool: "query_project_graph",
      result: { human_drawing_view: { work_items: [{ code: "K2", dimensions_text: "250 × 600 mm" }] } },
    }],
  });
  const dimensions = result.structuredClaims.filter((claim) => claim.claim_type === "dimension");
  expect(dimensions.map((claim) => claim.value).sort((a, b) => Number(a) - Number(b))).toEqual([250, 600]);
  expect(dimensions.every((claim) => claim.authority_class === "written_fact")).toBe(true);
  expect(result.rejected).toHaveLength(0);
});
