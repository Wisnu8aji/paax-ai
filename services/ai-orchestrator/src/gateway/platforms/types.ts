import type { GatewayWorkEvent } from "@paax/schemas";

export interface PlatformInboundEvent {
  adapterId: string;
  externalEventId: string;
  tenantId: string;
  actorId: string;
  conversationId: string;
  text: string;
  receivedAt: string;
}

export interface PlatformDeliveryTarget {
  tenantId: string;
  actorId: string;
  conversationId: string;
  externalEventId: string;
  idempotencyKey?: string;
}

export interface PlatformDeliveryReceipt {
  ok: boolean;
  adapterId: string;
  externalEventId: string;
  eventId?: string;
  deliveredAt: string;
  duplicate?: boolean;
  code?: "platform_not_configured" | "invalid_event" | "invalid_target" | "delivery_failed" | "idempotency_conflict";
}

export interface PlatformDelivery {
  event: GatewayWorkEvent;
  target: PlatformDeliveryTarget;
}

export interface PlatformAdapter {
  readonly id: string;
  normalizeInbound(input: unknown): PlatformInboundEvent;
  deliver(event: GatewayWorkEvent, target: PlatformDeliveryTarget): Promise<PlatformDeliveryReceipt>;
}

export class PlatformAdapterError extends Error {
  constructor(readonly code: "platform_not_configured" | "invalid_inbound", message: string) {
    super(message);
    this.name = "PlatformAdapterError";
  }
}
