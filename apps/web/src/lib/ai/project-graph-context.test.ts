import { buildProjectGraphSystemContext } from "./project-graph-context";
import { describe, expect, it } from "vitest";

describe("buildProjectGraphSystemContext", () => {
  it("requires graph success and preserves sheet/page evidence citations", () => {
    expect(buildProjectGraphSystemContext({ status: "not_ready" })).toBeNull();
    expect(buildProjectGraphSystemContext({ status: "success", nodes: [{ node_id: "J2", type: "element", name: "Jendela J2", discipline: "architecture", confidence: 0.9 }], evidence: [{ evidence_id: "EV-1", document_id: "DOC", sheet_id: "A-21", page_index: 20, raw_text: "J2" }] })).toContain("[A-21 p.21]");
  });
});
