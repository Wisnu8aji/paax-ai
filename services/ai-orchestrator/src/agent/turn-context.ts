// Immutable input snapshot and volatile context for one agent turn.
// TODO(phase 3)
import type { SessionRecord } from "../gateway/session";
import type { ProviderMessage } from "../providers/base";
import { scanUntrustedContent } from "../agentic/security";
import type { AgentMessage, BuiltPrompt } from "./prompt-builder";

export interface TurnTokenBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
  maxToolResultBytes: number;
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface TurnProvenance {
  source: string;
  version: string;
  references?: readonly string[];
}

export interface ContextFileReference {
  readonly relativePath: string;
  readonly class: "stable" | "volatile";
  readonly sha256: string;
  readonly bytes: number;
}

export interface TurnContextInput {
  runId: string;
  session: SessionRecord;
  prompt: BuiltPrompt;
  messages: readonly AgentMessage[] | readonly ProviderMessage[];
  memoryRefs?: readonly string[];
  skillRefs?: readonly string[];
  contextFileRefs?: readonly ContextFileReference[];
  tokenBudget: TurnTokenBudget;
  provenance: TurnProvenance;
  now: string;
}

export interface TurnContextSnapshot {
  readonly runId: string;
  readonly sessionId: string;
  readonly internal: Readonly<{
    sessionId: string;
    keyFingerprint: string;
    channel: string;
    tenantId: string;
    actorId: string;
    conversationId: string;
    projectId?: string;
    threadId?: string;
    workspaceId?: string;
    snapshotId?: string;
    documentRevisionId?: string;
  }>;
  readonly prompt: Readonly<BuiltPrompt>;
  readonly messages: readonly ProviderMessage[];
  readonly memoryRefs: readonly string[];
  readonly skillRefs: readonly string[];
  readonly contextFileRefs: readonly ContextFileReference[];
  readonly tokenBudget: Readonly<TurnTokenBudget>;
  readonly usage: Readonly<TurnUsage>;
  readonly estimatedInputTokens: number;
  readonly provenance: Readonly<TurnProvenance>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  return Object.freeze(value);
}

function validIso(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("turn context timestamp must be ISO-8601");
  return new Date(parsed).toISOString();
}

function assertBudget(budget: TurnTokenBudget): void {
  for (const [key, value] of Object.entries(budget)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`turn token budget is invalid: ${key}`);
  }
}

function serializeBytes(value: unknown): number {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

function normalizeInitialMessages(messages: readonly AgentMessage[] | readonly ProviderMessage[]): ProviderMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" && message.role !== "assistant") throw new Error("turn context message role is unsupported; only user or assistant history is allowed");
    if (typeof message.content !== "string" || !message.content.trim()) throw new Error("turn context message content is required");
    return clone(message as ProviderMessage);
  });
}

function promptForMessages(prompt: BuiltPrompt, messages: readonly ProviderMessage[]): BuiltPrompt {
  const header = prompt.volatileText.split("\n", 1)[0] || "[VOLATILE DATA]";
  const findings = [...prompt.injectionFindings];
  for (const [index, message] of messages.entries()) {
    for (const pattern of scanUntrustedContent(message.content ?? "")) findings.push(`message:${index}:${message.role}:${pattern}`);
  }
  const entries = messages.map((message, index) => `[UNTRUSTED TURN DATA role=${message.role} index=${index}] ${message.content ?? ""}`);
  const maxVolatileChars = prompt.limits?.volatile ?? 32_000;
  let keptEntries = [...entries];
  let volatileText = [header, ...keptEntries].join("\n");
  while (volatileText.length > maxVolatileChars && keptEntries.length > 0) {
    keptEntries = keptEntries.slice(1);
    findings.push("volatile:truncated-oldest");
    volatileText = [header, ...keptEntries].join("\n");
  }
  if (volatileText.length > maxVolatileChars) {
    findings.push("volatile:truncated-text");
    volatileText = volatileText.slice(0, maxVolatileChars);
  }
  const uniqueFindings = [...new Set(findings)];
  return {
    ...clone(prompt),
    volatileText,
    systemPrompt: [prompt.stableText, prompt.contextText, volatileText].join("\n\n"),
    sectionSizes: { ...prompt.sectionSizes, volatile: volatileText.length },
    injectionFindings: uniqueFindings,
  };
}

function estimateInputTokens(prompt: BuiltPrompt, messages: readonly ProviderMessage[]): number {
  const material = `${prompt.systemPrompt}\n${messages.map((message) => `${message.role}:${message.content ?? ""}`).join("\n")}`;
  return Math.ceil(material.length / 4);
}

