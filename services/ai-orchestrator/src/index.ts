import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { resolve } from "node:path";

import { loadConfig, resolveModelProfile, type AppConfig } from "./config";
import { authMiddleware } from "./auth";
import { createChatHandler } from "./routes/chat";
import { createStreamHandler } from "./routes/stream";
import { healthHandler } from "./routes/health";
import { createAgentRunsRouter } from "./routes/agent-runs";
import { createGatewayRouter, GatewayRunner, type GatewayRunnerDependencies } from "./gateway/run";
import { InMemorySessionStore, SqliteSessionStore, type SessionStore } from "./gateway/session";
import { AgentRunStore, validateMatureTransition } from "./agentic/runtime-store";
import type { MatureAgentRun, MatureRunStatus } from "./agentic/runtime-types";
import { AIAgent } from "./agent/runtime";
import { createToolRegistry } from "./tools/registry";
import { ApprovalService } from "./agentic/approval-service";
import { createMcpToolSource } from "./tools/mcp/adapter";
import { resolveSessionDbPath } from "./constants";
import { SessionDB } from "./state/session-db";
import { ContextEngine } from "./agent/context-engine";
import { MemoryManager } from "./agent/memory-manager";
import { ContextCompressor } from "./agent/context-compressor";
import { DurableSubagentLifecycle, type SubagentLifecycle } from "./agent/subagent-lifecycle";
import type { SubagentFactoryInput } from "./agent/runtime";
import type { RuntimeObservation } from "./agent/monitoring";
import { MetricsRegistry, createMetricsObservation } from "./observability/metrics";
import { SanitizedAuditSink } from "./observability/audit";
import { TraceRecorder } from "./observability/trace";
import type { PluginManager } from "./plugins/manager";
import { composePluginMiddleware, type PluginMiddleware, type PluginMiddlewarePipeline } from "./plugins/middleware";
import { CronHost, CronScheduler } from "./cron";
import { SqliteCronJobStore } from "./cron/jobs";

export interface AppDependencies {
  config?: AppConfig;
  sessionStore?: SessionStore;
  sessionDb?: SessionDB;
  gateway?: GatewayRunnerDependencies;
  agentRunStore?: AgentRunStore;
  observation?: RuntimeObservation;
  metrics?: MetricsRegistry;
  auditSink?: SanitizedAuditSink;
  traceRecorder?: TraceRecorder;
  pluginManager?: PluginManager;
}

/** Compatibility-shaped mature-run store backed by the composition-root SessionDB. */
class SqliteMatureAgentRunStore extends AgentRunStore {
  constructor(private readonly db: SessionDB) {
    super("session-db");
  }

