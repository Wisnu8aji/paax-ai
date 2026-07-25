import { describe, expect, it } from "vitest";

import { formatTkgBbsNumber, hasTkgBbs } from "./tkg-bbs-format";

describe("TKG BBS display helpers", () => {
  it("formats engine numbers without recomputing BBS", () => {
    expect(formatTkgBbsNumber(12.626689)).toBe("12,6267");
    expect(formatTkgBbsNumber(3)).toBe("3");
    expect(formatTkgBbsNumber(null)).toBe("-");
  });

  it("detects empty BBS payloads from the engine", () => {
    expect(hasTkgBbs(null)).toBe(false);
    expect(hasTkgBbs({ marks: [], per_diameter: [], total_waste_kg: 0 })).toBe(false);
    expect(hasTkgBbs({
      marks: [{ mark: "M001" }],
      per_diameter: [],
      total_waste_kg: 0,
    })).toBe(true);
  });
});
