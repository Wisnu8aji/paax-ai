import { createHash } from "node:crypto";
import type { AppConfig, ModelProfile } from "../config";
import type { ProviderTransport } from "../providers/base";
import type { SessionRecord } from "../gateway/session";
import type { ProjectContextBinding } from "../agentic/types";
import type { SubagentLifecycle } from "./subagent-lifecycle";
import type { ToolDefinition } from "../tools/types";
import type { ContextFileLoader, ContextFileSnapshot } from "./context-files";
import { createProviderTransport } from "../providers/transports";
import { ApprovalService } from "../agentic/approval-service";
import { IterationBudget } from "./iteration-budget";
import { ContextCompressor, type ContextMessage } from "./context-compressor";
import { runConversation, type ConversationEventSink, type ConversationHooks, type ConversationResult, type ConversationEvent } from "./conversation-loop";
import { ToolExecutor, type ToolExecutorEvent } from "./tool-executor";
import { TurnContext } from "./turn-context";
import { TurnJournal } from "./turn-state";
import { finalizeTurn, type FinalizeTurnInput, type FinalizedTurnResult, type TurnUsageAggregate } from "./turn-finalizer";
import { createBoundedLoopObserver, observeSafely, type RuntimeObservation } from "./monitoring";
import { ALL_LOOP_HOOK_STAGES, type LoopHook, type LoopHookFailure } from "./loop-hooks";
import { toProviderTools } from "../tools/model-tools";
import { createDelegateTool } from "../tools/delegate-tool";
import { withToolPolicy } from "../tools/tool-policy";
import type { PluginMiddlewarePipeline } from "../plugins/middleware";
import { selectTools, type ToolsetSelection } from "../tools/toolsets";
import type { McpToolSource } from "../tools/mcp/types";
import {
  buildPrompt,
  type AgentMessage,
  type BuiltPrompt,
  type ContextSnippet,
  type MemorySummary,
  type SkillSummary,
} from "./prompt-builder";

export type AgentLifecycle = "created" | "initialized" | "prepared" | "running" | "completed" | "failed" | "handed_off";

export type AgentRuntimeEvent =
  | { type: "created"; lifecycle: "created"; metadata: Readonly<Record<string, string>> }
  | { type: "initialized"; lifecycle: "initialized"; runId: string; sessionId: string; metadata: Readonly<Record<string, string>> }
  | { type: "prepared"; lifecycle: "prepared"; runId: string; sessionId: string; metadata: Readonly<Record<string, string | number>> }
  | { type: "handoff"; lifecycle: "handed_off"; runId: string; sessionId: string; metadata: Readonly<Record<string, string>> };

export interface ContextEngine {
  getContext(input: { session: SessionRecord; maxChars: number }): Promise<readonly ContextSnippet[]> | readonly ContextSnippet[];
}

export interface MemorySummaryProvider {
  getSummaries?(input: { session: SessionRecord; maxItems: number }): Promise<readonly MemorySummary[]> | readonly MemorySummary[];
}

export interface SkillSummaryProvider {
  getSummaries?(input: { session: SessionRecord; maxItems: number }): Promise<readonly SkillSummary[]> | readonly SkillSummary[];
}

export interface AIAgentDependencies {
  config: AppConfig;
  resolveProfile: (alias: string) => ModelProfile | undefined;
  tools: readonly ToolDefinition[];
  contextEngine?: ContextEngine;
  contextCompressor?: ContextCompressor;
  memoryProvider?: MemorySummaryProvider;
  skillProvider?: SkillSummaryProvider;
  contextFileLoader?: ContextFileLoader;
  contextFileRoot?: string | ((session: SessionRecord) => string | undefined);
  transport?: ProviderTransport;
  transportFactory?: (profile: ModelProfile, config: AppConfig) => ProviderTransport;
  approvalService?: ApprovalService;
  journalFactory?: (turnId?: string) => TurnJournal;
  finalizer?: (input: FinalizeTurnInput) => FinalizedTurnResult;
  onUsage?: (usage: TurnUsageAggregate) => void | Promise<void>;
  observation?: RuntimeObservation;
  subagentFactory?: (input: SubagentFactoryInput) => SubagentLifecycle;
  pluginMiddleware?: PluginMiddlewarePipeline;
  loopHooks?: readonly LoopHook[];
  toolSelection?: ToolsetSelection;
  mcpSource?: McpToolSource;
  clock?: () => number;
  onEvent?: (event: AgentRuntimeEvent) => void;
  now?: () => string;
  allowedToolScopes?: readonly string[];
}