  override async list(): Promise<MatureAgentRun[]> {
    return this.db.listAgentRuns().map((state) => structuredClone(state as MatureAgentRun)).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  override async get(runId: string): Promise<MatureAgentRun | null> {
    const state = this.db.getAgentRun(runId);
    return state ? structuredClone(state as MatureAgentRun) : null;
  }

  override async create(run: MatureAgentRun): Promise<MatureAgentRun> {
    this.db.createAgentRun(run);
    return structuredClone(run);
  }

  override async update(run: MatureAgentRun, expectedVersion: number): Promise<MatureAgentRun> {
    const current = await this.get(run.runId);
    if (!current) throw new Error(`agent run not found: ${run.runId}`);
    if (current.version !== expectedVersion) throw new Error(`stale agent run: expected ${expectedVersion}, actual ${current.version}`);
    const next = { ...structuredClone(run), version: expectedVersion + 1, updatedAt: new Date().toISOString() };
    this.db.updateAgentRun({ runId: run.runId, expectedVersion, state: next });
    return next;
  }

  override async transition(runId: string, to: MatureRunStatus, expectedVersion: number, failure?: string): Promise<MatureAgentRun> {
    const run = await this.get(runId);
    if (!run) throw new Error(`agent run not found: ${runId}`);
    validateMatureTransition(run.status, to);
    if (to === "failed" && !failure?.trim()) throw new Error("failure reason is required");
    return this.update({ ...run, status: to, failure }, expectedVersion);
  }

  override async branch(runId: string, newRunId: string): Promise<MatureAgentRun> {
    const source = await this.get(runId);
    if (!source) throw new Error(`agent run not found: ${runId}`);
    const now = new Date().toISOString();
    const branch: MatureAgentRun = {
      ...structuredClone(source), runId: newRunId, branchOfRunId: runId, replayOfRunId: undefined,
      status: "queued", activeTaskId: undefined, completedTaskIds: [], failedTaskIds: [],
      invocations: [], observations: [], artifacts: [], pendingApprovalIds: [], version: 0,
      createdAt: now, updatedAt: now, failure: undefined,
    };
    return this.create(branch);
  }

  override async replay(runId: string, newRunId: string): Promise<MatureAgentRun> {
    const replay = await this.branch(runId, newRunId);
    replay.replayOfRunId = runId;
    replay.branchOfRunId = undefined;
    return this.update(replay, 0);
  }
}

// Simple token bucket rate limiter per project_id/session project or IP.
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE || 30);
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const key = req.body?.session?.projectId || req.body?.project_id || req.ip || "global";
  const now = Date.now();
  let record = rateLimitMap.get(key);
  if (!record || now > record.resetTime) record = { count: 0, resetTime: now + 60000 };
  record.count += 1;
  rateLimitMap.set(key, record);
  if (record.count > RATE_LIMIT) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Terlalu banyak request, silakan coba lagi nanti." });
  }
  next();
}

