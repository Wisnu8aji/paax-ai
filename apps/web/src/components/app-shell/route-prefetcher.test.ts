import { describe, expect, it } from "vitest";

import { buildDashboardPrefetchRoutes } from "./route-prefetch-routes";

describe("dashboard route prefetch list", () => {
  it("includes common dashboard routes and active project modules without duplicates", () => {
    const routes = buildDashboardPrefetchRoutes([
      { id: "p-1" },
      { id: "p-2" },
      { id: "p-1" },
    ]);

    expect(routes).toContain("/dashboard");
    expect(routes).toContain("/proyek");
    expect(routes).toContain("/database-ahsp");
    expect(routes).toContain("/proyek/p-1/rab");
    expect(routes).toContain("/proyek/p-1/schedule");
    expect(routes).toContain("/proyek/p-2/chat");
    expect(new Set(routes).size).toBe(routes.length);
  });
});