export interface SubagentFactoryInput {
  runId: string;
  session: SessionRecord;
  binding: ProjectContextBinding;
  bindingId: string;
  allowedScopes: readonly string[];
  allowedTools: readonly string[];
}

export interface AgentTurnInput {
  runId: string;
  session: SessionRecord;
  messages: readonly AgentMessage[];
  modelAlias: string;
  reasoningEffort: "low" | "medium" | "high" | "max";
  thinking: "on" | "off";
}

export interface PreparedAgentTurn {
  runId: string;
  session: SessionRecord;
  profile: ModelProfile;
  prompt: BuiltPrompt;
  tools: readonly ToolDefinition[];
  context: TurnContext;
  reasoningEffort: AgentTurnInput["reasoningEffort"];
  thinking: AgentTurnInput["thinking"];
  lifecycle: "prepared";
}

export class AgentRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRuntimeError";
  }
}

export type { RuntimeObservation } from "./monitoring";

function safeError(message: string): AgentRuntimeError {
  return new AgentRuntimeError(message);
}

function bindingId(binding: ProjectContextBinding): string {
  return createHash("sha256").update(JSON.stringify({
    tenantId: binding.tenantId,
    projectId: binding.projectId,
    actorId: binding.actorId,
    conversationId: binding.conversationId,
    snapshotId: binding.snapshotId ?? "",
    documentRevisionId: binding.documentRevisionId ?? "",
  }), "utf8").digest("hex");
}

export class AIAgent {
  private currentLifecycle: AgentLifecycle = "created";
  private readonly dependencies: AIAgentDependencies;
  private readonly readOnlyTools: readonly ToolDefinition[];

  constructor(dependencies: AIAgentDependencies) {
    this.dependencies = dependencies;
    const allowedScopes = dependencies.allowedToolScopes ? new Set(dependencies.allowedToolScopes) : undefined;
    const scopedTools = [...dependencies.tools].filter((tool) => {
      const scope = (tool as ToolDefinition & { scope?: string }).scope ?? tool.policy?.scope;
      return !allowedScopes || !scope || allowedScopes.has(scope);
    });
    this.readOnlyTools = Object.freeze(dependencies.toolSelection ? [...selectTools(scopedTools, dependencies.toolSelection)] : scopedTools);
    this.emit({ type: "created", lifecycle: "created", metadata: {} });
  }

  get lifecycle(): AgentLifecycle {
    return this.currentLifecycle;
  }

