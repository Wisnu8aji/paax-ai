import { describe, expect, it } from "vitest";
import { createModelRouter } from "../../src/providers/model-router";

describe("PAAX Model Router (paax-models)", () => {
  it("routes tasks to specialized models according to task profile", () => {
    const router = createModelRouter();

    const planningRoute = router.routeTask("planning");
    expect(planningRoute.modelAlias).toBe("noir");
    expect(planningRoute.reasoningEffort).toBe("max");

    const execRoute = router.routeTask("execution");
    expect(execRoute.modelAlias).toBe("lucent");

    const reviewRoute = router.routeTask("review");
    expect(reviewRoute.modelAlias).toBe("arete");
  });

  it("resolves fallback chain and falls back after repeated failures", () => {
    const router = createModelRouter();

    const normalChain = router.resolveFallbackChain("lucent");
    expect(normalChain.selected.modelAlias).toBe("lucent");

    // Simulate 3 failures on primary
    router.recordFailure("lucent");
    router.recordFailure("lucent");
    router.recordFailure("lucent");

    const fallbackChain = router.resolveFallbackChain("lucent");
    expect(fallbackChain.selected.modelAlias).toBe("arete");
    expect(fallbackChain.reason).toContain("degraded");
  });

  it("resets failure counts upon success", () => {
    const router = createModelRouter();
    router.recordFailure("lucent");
    router.recordFailure("lucent");
    router.recordSuccess("lucent");

    const chain = router.resolveFallbackChain("lucent");
    expect(chain.selected.modelAlias).toBe("lucent");
  });
});
