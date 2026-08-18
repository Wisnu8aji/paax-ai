// Canonical context → model → response → act conversation loop.
// TODO(phase 3)
import type { ModelProfile } from "../config";
import type { ProviderCompletion, ProviderMessage, ProviderRequest, ProviderTool, ProviderToolCall, ProviderTransport } from "../providers/base";
import { validateProviderCompletion } from "../providers/response-validator";
import { IterationBudget, type BudgetStopReason } from "./iteration-budget";
import { TurnContext } from "./turn-context";
import { composeLoopHooks, type LoopHook, type LoopHookContext, type LoopHookFailure } from "./loop-hooks";

export type ConversationEventType = "calling_model" | "model_retry" | "assistant_delta" | "reasoning_delta" | "before_tools" | "after_tool" | "tool.generating" | "tool.started" | "tool.completed" | "approval.requested" | "approval.resolved" | "stopped" | "error";

export interface ConversationEvent {
  type: ConversationEventType;
  [key: string]: unknown;
}

export interface ConversationEventSink {
  emit(event: ConversationEvent): void;
}

export interface ToolExecutionResult {
  toolCallId: string;
  name: string;
  status: "completed" | "failed" | "rejected";
  result: Record<string, unknown>;
  summary?: string;
}

export interface ToolExecutorLike {
  execute(toolCalls: readonly ProviderToolCall[], context: TurnContext, signal: AbortSignal): Promise<readonly ToolExecutionResult[]>;
}

export interface ConversationHooks {
  beforeModel?: (context: TurnContext, request: ProviderRequest) => void | Promise<void>;
  afterModel?: (completion: ProviderCompletion) => void | Promise<void>;
  beforeTools?: (calls: readonly ProviderToolCall[]) => void | Promise<void>;
  afterTool?: (result: ToolExecutionResult) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onStop?: (reason: BudgetStopReason | "provider_error" | "response_invalid" | "tool_error") => void | Promise<void>;
}

export interface ConversationLoopInput {
  context: TurnContext;
  profile: ModelProfile;
  transport: ProviderTransport;
  toolExecutor: ToolExecutorLike;
  budget: IterationBudget;
  reasoningEffort: string;
  thinking: "on" | "off";
  providerTools: readonly ProviderTool[];
  signal: AbortSignal;
  events: ConversationEventSink;
  hooks?: ConversationHooks;
  loopHooks?: readonly LoopHook[];
  onLoopHookFailure?: (failure: LoopHookFailure) => void | Promise<void>;
  retryCount?: number;
  retryBackoffMs?: number;
  validateCompletion?: (completion: ProviderCompletion) => ProviderCompletion;
}