export function createApp(dependencies: AppDependencies = {}) {
  const config = dependencies.config ?? loadConfig();
  const sessionDb = dependencies.sessionDb ?? (dependencies.sessionStore || dependencies.gateway?.sessionStore
    ? undefined
    : new SessionDB({ filename: resolveSessionDbPath(config.runtimePaths), busyTimeoutMs: config.gateway.sessionDbBusyTimeoutMs, maxJsonBytes: config.gateway.maxStateJsonBytes, maxEventBytes: config.gateway.maxEventBytes }));
  const sessionStore = dependencies.sessionStore ?? dependencies.gateway?.sessionStore ?? (sessionDb ? new SqliteSessionStore(sessionDb) : new InMemorySessionStore());
  const metrics = dependencies.metrics ?? new MetricsRegistry();
  const observation = dependencies.observation ?? (config.gateway.observabilityEnabled ? createMetricsObservation(metrics) : undefined);
  const auditSink = dependencies.auditSink ?? (sessionDb ? new SanitizedAuditSink({ db: sessionDb }) : undefined);
  const traceRecorder = dependencies.traceRecorder ?? new TraceRecorder();
  const agentRunStore = dependencies.agentRunStore ?? (sessionDb
    ? new SqliteMatureAgentRunStore(sessionDb)
    : new AgentRunStore(process.env.PAAX_AGENT_RUN_STORE || resolve(process.cwd(), "../../data/portable/agent-runs.json")));
  const pluginContributions = config.gateway.pluginsEnabled ? dependencies.pluginManager?.contributions() : undefined;
  const pluginMiddleware = pluginContributions
    ? composePluginMiddleware(pluginContributions.middleware.filter((item): item is PluginMiddleware => Boolean(item && typeof item === "object" && "handle" in item && typeof (item as { handle?: unknown }).handle === "function")))
    : undefined;
  const tools = createToolRegistry({
    coreEngineUrl: config.coreEngineUrl,
    documentIntelligenceUrl: config.documentIntelligenceUrl,
    mode: "canonical",
    workspaceRoot: process.env.PAAX_WORKSPACE_ROOT,
    mcpCatalog: () => (config.mcpServers ?? []).map((server) => ({ id: server.id, transport: server.transport })),
    pluginTools: pluginContributions?.tools,
  });
  const mcpSource = config.mcpServers && config.mcpServers.length > 0 ? createMcpToolSource({ servers: config.mcpServers }) : undefined;
  const approvalService = dependencies.gateway?.approvalService ?? new ApprovalService({
    onReceipt: (receipt) => {
      void auditSink?.record({
        type: `approval.${receipt.status}`,
        tenantId: receipt.tenantId,
        runId: receipt.runId,
        metadata: {
          approvalId: receipt.approvalId,
          action: receipt.action,
          riskTier: receipt.riskTier,
          status: receipt.status,
          requiredRoles: receipt.requiredRoles,
        },
      });
    },
  });
  const memoryManager = sessionDb ? new MemoryManager(sessionDb) : undefined;
  const contextEngine = sessionDb ? new ContextEngine({ db: sessionDb, maxMessages: config.gateway.maxHistoryMessages, maxTokens: config.gateway.contextMaxTokens }) : undefined;
  const contextCompressor = sessionDb ? new ContextCompressor({ db: sessionDb }) : undefined;
  const createCanonicalAgent = (session: import("./gateway/session").SessionRecord, allowDelegation = true): AIAgent => new AIAgent({
    config,
    resolveProfile: (alias) => resolveModelProfile(config, alias),
    tools,
    contextEngine,
    contextCompressor,
    memoryProvider: memoryManager ? {
      getSummaries: ({ session: currentSession, maxItems }) => memoryManager.recall({ tenantId: currentSession.source.tenantId, projectId: currentSession.source.projectId, sessionId: currentSession.sessionId, query: "", limit: maxItems }).records.map((record) => ({ memoryId: record.id, id: record.id, projectId: record.projectId, summary: `${record.key}: ${record.value}`, evidenceRefs: record.evidenceRefs })),
    } : undefined,
    approvalService,
    observation: allowDelegation ? observation : undefined,
    pluginMiddleware: allowDelegation ? pluginMiddleware : undefined,
    subagentFactory: allowDelegation && sessionDb && config.gateway.subagentEnabled
      ? (input) => createSubagentLifecycle(input)
      : undefined,
    mcpSource,
  });
  function createSubagentLifecycle(input: SubagentFactoryInput): SubagentLifecycle {
    if (!sessionDb) throw new Error("durable sub-agent state is unavailable");
    return new DurableSubagentLifecycle({
      db: sessionDb,
      enabled: config.gateway.subagentEnabled,
      parentRunId: input.runId,
      parentTurnId: input.runId,
      parentBindingId: input.bindingId,
      parentSessionId: input.session.sessionId,
      tenantId: input.binding.tenantId,
      allowedScopes: input.allowedScopes,
      allowedTools: input.allowedTools,
      maxDepth: config.gateway.subagentMaxDepth,
      maxChildren: config.gateway.subagentMaxChildren,
      childSessionIdFactory: async ({ subagentId }) => (await sessionStore.resolve({
        channel: "command_room",
        tenantId: input.binding.tenantId,
        actorId: input.binding.actorId,
        conversationId: `${input.binding.conversationId}:child:${subagentId}`,
        projectId: input.binding.projectId,
        ...(input.binding.snapshotId ? { snapshotId: input.binding.snapshotId } : {}),
        ...(input.binding.documentRevisionId ? { documentRevisionId: input.binding.documentRevisionId } : {}),
      })).sessionId,
      executor: {
        execute: async (child, signal) => {
          const childSession = await sessionStore.resolve({
            channel: "command_room",
            tenantId: input.binding.tenantId,
            actorId: input.binding.actorId,
            conversationId: `${input.binding.conversationId}:child:${child.subagentId}`,
            projectId: input.binding.projectId,
            ...(input.binding.snapshotId ? { snapshotId: input.binding.snapshotId } : {}),
            ...(input.binding.documentRevisionId ? { documentRevisionId: input.binding.documentRevisionId } : {}),
          });
          const childAgent = createCanonicalAgent(childSession, false);
          const childProfile = resolveModelProfile(config, config.defaultModelAlias ?? "lucent");
          const prepared = await childAgent.initializeTurn({
            runId: child.subagentId,
            session: childSession,
            messages: [{ role: "user", content: child.task }],
            modelAlias: childProfile?.alias ?? config.defaultModelAlias ?? "lucent",
            reasoningEffort: "high",
            thinking: childProfile?.supportsThinking ? "on" : "off",
          });
          const result = await childAgent.runPreparedTurn(prepared, signal, { emit: () => undefined });
          const envelope = "envelope" in result ? result.envelope : undefined;
          const status = envelope?.status === "completed" || result.status === "completed" ? "completed" : "failed";
          const content = envelope?.content ?? result.content;
          const usage = envelope?.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
          return {
            status,
            summary: typeof content === "string" && content.trim() ? content.slice(0, 4_000) : status === "completed" ? "child turn completed" : "child turn failed",
            ...(typeof content === "string" && content.trim() ? { content: content.slice(0, 32_000) } : {}),
            stopReason: envelope?.stopReason ?? result.stopReason,
            usage: {
              inputTokens: typeof usage.inputTokens === "number" ? usage.inputTokens : 0,
              outputTokens: typeof usage.outputTokens === "number" ? usage.outputTokens : 0,
              totalTokens: typeof usage.totalTokens === "number" ? usage.totalTokens : 0,
            },
            evidenceRefs: [],
          };
        },
      },
    });
  }
  const gateway: GatewayRunnerDependencies = dependencies.gateway
    ? { ...dependencies.gateway, sessionStore, approvalService, observation: dependencies.gateway.observation ?? observation, ...(sessionDb ? { sessionDb } : {}) }
    : {
      config,
      sessionStore,
      ...(sessionDb ? { sessionDb } : {}),
      approvalService,
      createAgent: (session) => createCanonicalAgent(session),
      findRunBinding: async (runId) => (await agentRunStore.get(runId))?.goalSpec.binding ?? null,
    };
  const gatewayRunner = new GatewayRunner(gateway);
  const cronStore = sessionDb ? new SqliteCronJobStore(sessionDb) : undefined;
  const cronScheduler = new CronScheduler({
    ...(cronStore ? { store: cronStore } : {}),
    leaseOwner: `ai-orchestrator:${process.pid}`,
    claimLeaseMs: config.gateway.cronClaimLeaseMs,
    observation,
    runTurn: async ({ job, runId }) => {
      const session = job.sessionId
        ? await sessionStore.get(job.sessionId)
        : await sessionStore.resolve({
          channel: "agent_runs",
          tenantId: job.tenantId ?? "portable-local",
          actorId: job.actorId ?? "cron-host",
          conversationId: `cron:${job.jobId}`,
          projectId: job.bindingId,
        });
      if (!session) throw new Error("cron session is unavailable");
      if (job.tenantId && session.source.tenantId !== job.tenantId) throw new Error("cron tenant binding mismatch");
      if (job.actorId && session.source.actorId !== job.actorId) throw new Error("cron actor binding mismatch");
      const profile = resolveModelProfile(config, config.defaultModelAlias ?? "lucent");
      if (!profile) throw new Error("cron model profile is unavailable");
      const execution = await gatewayRunner.prepareExecution({
        mode: "work",
        runId,
        session: {
          channel: session.source.channel,
          conversationId: session.source.conversationId,
          ...(session.source.projectId ? { projectId: session.source.projectId } : {}),
          ...(session.source.threadId ? { threadId: session.source.threadId } : {}),
          ...(session.source.workspaceId ? { workspaceId: session.source.workspaceId } : {}),
        },
        messages: [{ role: "user", content: job.prompt }],
        modelAlias: profile.alias,
        reasoningEffort: "high",
        thinking: profile.supportsThinking ? "on" : "off",
        clientCorrelationId: runId,
      }, { tenantId: session.source.tenantId, actorId: session.source.actorId });
      await gatewayRunner.attachExecution(execution);
      return gatewayRunner.executePrepared(execution, new AbortController().signal, { emit: () => undefined });
    },
  });
  const cronHost = new CronHost({
    scheduler: cronScheduler,
    enabled: config.gateway.cronEnabled,
    intervalMs: config.gateway.cronTickMs,
    onError: (error) => {
      void auditSink?.record({ type: "cron.host.error", metadata: { errorCode: error.name } });
    },
  });
  if (config.gateway.cronEnabled) void cronHost.start();
  const app = express();
  const appLocals = (app as unknown as { locals: Record<string, unknown> }).locals;
  appLocals.paaxSessionDb = sessionDb;
  appLocals.paaxSessionStore = sessionStore;
  appLocals.paaxAgentRunStore = agentRunStore;
  appLocals.paaxMetrics = metrics;
  appLocals.paaxAuditSink = auditSink;
  appLocals.paaxTraceRecorder = traceRecorder;
  appLocals.paaxCronStore = cronStore;
  appLocals.paaxCronScheduler = cronScheduler;
  appLocals.paaxCronHost = cronHost;
  appLocals.paaxPluginManager = dependencies.pluginManager;
  appLocals.paaxPluginMiddleware = pluginMiddleware;
  let shutdownPromise: Promise<void> | undefined;
  appLocals.paaxShutdown = () => {
    shutdownPromise ??= (async () => {
      await cronHost.stop();
      await pluginMiddleware?.close();
      if (dependencies.pluginManager) {
        for (const record of dependencies.pluginManager.list()) {
          try { await dependencies.pluginManager.unload(record.manifest.id); } catch { /* optional plugin shutdown is isolated */ }
        }
      }
      try { await mcpSource?.close?.(); } catch { /* MCP shutdown is isolated */ }
      await traceRecorder.flush();
      await auditSink?.flush();
      sessionDb?.close();
    })();
    return shutdownPromise;
  };
  app.use(cors());
  app.use((express.json as any)({ limit: "2mb" }));

  app.get("/health", healthHandler);
  app.use("/agent-runs", authMiddleware, createAgentRunsRouter({ sessionStore, agentRunStore }));
  app.use("/gateway", rateLimiter, authMiddleware, createGatewayRouter(gateway));

  const chatHandler = createChatHandler({
    geminiApiKey: config.geminiApiKey,
    coreEngineUrl: config.coreEngineUrl,
    documentIntelligenceUrl: config.documentIntelligenceUrl,
    maxTurns: config.maxToolTurns,
  });

  // Keep the historical endpoint and the documented /api/chat contract
  // backed by the same handler.  The alias is intentionally registered at
  // the service boundary so existing clients receive identical auth,
  // rate-limit, validation, and fallback behavior.
  for (const path of ["/chat", "/api/chat"]) {
    app.post(path, rateLimiter, authMiddleware, chatHandler);
  }

  app.post(
    "/chat/stream",
    rateLimiter,
    authMiddleware,
    createStreamHandler({
      geminiApiKey: config.geminiApiKey,
      coreEngineUrl: config.coreEngineUrl,
      documentIntelligenceUrl: config.documentIntelligenceUrl,
      maxTurns: config.maxToolTurns,
    }),
  );

  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error?.type === "entity.too.large") return res.status(413).json({ error: "request_too_large" });
    if (error instanceof SyntaxError) return res.status(400).json({ error: "invalid_json" });
    return res.status(500).json({ error: "internal_server_error" });
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = createApp();
  const config = loadConfig();
  app.listen(config.port, () => {
    console.log(`AI Orchestrator berjalan di port ${config.port}`);
  });
}