  async initializeTurn(input: AgentTurnInput): Promise<PreparedAgentTurn> {
    if (this.currentLifecycle !== "created") throw safeError(`agent already initialized in lifecycle ${this.currentLifecycle}`);
    const modelAlias = input.modelAlias.trim();
    const profile = this.dependencies.resolveProfile(modelAlias);
    if (!profile || profile.alias !== modelAlias) throw safeError("requested model profile is unavailable");
    if (input.thinking === "on" && !profile.supportsThinking) throw safeError("selected profile does not support thinking");
    if (profile.reasoningEffortMap && !profile.reasoningEffortMap[input.reasoningEffort]) throw safeError("requested reasoning effort is unavailable");
    if (!input.runId.trim()) throw safeError("runId is required");
    if (!input.messages.length) throw safeError("at least one turn message is required");
    if (input.messages.length > this.dependencies.config.gateway.maxHistoryMessages) throw safeError("turn history exceeds the configured limit");
    for (const message of input.messages) {
      if (message.role !== "user" && message.role !== "assistant") throw safeError("system messages are not permitted");
      if (!message.content.trim()) throw safeError("turn message content is required");
      if (message.content.length > this.dependencies.config.gateway.maxMessageChars) throw safeError("turn message exceeds the configured limit");
    }

    this.currentLifecycle = "initialized";
    this.emit({
      type: "initialized",
      lifecycle: "initialized",
      runId: input.runId,
      sessionId: input.session.sessionId,
      metadata: { profileAlias: profile.alias, transport: profile.transport },
    });

    let workspaceSnapshot: readonly ContextSnippet[] = [];
    let memorySummaries: readonly MemorySummary[] = [];
    let skillSummaries: readonly SkillSummary[] = [];
    let contextFileSnapshot: ContextFileSnapshot | undefined;
    let turnTools = this.readOnlyTools;
    let turnMessages = [...input.messages];
    if (this.dependencies.contextCompressor) {
      try {
        const compressed = this.dependencies.contextCompressor.compress({
          sessionId: input.session.sessionId,
          messages: input.messages.map((message, index): ContextMessage => ({ id: `${input.runId}:message:${index}`, role: message.role, content: message.content })),
          maxTokens: this.dependencies.config.gateway.contextMaxTokens,
          headMessages: this.dependencies.config.gateway.contextHeadMessages,
          tailMessages: this.dependencies.config.gateway.contextTailMessages,
          toolResultMaxChars: 120_000,
        });
        turnMessages = compressed.messages.map((message) => ({ role: message.role === "system" || message.role === "tool" ? "assistant" : message.role, content: message.content }));
      } catch {
        throw safeError("context compression is unavailable");
      }
    }
    try {
      workspaceSnapshot = this.dependencies.contextEngine
        ? await this.dependencies.contextEngine.getContext({ session: input.session, maxChars: this.dependencies.config.gateway.maxMessageChars })
        : [];
      memorySummaries = this.dependencies.memoryProvider?.getSummaries
        ? await this.dependencies.memoryProvider.getSummaries({ session: input.session, maxItems: 20 })
        : [];
      skillSummaries = this.dependencies.skillProvider?.getSummaries
        ? await this.dependencies.skillProvider.getSummaries({ session: input.session, maxItems: 50 })
        : [];
      if (this.dependencies.mcpSource) {
        const discovered = await this.dependencies.mcpSource.discover({});
        const names = new Set(turnTools.map((tool) => tool.declaration.name));
        const merged = [...turnTools];
        for (const tool of discovered) {
          if (names.has(tool.declaration.name)) throw safeError("MCP tool name collides with the canonical registry");
          names.add(tool.declaration.name);
          merged.push(tool);
        }
        const allowedScopes = this.dependencies.allowedToolScopes ? new Set(this.dependencies.allowedToolScopes) : undefined;
        const scoped = merged.filter((tool) => {
          const scope = (tool as ToolDefinition & { scope?: string }).scope ?? tool.policy?.scope;
          return !allowedScopes || !scope || allowedScopes.has(scope);
        });
        turnTools = Object.freeze(this.dependencies.toolSelection ? [...selectTools(scoped, this.dependencies.toolSelection)] : scoped);
      }
    } catch {
      try { await this.dependencies.mcpSource?.close?.(); } catch { /* cleanup is best effort */ }
      throw safeError("bounded context preparation is unavailable");
    }

    if (this.dependencies.config.gateway.subagentEnabled && this.dependencies.subagentFactory && !turnTools.some((tool) => tool.declaration.name === "delegate_task")) {
      const binding: ProjectContextBinding = {
        tenantId: input.session.source.tenantId,
        projectId: input.session.source.projectId ?? input.session.source.conversationId,
        actorId: input.session.source.actorId,
        conversationId: input.session.source.conversationId,
        ...(input.session.source.snapshotId ? { snapshotId: input.session.source.snapshotId } : {}),
        ...(input.session.source.documentRevisionId ? { documentRevisionId: input.session.source.documentRevisionId } : {}),
        allowedToolScopes: [...(this.dependencies.allowedToolScopes ?? [])],
        issuedAt: input.session.createdAt,
      };
      const allowedTools = turnTools.map((tool) => tool.declaration.name).filter((name) => !["delegate_task", "cron_create", "memory_write", "memory_commit", "message_delivery", "privileged"].includes(name));
      const allowedScopes = [...(this.dependencies.allowedToolScopes ?? [])];
      const lifecycle = this.dependencies.subagentFactory({ runId: input.runId, session: input.session, binding, bindingId: bindingId(binding), allowedScopes, allowedTools });
      const delegate = withToolPolicy(createDelegateTool({
        lifecycle,
        parentBindingId: bindingId(binding),
        parentRunId: input.runId,
        parentTurnId: input.runId,
        allowedScopes,
        allowedTools,
        tenantId: binding.tenantId,
        parentSessionId: input.session.sessionId,
        budget: {
          maxDepth: this.dependencies.config.gateway.subagentMaxDepth,
          maxDurationMs: this.dependencies.config.gateway.subagentMaxDurationMs,
          maxIterations: this.dependencies.config.gateway.maxIterations,
          maxToolCalls: this.dependencies.config.gateway.subagentMaxToolCalls,
          maxTotalTokens: this.dependencies.config.gateway.subagentMaxTotalTokens,
        },
      }), {
        available: true,
        riskTier: "critical",
        sideEffect: "external",
        approval: "always",
        concurrency: "sequential",
        timeoutMs: this.dependencies.config.gateway.subagentMaxDurationMs,
        executionMode: "sequential",
        requiresApproval: true,
      });
      turnTools = Object.freeze([...turnTools, delegate]);
    }

    if (this.dependencies.contextFileLoader) {
      const root = typeof this.dependencies.contextFileRoot === "function"
        ? this.dependencies.contextFileRoot(input.session)
        : this.dependencies.contextFileRoot;
      if (root) {
        try {
          contextFileSnapshot = await this.dependencies.contextFileLoader.load({
            root,
            maxFileBytes: this.dependencies.config.gateway.maxMessageChars,
            maxTotalBytes: this.dependencies.config.gateway.maxMessageChars * 4,
          });
        } catch {
          // Optional context sources fail closed to the manual prompt path.
          contextFileSnapshot = undefined;
        }
      }
    }

    let prompt: BuiltPrompt;
    try {
      prompt = buildPrompt({
        stable: {
          locale: "id-ID",
          channel: "command_room",
          profileName: this.dependencies.config.profileName,
        },
        session: input.session.source,
        messages: turnMessages,
        workspaceSnapshot,
        memorySummaries,
        skillSummaries,
        contextFiles: contextFileSnapshot,
        now: this.dependencies.now?.() ?? new Date().toISOString(),
        limits: {
          stable: 8_000,
          context: this.dependencies.config.gateway.maxMessageChars,
          volatile: this.dependencies.config.gateway.maxMessageChars,
        },
      });
    } catch {
      try { await this.dependencies.mcpSource?.close?.(); } catch { /* cleanup is best effort */ }
      throw safeError("prompt preparation is unavailable");
    }

    let context: TurnContext;
    try {
      context = TurnContext.create({
        runId: input.runId,
        session: input.session,
        prompt,
        messages: turnMessages,
        memoryRefs: memorySummaries.map((item) => item.memoryId ?? item.id).filter((item): item is string => Boolean(item)),
        skillRefs: skillSummaries.map((item) => item.skillId ?? item.id).filter((item): item is string => Boolean(item)),
        contextFileRefs: contextFileSnapshot?.entries.map((entry) => ({
          relativePath: entry.relativePath,
          class: entry.class,
          sha256: entry.sha256,
          bytes: entry.bytes,
        })) ?? [],
        tokenBudget: {
          maxInputTokens: this.dependencies.config.gateway.maxInputTokens,
          maxOutputTokens: this.dependencies.config.gateway.maxOutputTokens,
          maxTotalTokens: this.dependencies.config.gateway.maxTotalTokens,
          maxToolResultBytes: 120_000,
        },
        provenance: {
          source: "command-room-context",
          version: prompt.version,
          references: [
            ...workspaceSnapshot.map((item) => item.sourceId ?? item.id).filter((item): item is string => Boolean(item)),
            ...memorySummaries.map((item) => item.memoryId ?? item.id).filter((item): item is string => Boolean(item)),
            ...skillSummaries.map((item) => item.skillId ?? item.id).filter((item): item is string => Boolean(item)),
            ...(contextFileSnapshot?.entries.map((item) => `context-file:${item.relativePath}:${item.sha256}`) ?? []),
          ],
        },
        now: this.dependencies.now?.() ?? new Date().toISOString(),
      });
    } catch {
      try { await this.dependencies.mcpSource?.close?.(); } catch { /* cleanup is best effort */ }
      throw safeError("turn context preparation is unavailable");
    }

    this.currentLifecycle = "prepared";
    this.emit({
      type: "prepared",
      lifecycle: "prepared",
      runId: input.runId,
      sessionId: input.session.sessionId,
      metadata: {
        profileAlias: profile.alias,
        stableChars: prompt.sectionSizes.stable,
        contextChars: prompt.sectionSizes.context,
        volatileChars: prompt.sectionSizes.volatile,
        injectionFindings: prompt.injectionFindings.length,
      },
    });
    return {
      runId: input.runId,
      session: input.session,
      profile,
      prompt,
      tools: turnTools,
      context,
      reasoningEffort: input.reasoningEffort,
      thinking: input.thinking,
      lifecycle: "prepared",
    };
  }

