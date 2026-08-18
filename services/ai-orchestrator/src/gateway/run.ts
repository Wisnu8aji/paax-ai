import { createHash } from "node:crypto";
import { Router, type Request } from "express";
import {
  GatewayTurnRequestSchema,
  type GatewayTurnPrepared,
  type GatewayTurnRequest,
} from "@paax/schemas";
import { resolveModelProfile, type AppConfig, type ModelProfile } from "../config";
import type { ProjectContextBinding } from "../agentic/types";
import type { ConversationEventSink, ConversationResult } from "../agent/conversation-loop";
import type { FinalizedTurnResult } from "../agent/turn-finalizer";
import { observeSafely, type RuntimeObservation } from "../agent/monitoring";
import type { TurnContext } from "../agent/turn-context";
import { GatewayWorkEventEmitter, emitConversationEvent } from "./work-events";
import { createWorkEventStreamConsumer, SSEWorkEventOutput } from "./stream-consumer";
import { ApprovalService } from "../agentic/approval-service";
import {
  normalizeSessionSource,
  SessionBindingError,
  type SessionRecord,
  type SessionSource,
  type SessionStore,
} from "./session";
import type { RunRecord, SessionDB } from "../state/session-db";
import { DurableWorkEventStore } from "../state/work-events";

export interface AuthenticatedGatewayContext {
  actorId: string;
  tenantId: string;
}

export interface PreparedAgentLike {
  runId: string;
  session: SessionRecord;
  profile: ModelProfile;
  prompt: {
    version: string;
    systemPrompt: string;
    stableHash: string;
    sectionSizes: { stable: number; context: number; volatile: number };
    injectionFindings: readonly string[];
  };
  tools: readonly unknown[];
  context: TurnContext;
  reasoningEffort: GatewayTurnRequest["reasoningEffort"];
  thinking: GatewayTurnRequest["thinking"];
  lifecycle: "prepared";
}

export interface AgentTurnLikeInput {
  runId: string;
  session: SessionRecord;
  messages: GatewayTurnRequest["messages"];
  modelAlias: string;
  reasoningEffort: GatewayTurnRequest["reasoningEffort"];
  thinking: GatewayTurnRequest["thinking"];
}

export interface GatewayAgentLike {
  initializeTurn(input: AgentTurnLikeInput): Promise<PreparedAgentLike>;
  runPreparedTurn?(prepared: PreparedAgentLike, signal: AbortSignal, events: ConversationEventSink): Promise<ConversationResult | FinalizedTurnResult>;
  markHandedOff?(runId: string, sessionId: string): void;
}

export interface GatewayRunnerDependencies {
  config: AppConfig;
  sessionStore: SessionStore;
  createAgent: (session: SessionRecord) => GatewayAgentLike;
  findRunBinding?: (runId: string) => Promise<ProjectContextBinding | null>;
  approvalService?: ApprovalService;
  sessionDb?: SessionDB;
  workEventStore?: DurableWorkEventStore;
  observation?: Pick<RuntimeObservation, "onDelivery">;
  now?: () => string;
}

type GatewayErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 503;

export class GatewayError extends Error {
  readonly status: GatewayErrorStatus;
  readonly code: string;

  constructor(code: string, message: string, status: GatewayErrorStatus) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.status = status;
  }
}

export interface PreparedGatewayExecution {
  request: GatewayTurnRequest;
  auth: AuthenticatedGatewayContext;
  source: SessionSource;
  session: SessionRecord;
  runId: string;
  profile: ModelProfile;
  agent: GatewayAgentLike;
  prepared: PreparedAgentLike;
  durableRun?: RunRecord;
}

function safeAuthValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 256) {
    throw new GatewayError("authentication_required", `authenticated ${field} is required`, 401);
  }
  return value.trim();
}

function requestTooLarge(request: unknown, maxHistoryMessages: number, maxMessageChars: number): boolean {
  if (!request || typeof request !== "object") return false;
  const candidate = request as { messages?: unknown };
  if (Array.isArray(candidate.messages) && candidate.messages.length > maxHistoryMessages) return true;
  return Array.isArray(candidate.messages) && candidate.messages.some((message) => (
    !!message && typeof message === "object" && typeof (message as { content?: unknown }).content === "string" &&
    ((message as { content: string }).content.length > maxMessageChars)
  ));
}

