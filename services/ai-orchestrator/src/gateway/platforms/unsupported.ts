import type { GatewayWorkEvent } from "@paax/schemas";
import type { PlatformAdapter, PlatformDeliveryReceipt, PlatformDeliveryTarget, PlatformInboundEvent } from "./types";
import { PlatformAdapterError } from "./types";

/** Explicit future-platform boundary. It never performs network delivery. */
export class UnsupportedPlatformAdapter implements PlatformAdapter {
  readonly id: string;

  constructor(id: string) {
    const normalized = id.trim();
    if (!normalized) throw new Error("platform adapter id is required");
    this.id = normalized;
  }

  normalizeInbound(_input: unknown): PlatformInboundEvent {
    throw new PlatformAdapterError("platform_not_configured", `${this.id} platform adapter is not configured`);
  }

  async deliver(_event: GatewayWorkEvent, target: PlatformDeliveryTarget): Promise<PlatformDeliveryReceipt> {
    return {
      ok: false,
      adapterId: this.id,
      externalEventId: typeof target?.externalEventId === "string" ? target.externalEventId.slice(0, 256) : "unknown",
      deliveredAt: new Date().toISOString(),
      code: "platform_not_configured",
    };
  }
}