  markHandedOff(runId: string, sessionId: string): void {
    if (this.currentLifecycle !== "prepared") throw safeError(`agent cannot hand off from lifecycle ${this.currentLifecycle}`);
    this.currentLifecycle = "handed_off";
    this.emit({ type: "handoff", lifecycle: "handed_off", runId, sessionId, metadata: { handoff: "legacy-web-provider" } });
  }

  private emit(event: AgentRuntimeEvent): void {
    try {
      this.dependencies.onEvent?.(event);
    } catch {
      // Runtime callbacks are observability only; they cannot alter preparation.
    }
  }

  async runPreparedTurn(
    prepared: PreparedAgentTurn,
    signal: AbortSignal,
    events: ConversationEventSink = { emit: () => undefined },
    hooks?: ConversationHooks,
  ): Promise<FinalizedTurnResult> {
    if (this.currentLifecycle !== "prepared" || prepared.lifecycle !== "prepared") throw safeError(`agent cannot execute from lifecycle ${this.currentLifecycle}`);
    this.currentLifecycle = "running";
    const profile = prepared.profile;
    const source = prepared.session.source;
    const clock = this.dependencies.clock ?? Date.now;
    const startedAt = new Date(clock()).toISOString();
    let journal: TurnJournal;
    try {
      journal = this.dependencies.journalFactory?.(prepared.runId) ?? new TurnJournal(clock, prepared.runId);
    } catch {
      journal = new TurnJournal(clock, prepared.runId);
    }
    const budget = new IterationBudget({
      limits: {
        maxIterations: this.dependencies.config.gateway.maxIterations,
        maxModelAttempts: this.dependencies.config.gateway.maxModelAttempts,
        maxToolCalls: this.dependencies.config.gateway.maxToolCalls,
        maxDurationMs: this.dependencies.config.gateway.maxDurationMs,
        maxInputTokens: this.dependencies.config.gateway.maxInputTokens,
        maxOutputTokens: this.dependencies.config.gateway.maxOutputTokens,
        maxTotalTokens: this.dependencies.config.gateway.maxTotalTokens,
      },
      signal,
      now: clock,
    });
    await observeSafely(this.dependencies.observation?.onTurnStarted, { runId: prepared.runId, turnId: prepared.runId, startedAt });
    let result: ConversationResult = { status: "error", stopReason: "provider_error", context: prepared.context };
    try {
      const observeLoop = createBoundedLoopObserver(this.dependencies.observation);
      const loopHooks: LoopHook[] = [...(this.dependencies.loopHooks ?? [])];
      if (this.dependencies.observation?.onLoop) {
        loopHooks.push({
          name: "runtime-observation",
          stages: ALL_LOOP_HOOK_STAGES,
          onStage: (context) => observeLoop(context),
        });
      }
      const transport = this.dependencies.transportFactory
        ? this.dependencies.transportFactory(profile, this.dependencies.config)
        : this.dependencies.transport ?? createProviderTransport(profile, this.dependencies.config);
      const binding: ProjectContextBinding = {
        tenantId: source.tenantId,
        projectId: source.projectId ?? source.conversationId,
        actorId: source.actorId,
        conversationId: source.conversationId,
        ...(source.snapshotId ? { snapshotId: source.snapshotId } : {}),
        ...(source.documentRevisionId ? { documentRevisionId: source.documentRevisionId } : {}),
        allowedToolScopes: [...(this.dependencies.allowedToolScopes ?? [])],
        issuedAt: prepared.session.createdAt,
      };
      const toolExecutor = new ToolExecutor({
        registry: prepared.tools,
        binding,
        journal,
        approvals: this.dependencies.approvalService ?? new ApprovalService(),
        mode: "auto",
        toolTimeoutMs: this.dependencies.config.gateway.toolTimeoutMs,
        approvalTtlMs: this.dependencies.config.gateway.approvalTtlMs,
        onEvent: (event) => {
          events.emit(toolEvent(event));
          void observeSafely(this.dependencies.observation?.onTool, { runId: prepared.runId, event });
        },
      });
      const executeCanonicalTurn = async () => {
        result = await runConversation({
          context: prepared.context,
          profile,
          transport,
          toolExecutor,
          budget,
          reasoningEffort: prepared.profile.reasoningEffortMap?.[prepared.reasoningEffort] ?? prepared.reasoningEffort,
          thinking: prepared.thinking,
          providerTools: toProviderTools(prepared.tools),
          signal,
          events,
          hooks,
          loopHooks,
          onLoopHookFailure: (failure: LoopHookFailure) => observeLoop({
            runId: prepared.runId,
            turnId: prepared.runId,
            iteration: 0,
            stage: "turn_failed",
            stopReason: failure.stage,
            metadata: { hookFailure: true, errorCode: failure.errorCode },
          }),
          retryCount: this.dependencies.config.gateway.retryCount,
          retryBackoffMs: this.dependencies.config.gateway.retryBackoffMs,
        });
      };
      if (this.dependencies.pluginMiddleware) {
        let downstreamCalled = false;
        await this.dependencies.pluginMiddleware.run("beforeTurn", {
          stage: "beforeTurn",
          identity: { tenantId: source.tenantId, actorId: source.actorId, runId: prepared.runId },
          authority: {
            approval: "core",
            budget: {
              maxIterations: this.dependencies.config.gateway.maxIterations,
              maxToolCalls: this.dependencies.config.gateway.maxToolCalls,
              maxTotalTokens: this.dependencies.config.gateway.maxTotalTokens,
            },
            toolPermissions: prepared.tools.map((tool) => tool.declaration.name),
            provider: profile.provider,
          },
          metadata: { profile: profile.alias, transport: profile.transport },
        }, async () => {
          downstreamCalled = true;
          await executeCanonicalTurn();
        });
        if (!downstreamCalled) throw new Error("plugin middleware stopped canonical turn");
      } else {
        await executeCanonicalTurn();
      }
    } catch {
      result = {
        status: "error",
        stopReason: signal.aborted ? "aborted" : "provider_error",
        context: prepared.context,
      };
    }
    try { await this.dependencies.mcpSource?.close?.(); } catch { /* MCP cleanup cannot alter the finalized turn */ }

    const finalizeInput: FinalizeTurnInput = {
      result,
      turnId: prepared.runId,
      runId: prepared.runId,
      budget: budget.snapshot(),
      journal: journal.snapshot(prepared.runId, new Date(clock()).toISOString()),
      startedAt,
      finalizedAt: new Date(clock()).toISOString(),
    };
    let finalized: FinalizedTurnResult;
    try {
      finalized = (this.dependencies.finalizer ?? finalizeTurn)(finalizeInput);
    } catch {
      finalized = finalizeTurn({
        ...finalizeInput,
        result: { status: "error", stopReason: "provider_error", context: prepared.context },
      });
    }
    this.currentLifecycle = finalized.envelope.status === "completed" ? "completed" : "failed";
    await observeSafely(this.dependencies.observation?.onTurnFinalized, {
      runId: finalized.envelope.runId,
      turnId: finalized.envelope.turnId,
      status: finalized.envelope.status,
      stopReason: finalized.envelope.stopReason,
      usage: finalized.envelope.usage,
      finalizedAt: finalized.envelope.finalizedAt,
    });
    try {
      await this.dependencies.onUsage?.(finalized.envelope.usage);
    } catch {
      // Non-critical usage observers cannot alter the final turn authority.
    }
    return finalized;
  }
}

function toolEvent(event: ToolExecutorEvent): ConversationEvent {
  if (event.type === "approval.requested") return { type: "approval.requested", approvalId: event.approvalId, toolCallId: event.toolId, name: event.name, action: event.action, expiresAt: event.expiresAt };
  if (event.type === "approval.resolved") return { type: "approval.resolved", approvalId: event.approvalId, toolCallId: event.toolId, name: event.name, state: event.state };
  if (event.type === "tool.completed") return { type: "tool.completed", toolCallId: event.toolId, name: event.name, status: event.status, summary: event.summary };
  return { type: event.type, toolCallId: event.toolId, name: event.name };
}
