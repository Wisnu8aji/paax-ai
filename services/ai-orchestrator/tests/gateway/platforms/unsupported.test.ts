import { describe, expect, it } from "vitest";
import { createPlatformRegistry } from "../../../src/gateway/platforms";
import { UnsupportedPlatformAdapter } from "../../../src/gateway/platforms/unsupported";

describe("unsupported platform adapters", () => {
  it("returns a typed unavailable receipt and never reports delivery success", async () => {
    const adapter = new UnsupportedPlatformAdapter("telegram");
    const receipt = await adapter.deliver({} as never, { tenantId: "tenant-a", actorId: "actor-a", conversationId: "conversation-a", externalEventId: "external-1" });
    expect(receipt).toMatchObject({ ok: false, code: "platform_not_configured", adapterId: "telegram" });
  });

  it("enforces the configured allowlist and rejects adapter id collisions", () => {
    const registry = createPlatformRegistry({ allowlist: ["in-process"] });
    expect(registry.get("telegram")).toBeUndefined();
    expect(() => registry.register(new UnsupportedPlatformAdapter("in-process"))).toThrow(/collision|registered/i);
  });
});