function makeSnapshot(input: {
  runId: string;
  session: SessionRecord;
  prompt: BuiltPrompt;
  messages: readonly ProviderMessage[];
  memoryRefs: readonly string[];
  skillRefs: readonly string[];
  contextFileRefs: readonly ContextFileReference[];
  tokenBudget: TurnTokenBudget;
  usage: TurnUsage;
  provenance: TurnProvenance;
  createdAt: string;
  updatedAt: string;
}): TurnContextSnapshot {
  const source = clone(input.session.source);
  const snapshot: TurnContextSnapshot = {
    runId: input.runId,
    sessionId: input.session.sessionId,
    internal: {
      sessionId: input.session.sessionId,
      keyFingerprint: input.session.keyFingerprint,
      channel: source.channel,
      tenantId: source.tenantId,
      actorId: source.actorId,
      conversationId: source.conversationId,
      ...(source.projectId ? { projectId: source.projectId } : {}),
      ...(source.threadId ? { threadId: source.threadId } : {}),
      ...(source.workspaceId ? { workspaceId: source.workspaceId } : {}),
      ...(source.snapshotId ? { snapshotId: source.snapshotId } : {}),
      ...(source.documentRevisionId ? { documentRevisionId: source.documentRevisionId } : {}),
    },
    prompt: clone(input.prompt),
    messages: clone([...input.messages]),
    memoryRefs: clone([...input.memoryRefs]),
    skillRefs: clone([...input.skillRefs]),
    contextFileRefs: clone([...input.contextFileRefs]),
    tokenBudget: clone(input.tokenBudget),
    usage: clone(input.usage),
    estimatedInputTokens: estimateInputTokens(input.prompt, input.messages),
    provenance: clone(input.provenance),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
  return freezeDeep(snapshot);
}

export class TurnContext {
  private constructor(private readonly state: TurnContextSnapshot) {}

  static create(input: TurnContextInput): TurnContext {
    if (!input.runId.trim()) throw new Error("turn context runId is required");
    assertBudget(input.tokenBudget);
    const now = validIso(input.now);
    const messages = normalizeInitialMessages(input.messages);
    const prompt = promptForMessages(clone(input.prompt), messages);
    return new TurnContext(makeSnapshot({
      runId: input.runId,
      session: input.session,
      prompt,
      messages,
      memoryRefs: input.memoryRefs ?? [],
      skillRefs: input.skillRefs ?? [],
      contextFileRefs: input.contextFileRefs ?? [],
      tokenBudget: input.tokenBudget,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      provenance: input.provenance,
      createdAt: now,
      updatedAt: now,
    }));
  }

  snapshot(): TurnContextSnapshot {
    return this.state;
  }

  appendAssistant(message: ProviderMessage): TurnContext {
    if (message.role !== "assistant") throw new Error("assistant append requires assistant role");
    if (message.content !== null && typeof message.content !== "string") throw new Error("assistant content is invalid");
    if (message.content === null && (!message.toolCalls || message.toolCalls.length === 0)) throw new Error("assistant append requires content or tool calls");
    const messages = [...this.state.messages, clone(message)];
    return this.next(messages);
  }

  appendToolResults(results: readonly ProviderMessage[]): TurnContext {
    if (!results.length) throw new Error("tool results are required");
    for (const result of results) {
      if (result.role !== "tool") throw new Error("tool result must use tool role");
      if (!result.toolCallId?.trim()) throw new Error("tool result requires a tool call id");
      if (serializeBytes(result.content ?? "") > this.state.tokenBudget.maxToolResultBytes) throw new Error("tool result exceeds configured limit");
    }
    return this.next([...this.state.messages, ...results.map(clone)]);
  }

  recordUsage(usage: Partial<TurnUsage>): TurnContext {
    const nextUsage = { ...this.state.usage };
    for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
      const value = usage[key];
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 0) throw new Error(`provider usage is invalid: ${key}`);
      nextUsage[key] += value;
    }
    return new TurnContext(makeSnapshot({
      ...this.state,
      session: ({
        sessionId: this.state.internal.sessionId,
        keyFingerprint: this.state.internal.keyFingerprint,
        source: {
          channel: this.state.internal.channel,
          tenantId: this.state.internal.tenantId,
          actorId: this.state.internal.actorId,
          conversationId: this.state.internal.conversationId,
          projectId: this.state.internal.projectId,
          threadId: this.state.internal.threadId,
          workspaceId: this.state.internal.workspaceId,
          snapshotId: this.state.internal.snapshotId,
          documentRevisionId: this.state.internal.documentRevisionId,
        },
      } as SessionRecord),
      usage: nextUsage,
      updatedAt: this.state.updatedAt,
    }));
  }

  private next(messages: readonly ProviderMessage[]): TurnContext {
    const session = {
      sessionId: this.state.internal.sessionId,
      keyFingerprint: this.state.internal.keyFingerprint,
      source: {
        channel: this.state.internal.channel,
        tenantId: this.state.internal.tenantId,
        actorId: this.state.internal.actorId,
        conversationId: this.state.internal.conversationId,
        projectId: this.state.internal.projectId,
        threadId: this.state.internal.threadId,
        workspaceId: this.state.internal.workspaceId,
        snapshotId: this.state.internal.snapshotId,
        documentRevisionId: this.state.internal.documentRevisionId,
      },
      createdAt: this.state.createdAt,
      updatedAt: this.state.updatedAt,
    } as SessionRecord;
    return new TurnContext(makeSnapshot({
      runId: this.state.runId,
      session,
      prompt: promptForMessages(this.state.prompt, messages),
      messages,
      memoryRefs: this.state.memoryRefs,
      skillRefs: this.state.skillRefs,
      contextFileRefs: this.state.contextFileRefs,
      tokenBudget: this.state.tokenBudget,
      usage: this.state.usage,
      provenance: this.state.provenance,
      createdAt: this.state.createdAt,
      updatedAt: this.state.updatedAt,
    }));
  }
}