function compareRunBinding(existing: ProjectContextBinding, source: SessionSource, auth: AuthenticatedGatewayContext): void {
  if (existing.tenantId !== auth.tenantId || existing.actorId !== auth.actorId) {
    throw new GatewayError("run_binding_forbidden", "run binding is outside the authenticated scope", 403);
  }
  if (existing.projectId !== source.projectId || existing.conversationId !== source.conversationId) {
    throw new GatewayError("run_binding_conflict", "run binding does not match the requested session", 409);
  }
  if (source.snapshotId && existing.snapshotId && source.snapshotId !== existing.snapshotId) {
    throw new GatewayError("run_binding_conflict", "run binding does not match the requested snapshot", 409);
  }
  if (source.documentRevisionId && existing.documentRevisionId && source.documentRevisionId !== existing.documentRevisionId) {
    throw new GatewayError("run_binding_conflict", "run binding does not match the requested document revision", 409);
  }
}

function makeRunId(request: GatewayTurnRequest, session: SessionRecord, _now: string): string {
  if (request.runId) return request.runId;
  const material = JSON.stringify({
    sessionId: session.sessionId,
    correlationId: request.clientCorrelationId ?? "",
    messages: request.messages,
  });
  return `turn-${createHash("sha256").update(material, "utf8").digest("hex").slice(0, 48)}`;
}

function responseProfile(profile: ModelProfile, request: GatewayTurnRequest) {
  return {
    alias: profile.alias,
    provider: profile.provider,
    model: profile.model,
    transport: profile.transport,
    requestStyle: profile.requestStyle,
    supportsThinking: profile.supportsThinking,
    selectedEffort: request.reasoningEffort,
    thinking: request.thinking,
    ...(profile.reasoningEffortMap ? { reasoningEffortMap: profile.reasoningEffortMap } : {}),
  } as const;
}

function responsePrompt(prompt: PreparedAgentLike["prompt"]) {
  return {
    version: prompt.version,
    stableHash: prompt.stableHash,
    sectionSizes: prompt.sectionSizes,
    injectionFindings: [...prompt.injectionFindings],
  };
}

function asPreparedResponse(
  prepared: PreparedAgentLike,
  session: SessionRecord,
  profile: ModelProfile,
  request: GatewayTurnRequest,
  handoff: "service-conversation-loop" | "legacy-web-provider",
): GatewayTurnPrepared {
  return {
    protocolVersion: "command-room.gateway.v1",
    runId: prepared.runId,
    sessionId: session.sessionId,
    sessionKeyFingerprint: session.keyFingerprint,
    binding: {
      ...session.source,
    },
    profile: responseProfile(prepared.profile ?? profile, request),
    prompt: responsePrompt(prepared.prompt),
    handoff,
  };
}

export class GatewayRunner {
  constructor(private readonly deps: GatewayRunnerDependencies) {}

