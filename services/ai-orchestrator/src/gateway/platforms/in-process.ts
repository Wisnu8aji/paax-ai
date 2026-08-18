import { sanitizeGatewayWorkEvent } from "../work-events";
import type {
  PlatformAdapter,
  PlatformDelivery,
  PlatformDeliveryReceipt,
  PlatformDeliveryTarget,
  PlatformInboundEvent,
} from "./types";
import { PlatformAdapterError } from "./types";

const MAX_TEXT_LENGTH = 32_000;
const MAX_ID_LENGTH = 256;

function requiredText(value: unknown, field: string, max = MAX_ID_LENGTH): string {
  if (typeof value !== "string") throw new PlatformAdapterError("invalid_inbound", `platform field ${field} is invalid`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new PlatformAdapterError("invalid_inbound", `platform field ${field} is invalid`);
  }
  return normalized;
}

export interface InProcessPlatformAdapterOptions {
  now?: () => string;
  sink?: (delivery: PlatformDelivery) => void | Promise<void>;
}

/** Local adapter for tests and in-process Command Room integrations; it owns no agent loop. */
export class InProcessPlatformAdapter implements PlatformAdapter {
  readonly id = "in-process";
  readonly deliveries: PlatformDelivery[] = [];
  private readonly now: () => string;
  private readonly sink?: (delivery: PlatformDelivery) => void | Promise<void>;
  private readonly deliveredByKey = new Map<string, string>();

  constructor(options: InProcessPlatformAdapterOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.sink = options.sink;
  }

  normalizeInbound(input: unknown): PlatformInboundEvent {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new PlatformAdapterError("invalid_inbound", "platform inbound event is invalid");
    const value = input as Record<string, unknown>;
    return {
      adapterId: this.id,
      externalEventId: requiredText(value.externalEventId, "externalEventId"),
      tenantId: requiredText(value.tenantId, "tenantId"),
      actorId: requiredText(value.actorId, "actorId"),
      conversationId: requiredText(value.conversationId, "conversationId"),
      text: requiredText(value.text, "text", MAX_TEXT_LENGTH),
      receivedAt: typeof value.receivedAt === "string" && value.receivedAt.trim() ? value.receivedAt.trim() : this.now(),
    };
  }

  async deliver(event: Parameters<PlatformAdapter["deliver"]>[0], target: PlatformDeliveryTarget): Promise<PlatformDeliveryReceipt> {
    const safeEvent = sanitizeGatewayWorkEvent(event);
    const deliveredAt = this.now();
    if (!safeEvent) return { ok: false, adapterId: this.id, externalEventId: target?.externalEventId ?? "unknown", deliveredAt, code: "invalid_event" };
    if (!target || typeof target !== "object") return { ok: false, adapterId: this.id, externalEventId: "unknown", eventId: safeEvent.eventId, deliveredAt, code: "invalid_target" };
    let externalEventId: string;
    let tenantId: string;
    let actorId: string;
    let conversationId: string;
    try {
      externalEventId = requiredText(target.externalEventId, "externalEventId");
      tenantId = requiredText(target.tenantId, "tenantId");
      actorId = requiredText(target.actorId, "actorId");
      conversationId = requiredText(target.conversationId, "conversationId");
    } catch {
      return { ok: false, adapterId: this.id, externalEventId: "invalid", eventId: safeEvent.eventId, deliveredAt, code: "invalid_target" };
    }
    if (safeEvent.conversationId !== conversationId) return { ok: false, adapterId: this.id, externalEventId, eventId: safeEvent.eventId, deliveredAt, code: "invalid_target" };
    const idempotencyKey = typeof target.idempotencyKey === "string" && target.idempotencyKey.trim()
      ? target.idempotencyKey.trim().slice(0, MAX_ID_LENGTH)
      : `${this.id}:${tenantId}:${externalEventId}:${safeEvent.eventId}`;
    const existingEventId = this.deliveredByKey.get(idempotencyKey);
    if (existingEventId) {
      if (existingEventId !== safeEvent.eventId) return { ok: false, adapterId: this.id, externalEventId, eventId: safeEvent.eventId, deliveredAt, code: "idempotency_conflict" };
      return { ok: true, adapterId: this.id, externalEventId, eventId: safeEvent.eventId, deliveredAt, duplicate: true };
    }
    const delivery: PlatformDelivery = { event: safeEvent, target: { tenantId, actorId, conversationId, externalEventId, ...(target.idempotencyKey ? { idempotencyKey } : {}) } };
    try {
      this.deliveredByKey.set(idempotencyKey, safeEvent.eventId);
      if (this.sink) await this.sink(delivery);
      else this.deliveries.push(delivery);
      return { ok: true, adapterId: this.id, externalEventId, eventId: safeEvent.eventId, deliveredAt, duplicate: false };
    } catch {
      this.deliveredByKey.delete(idempotencyKey);
      return { ok: false, adapterId: this.id, externalEventId, eventId: safeEvent.eventId, deliveredAt, code: "delivery_failed" };
    }
  }
}