export interface ConversationResult {
  status: "completed" | "stopped" | "error";
  stopReason: BudgetStopReason | "provider_error" | "response_invalid" | "tool_error" | "completed";
  content?: string;
  context: TurnContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRetryable(error: unknown): boolean {
  return isRecord(error) && error.retryable === true;
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (isRecord(error) && error.name === "AbortError");
}

function safeEmit(sink: ConversationEventSink, event: ConversationEvent): void {
  try { sink.emit(event); } catch { /* event delivery cannot change loop authority */ }
}

async function safeHook(callback: (() => void | Promise<void>) | undefined): Promise<void> {
  if (!callback) return;
  try { await callback(); } catch { /* observability hooks cannot change loop authority */ }
}

async function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const abort = () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

interface RequestedCompletion {
  completion: ProviderCompletion;
  streamedContent: boolean;
}

async function requestCompletion(input: ConversationLoopInput, request: ProviderRequest): Promise<RequestedCompletion> {
  if (input.transport.capabilities.has("stream")) {
    let content = "";
    let completion: ProviderCompletion | undefined;
    for await (const event of input.transport.stream(request)) {
      if (event.type === "delta") {
        content += event.delta;
        safeEmit(input.events, { type: "assistant_delta", delta: event.delta });
      } else if (event.type === "completed") {
        completion = event.completion;
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }
    if (!completion) completion = { content: content || null, finishReason: "stop" };
    if (!completion.content && content) completion = { ...completion, content };
    return { completion, streamedContent: content.length > 0 };
  }
  return { completion: await input.transport.complete(request), streamedContent: false };
}

function usageFromCompletion(completion: ProviderCompletion): { inputTokens?: number; outputTokens?: number; totalTokens?: number } {
  const usage = completion.usage ?? {};
  return {
    inputTokens: typeof usage.inputTokens === "number" ? usage.inputTokens : typeof usage.promptTokens === "number" ? usage.promptTokens : undefined,
    outputTokens: typeof usage.outputTokens === "number" ? usage.outputTokens : typeof usage.completionTokens === "number" ? usage.completionTokens : undefined,
    totalTokens: typeof usage.totalTokens === "number" ? usage.totalTokens : undefined,
  };
}

function toolMessage(result: ToolExecutionResult): ProviderMessage {
  return {
    role: "tool",
    toolCallId: result.toolCallId,
    name: result.name,
    content: JSON.stringify({ status: result.status, result: result.result, summary: result.summary }),
  };
}

function loopContext(context: TurnContext, iteration: number, stage: LoopHookContext["stage"], metadata: Readonly<Record<string, string | number | boolean>> = {}, extras: Pick<LoopHookContext, "toolCallId" | "toolName" | "stopReason"> = {}): LoopHookContext {
  const runId = context.snapshot().runId;
  return { runId, turnId: runId, iteration, stage, metadata, ...extras };
}

async function stopResult(
  input: ConversationLoopInput,
  context: TurnContext,
  reason: ConversationResult["stopReason"],
  content: string | undefined,
  status: "stopped" | "error",
  hooks: ReturnType<typeof composeLoopHooks>,
  iteration: number,
): Promise<ConversationResult> {
  safeEmit(input.events, { type: "stopped", reason });
  if (status === "error") await hooks.onStage(loopContext(context, iteration, "turn_failed", { status: "error" }, { stopReason: reason }));
  await hooks.onStage(loopContext(context, iteration, "turn_stopped", { status, hasContent: Boolean(content) }, { stopReason: reason }));
  void safeHook(() => input.hooks?.onStop?.(reason as Parameters<NonNullable<ConversationHooks["onStop"]>>[0]));
  await hooks.onStage(loopContext(context, iteration, "turn_finalized", { status, hasContent: Boolean(content) }, { stopReason: reason }));
  return { status, stopReason: reason, ...(content ? { content } : {}), context };
}

export async function runConversation(input: ConversationLoopInput): Promise<ConversationResult> {
  let context = input.context;
  let lastContent: string | undefined;
  const loopHooks = composeLoopHooks(input.loopHooks ?? [], { onFailure: input.onLoopHookFailure });
  const retries = Math.max(0, Math.min(input.retryCount ?? 0, 3));
  const backoff = Math.max(0, Math.min(input.retryBackoffMs ?? 0, 5_000));
  const hardIterationCap = Math.max(1, input.budget.remaining().iterations + 1);
  await loopHooks.onStage(loopContext(context, 0, "turn_started", {}));

  for (let loopIteration = 0; loopIteration < hardIterationCap; loopIteration += 1) {
    const stop = (reason: ConversationResult["stopReason"], content?: string, status: "stopped" | "error" = "stopped") => stopResult(input, context, reason, content, status, loopHooks, loopIteration);
    if (input.signal.aborted) return stop("aborted", lastContent);
    const snapshot = context.snapshot();
    if (!input.budget.canRequestModel(snapshot.estimatedInputTokens)) return stop(input.budget.stopReason() ?? "iteration_limit", lastContent);

    let completion: ProviderCompletion | undefined;
    let streamedContent = false;
    let attempt = 0;
    while (!completion) {
      if (input.signal.aborted) return stop("aborted", lastContent);
      try {
        input.budget.consumeModelAttempt();
        const request: ProviderRequest = {
          profile: input.profile,
          systemPrompt: snapshot.prompt.systemPrompt,
          messages: snapshot.messages,
          tools: input.providerTools,
          reasoningEffort: input.reasoningEffort,
          thinking: input.thinking,
          signal: input.signal,
        };
        await loopHooks.onStage(loopContext(context, loopIteration, "before_model", { attempt, retryCount: retries }));
        await safeHook(() => input.hooks?.beforeModel?.(context, request));
        safeEmit(input.events, { type: "calling_model", attempt: input.budget.remaining().modelAttempts });
        const requested = await requestCompletion(input, request);
        const candidate = input.validateCompletion ? input.validateCompletion(requested.completion) : requested.completion;
        completion = validateProviderCompletion(candidate);
        streamedContent = requested.streamedContent;
        await safeHook(() => input.hooks?.afterModel?.(completion!));
        await loopHooks.onStage(loopContext(context, loopIteration, "after_model", { hasContent: Boolean(completion?.content), toolCalls: completion?.toolCalls?.length ?? 0 }));
        if (input.signal.aborted) return stop("aborted", lastContent);
      } catch (error) {
        await safeHook(() => input.hooks?.onError?.(error));
        if (isAbortError(error, input.signal)) return stop("aborted", lastContent);
        const invalid = error instanceof Error && /invalid|malformed|tool call/i.test(error.message);
        if ((isRetryable(error) || invalid) && attempt < retries && input.budget.canRequestModel()) {
          attempt += 1;
          safeEmit(input.events, { type: "model_retry", attempt });
          try { await sleep(backoff, input.signal); } catch { return stop("aborted", lastContent); }
          continue;
        }
        return stop(invalid ? "response_invalid" : "provider_error", lastContent, "error");
      }
    }

    const usage = usageFromCompletion(completion);
    try { input.budget.recordUsage(usage); } catch (error) {
      await safeHook(() => input.hooks?.onError?.(error));
      return stop("provider_error", lastContent, "error");
    }
    context = context.recordUsage(usage);
    const usageStop = input.budget.terminalStopReason();
    if (usageStop) return stop(usageStop, completion.content ?? lastContent);
    const toolCalls = completion.toolCalls ?? [];
    if (toolCalls.length > 0 || completion.finishReason === "tool_calls") {
      if (!toolCalls.length) return stop("response_invalid", lastContent, "error");
      if (!input.budget.reserveToolCalls(toolCalls.length)) return stop(input.budget.stopReason() ?? "tool_limit", lastContent);
      await loopHooks.onStage(loopContext(context, loopIteration, "before_tools", { toolCalls: toolCalls.length }));
      await safeHook(() => input.hooks?.beforeTools?.(toolCalls));
      safeEmit(input.events, { type: "before_tools", count: toolCalls.length });
      let results: readonly ToolExecutionResult[];
      try {
        results = await input.toolExecutor.execute(toolCalls, context, input.signal);
      } catch (error) {
        await safeHook(() => input.hooks?.onError?.(error));
        return stop("tool_error", lastContent, "error");
      }
      if (results.length !== toolCalls.length) return stop("tool_error", lastContent, "error");
      for (const result of results) {
        await safeHook(() => input.hooks?.afterTool?.(result));
        await loopHooks.onStage(loopContext(context, loopIteration, "after_tool", { status: result.status }, { toolCallId: result.toolCallId, toolName: result.name }));
        safeEmit(input.events, { type: "after_tool", toolCallId: result.toolCallId, status: result.status });
      }
      context = context
        .appendAssistant({ role: "assistant", content: completion.content, toolCalls })
        .appendToolResults(results.map(toolMessage));
      continue;
    }

    if (completion.finishReason === "length") return stop("output_token_limit", completion.content ?? undefined);
    if (completion.finishReason === "content_filter" || completion.finishReason === "error") return stop("provider_error", completion.content ?? undefined, "error");
    if (typeof completion.content !== "string" || !completion.content) return stop("response_invalid", lastContent, "error");
    lastContent = completion.content;
    if (!streamedContent) safeEmit(input.events, { type: "assistant_delta", delta: completion.content });
    await loopHooks.onStage(loopContext(context, loopIteration, "turn_finalized", { status: "completed", hasContent: true }));
    return { status: "completed", stopReason: "completed", content: completion.content, context };
  }

  return stopResult(input, context, input.budget.stopReason() ?? "iteration_limit", lastContent, "stopped", loopHooks, hardIterationCap);
}