  async prepareExecution(request: unknown, auth: AuthenticatedGatewayContext): Promise<PreparedGatewayExecution> {
    const parsed = GatewayTurnRequestSchema.safeParse(request);
    if (!parsed.success) {
      const status = requestTooLarge(request, this.deps.config.gateway.maxHistoryMessages, this.deps.config.gateway.maxMessageChars) ? 413 : 400;
      throw new GatewayError(status === 413 ? "gateway_request_too_large" : "invalid_gateway_request", "gateway request is invalid", status);
    }
    const data = parsed.data;
    if (data.messages.length > this.deps.config.gateway.maxHistoryMessages || data.messages.some((message) => message.content.length > this.deps.config.gateway.maxMessageChars)) {
      throw new GatewayError("gateway_request_too_large", "gateway request exceeds configured limits", 413);
    }

    const actorId = safeAuthValue(auth.actorId, "actor identity");
    const tenantId = safeAuthValue(auth.tenantId, "tenant identity");
    const source = normalizeSessionSource({ ...data.session, actorId, tenantId });

    if (data.runId && this.deps.findRunBinding) {
      const existing = await this.deps.findRunBinding(data.runId);
      if (existing) compareRunBinding(existing, source, { actorId, tenantId });
    }

    const profile = resolveModelProfile(this.deps.config, data.modelAlias);
    if (!profile) throw new GatewayError("configuration_unavailable", "requested model profile is unavailable", 503);
    if (data.thinking === "on" && !profile.supportsThinking) {
      throw new GatewayError("profile_capability_unavailable", "requested profile does not support thinking", 503);
    }
    if (profile.reasoningEffortMap && !profile.reasoningEffortMap[data.reasoningEffort]) {
      throw new GatewayError("profile_capability_unavailable", "requested reasoning effort is unavailable", 503);
    }

    const session = await this.deps.sessionStore.resolve(source);
    const now = this.deps.now?.() ?? new Date().toISOString();
    const runId = makeRunId(data, session, now);
    let durableRun: RunRecord | undefined;
    if (this.deps.sessionDb) {
      try {
        durableRun = this.deps.sessionDb.appendRun({
          runId,
          sessionId: session.sessionId,
          idempotencyKey: data.runId ?? runId,
          inputHash: createHash("sha256").update(JSON.stringify(data.messages), "utf8").digest("hex"),
          startedAt: now,
        });
        this.deps.sessionDb.appendMessages({
          sessionId: session.sessionId,
          messages: data.messages.map((message, index) => ({ role: message.role, content: message.content, idempotencyKey: `${runId}:message:${index}` })),
        });
      } catch {
        throw new GatewayError("state_unavailable", "durable session state is unavailable", 503);
      }
    }
    let prepared: PreparedAgentLike;
    const agent = this.deps.createAgent(session);
    try {
      prepared = await agent.initializeTurn({
        runId,
        session,
        messages: data.messages,
        modelAlias: data.modelAlias,
        reasoningEffort: data.reasoningEffort,
        thinking: data.thinking,
      });
    } catch {
      throw new GatewayError("preparation_unavailable", "agent turn preparation is unavailable", 503);
    }
    if (prepared.lifecycle !== "prepared" || prepared.runId !== runId) {
      throw new GatewayError("preparation_invalid", "agent preparation did not produce a valid handoff", 503);
    }
    if (
      prepared.profile.alias !== profile.alias ||
      prepared.profile.provider !== profile.provider ||
      prepared.profile.model !== profile.model ||
      prepared.profile.transport !== profile.transport ||
      (prepared.profile.requestStyle !== undefined && prepared.profile.requestStyle !== profile.requestStyle)
    ) {
      throw new GatewayError("preparation_invalid", "agent preparation profile does not match configuration", 503);
    }

    return { request: data, auth: { actorId, tenantId }, source, session, runId, profile, agent, prepared, durableRun };
  }

  async attachExecution(execution: PreparedGatewayExecution): Promise<void> {
    await this.deps.sessionStore.attachRun(execution.session.sessionId, execution.runId);
  }

  async prepareTurn(request: unknown, auth: AuthenticatedGatewayContext, options: { mode?: "service" | "legacy" } = {}): Promise<GatewayTurnPrepared> {
    const mode = options.mode ?? "service";
    if (mode === "legacy" && !this.deps.config.gateway.legacyHandoffEnabled) {
      throw new GatewayError("handoff_unavailable", "legacy web handoff is disabled", 503);
    }
    const execution = await this.prepareExecution(request, auth);
    await this.attachExecution(execution);
    if (mode === "legacy") execution.agent.markHandedOff?.(execution.runId, execution.session.sessionId);
    return asPreparedResponse(execution.prepared, execution.session, execution.profile, execution.request, mode === "legacy" ? "legacy-web-provider" : "service-conversation-loop");
  }

  async executePrepared(execution: PreparedGatewayExecution, signal: AbortSignal, events: ConversationEventSink): Promise<ConversationResult | FinalizedTurnResult> {
    if (!execution.agent.runPreparedTurn) throw new GatewayError("execution_unavailable", "canonical agent execution is unavailable", 503);
    const result = await execution.agent.runPreparedTurn(execution.prepared, signal, events);
    if (this.deps.sessionDb) {
      const envelope = "envelope" in result && result.envelope ? result.envelope : undefined;
      const status = envelope?.status === "completed" || result.status === "completed"
        ? "completed"
        : envelope?.status === "aborted" || result.stopReason === "aborted"
          ? "aborted"
          : envelope?.status === "rejected" || envelope?.stopReason === "approval_rejected"
            ? "rejected"
            : "failed";
      const content = typeof envelope?.content === "string" ? envelope.content : result.content;
      this.deps.sessionDb.transitionRun({ runId: execution.runId, status, final: envelope ?? { status: result.status, stopReason: result.stopReason } });
      if (typeof content === "string" && content.trim()) {
        this.deps.sessionDb.appendMessages({ sessionId: execution.session.sessionId, messages: [{ role: "assistant", content, idempotencyKey: `${execution.runId}:assistant-final` }] });
      }
    }
    return result;
  }
}

function actorFromRequest(req: Request): string {
  return typeof (req as any).user?.uid === "string" ? (req as any).user.uid : "";
}

function tenantFromRequest(): string {
  return process.env.PAAX_TENANT_ID?.trim() || process.env.PAAX_PORTABLE_TENANT_ID?.trim() || "portable-local";
}

function approvalRolesFromRequest(req: Request): string[] {
  const roles = (req as any).user?.roles;
  if (Array.isArray(roles)) return roles.filter((role): role is string => typeof role === "string").map((role) => role.trim()).filter(Boolean).slice(0, 16);
  return (process.env.PAAX_PORTABLE_APPROVAL_ROLES?.split(",") ?? []).map((role) => role.trim()).filter(Boolean).slice(0, 16);
}

function safeError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (error instanceof SessionBindingError) return new GatewayError(error.code, error.message, error.status);
  return new GatewayError("gateway_preparation_failed", "gateway preparation failed", 503);
}

function parseLastEventSequence(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim();
  const candidate = /^\d+$/u.test(normalized) ? normalized : normalized.split(":").at(-1) ?? "";
  const sequence = Number(candidate);
  if (!Number.isSafeInteger(sequence) || sequence < 0) return undefined;
  return sequence;
}

export function createGatewayRouter(deps: GatewayRunnerDependencies): Router {
  const router = Router();
  const runner = new GatewayRunner(deps);
  const workEventStore = deps.workEventStore ?? (deps.sessionDb ? new DurableWorkEventStore(deps.sessionDb) : undefined);
  router.post("/command-room/turn/prepare", async (req, res) => {
    try {
      const prepared = await runner.prepareTurn(req.body, {
        actorId: actorFromRequest(req),
        tenantId: tenantFromRequest(),
      }, { mode: req.header("X-PAAX-Gateway-Mode") === "legacy" ? "legacy" : "service" });
      return res.status(200).json(prepared);
    } catch (error) {
      const safe = safeError(error);
      return res.status(safe.status).json({ error: safe.code, message: safe.message });
    }
  });
  router.post("/command-room/turn/stream", async (req, res) => {
    let execution: PreparedGatewayExecution;
    try {
      execution = await runner.prepareExecution(req.body, {
        actorId: actorFromRequest(req),
        tenantId: tenantFromRequest(),
      });
      await runner.attachExecution(execution);
    } catch (error) {
      const safe = safeError(error);
      return res.status(safe.status).json({ error: safe.code, message: safe.message });
    }

    const controller = new AbortController();
    const afterSequence = parseLastEventSequence(req.header("Last-Event-ID"));
    const replayOnly = afterSequence !== undefined && execution.durableRun !== undefined && execution.durableRun.status !== "queued";
    const emitter = new GatewayWorkEventEmitter({
      runId: execution.runId,
      conversationId: execution.session.source.conversationId,
      onEvent: workEventStore
        ? (event) => {
          workEventStore.append({
            runId: execution.runId,
            sessionId: execution.session.sessionId,
            sequence: event.sequence,
            eventId: event.eventId,
            type: event.type,
            payload: event,
            timestamp: event.timestamp,
          });
        }
        : undefined,
    });
    const output = new SSEWorkEventOutput(res);
    const consumer = createWorkEventStreamConsumer(emitter, {
      output,
      ...(afterSequence !== undefined && workEventStore
        ? { replay: { source: workEventStore, runId: execution.runId, sessionId: execution.session.sessionId, afterSequence } }
        : {}),
      createErrorEvent: (failure) => emitter.emit("error", {
        errorCode: failure.code,
        errorMessage: "delivery gagal",
        retryable: false,
      }),
    });
    let deliveryFailure: Promise<void> | undefined;
    let terminalEventSent = false;
    const publish = (event: ReturnType<GatewayWorkEventEmitter["emit"]>) => {
      if (!event || controller.signal.aborted) return event;
      const delivery = consumer.push(event);
      void delivery.catch((error) => {
        deliveryFailure ??= consumer.fail(error);
        if (!controller.signal.aborted) controller.abort();
      });
      return event;
    };
    const emit = (type: Parameters<GatewayWorkEventEmitter["emit"]>[0], data: Record<string, unknown>) => publish(emitter.emit(type, data));
    const onAborted = () => {
      if (!controller.signal.aborted) controller.abort();
      void consumer.abort("client disconnected").catch(() => undefined);
    };
    const onClosed = () => { if (!res.writableEnded) onAborted(); };
    req.once("aborted", onAborted);
    res.once("close", onClosed);
    res.status(200).setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    if (replayOnly) {
      try {
        await consumer.replay();
        await consumer.complete();
      } catch (error) {
        await consumer.fail(error);
      }
      req.removeListener("aborted", onAborted);
      res.removeListener("close", onClosed);
      if (!res.writableEnded) res.end();
      return undefined;
    }

    emit("turn.started", { phase: "starting", statusLabel: "Turn dimulai" });
    emit("status.update", { phase: "context", statusLabel: "Membangun konteks" });
    try {
      const events: ConversationEventSink = {
        emit: (event) => {
          const mapped = emitConversationEvent(emitter, event);
          publish(mapped);
        },
      };
      const result = await runner.executePrepared(execution, controller.signal, events);
      const finalResult = result as ConversationResult & Partial<Pick<FinalizedTurnResult, "envelope">>;
      const finalStatus = finalResult.envelope?.status ?? finalResult.status;
      const finalStopReason = finalResult.envelope?.stopReason ?? finalResult.stopReason;
      if (finalStatus === "completed" && !controller.signal.aborted) {
        terminalEventSent = true;
        emit("turn.completed", { finalMarkdown: finalResult.content, stopReason: finalStopReason });
      } else if (!controller.signal.aborted) {
        terminalEventSent = true;
        emit("error", { errorCode: finalStopReason, errorMessage: "turn berhenti sebelum selesai" });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        terminalEventSent = true;
        emit("error", { errorCode: "gateway_execution_failed", errorMessage: "turn gagal dieksekusi" });
      }
    } finally {
      if (deliveryFailure) {
        await deliveryFailure.catch(() => undefined);
        await consumer.abort("delivery failure");
      } else if (controller.signal.aborted) {
        await consumer.abort("request aborted");
      } else if (terminalEventSent) {
        await consumer.complete();
      } else {
        await consumer.fail(new Error("turn did not produce a terminal event"));
      }
      await observeSafely(deps.observation?.onDelivery, { runId: execution.runId, ...consumer.metrics() });
      req.removeListener("aborted", onAborted);
      res.removeListener("close", onClosed);
      if (!res.writableEnded) res.end();
    }
    return undefined;
  });
  router.post("/command-room/approval/resolve", async (req, res) => {
    const body = req.body as Record<string, unknown> | null;
    const approvalId = typeof body?.approvalId === "string" ? body.approvalId.trim() : "";
    const decision = body?.decision === "approved" || body?.decision === "denied" ? body.decision : "";
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!approvalId || !sessionId || !decision) return res.status(400).json({ error: "invalid_approval_request" });
    const service = deps.approvalService;
    if (!service) return res.status(503).json({ error: "approval_service_unavailable" });
    try {
      const actorId = safeAuthValue(actorFromRequest(req), "actor identity");
      const tenantId = safeAuthValue(tenantFromRequest(), "tenant identity");
      const approval = service.get(approvalId);
      const session = await deps.sessionStore.get(sessionId);
      if (!approval || !session || session.source.tenantId !== tenantId || session.source.actorId !== approval.actorId || session.source.conversationId !== approval.conversationId) {
        return res.status(403).json({ error: "approval_binding_forbidden" });
      }
      const resolved = service.decideScoped(approvalId, actorId, approvalRolesFromRequest(req), decision === "approved" ? "approved" : "rejected", typeof body?.note === "string" ? body.note : undefined, {
        tenantId,
        projectId: approval.projectId,
        conversationId: approval.conversationId,
        runId: approval.runId,
        ...(typeof body?.argumentsHash === "string" ? { argumentsHash: body.argumentsHash.trim().slice(0, 128) } : {}),
        ...(typeof body?.bindingFingerprint === "string" ? { bindingFingerprint: body.bindingFingerprint.trim().slice(0, 128) } : {}),
      });
      return res.status(200).json({ ok: true, approvalId: resolved.approvalId, decision });
    } catch (error) {
      const safe = safeError(error);
      return res.status(safe.status).json({ error: safe.code, message: safe.message });
    }
  });
  return router;
}
