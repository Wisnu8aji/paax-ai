import { createHash, randomUUID } from "node:crypto";
import type { SessionDB } from "../state/session-db";

export interface ContextMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export interface CompressionRequest {
  sessionId: string;
  messages: readonly ContextMessage[];
  maxTokens: number;
  headMessages: number;
  tailMessages: number;
  toolResultMaxChars: number;
}

export interface CompressionReceipt {
  strategy: "none" | "deterministic-trim" | "deterministic-summary" | "injected-summary";
  sourceMessageIds: readonly string[];
  protectedMessageIds: readonly string[];
  omittedMessageIds: readonly string[];
  summaryMessageId?: string;
  tokenEstimateBefore: number;
  tokenEstimateAfter: number;
  sourceHash: string;
  createdAt: string;
  failure?: string;
}

export interface CompressionResult {
  messages: readonly ContextMessage[];
  receipt: CompressionReceipt;
}

export interface ContextCompressorOptions {
  db?: SessionDB;
  now?: () => string;
  summarizer?: (messages: readonly ContextMessage[]) => Promise<string>;
}

export function estimateContextTokens(messages: readonly ContextMessage[]): number {
  return Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 4);
}

function sourceHash(messages: readonly ContextMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages), "utf8").digest("hex");
}

function assertRequest(input: CompressionRequest): void {
  if (!input.sessionId.trim() || !Number.isInteger(input.maxTokens) || input.maxTokens <= 0) throw new Error("compression request budget is invalid");
  if (!Number.isInteger(input.headMessages) || input.headMessages < 0 || !Number.isInteger(input.tailMessages) || input.tailMessages < 0) throw new Error("compression head/tail bounds are invalid");
  if (!Number.isInteger(input.toolResultMaxChars) || input.toolResultMaxChars <= 0) throw new Error("compression tool result bound is invalid");
  if (input.messages.some((message) => !message.id.trim() || typeof message.content !== "string")) throw new Error("compression message is invalid");
}

export class ContextCompressor {
  private readonly now: () => string;

  constructor(private readonly options: ContextCompressorOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  compress(input: CompressionRequest): CompressionResult {
    assertRequest(input);
    const normalized = input.messages.map((message) => message.role === "tool"
      ? { ...message, content: message.content.slice(0, input.toolResultMaxChars) }
      : { ...message });
    const before = estimateContextTokens(normalized);
    const sourceIds = normalized.map((message) => message.id);
    const protectedIndexes = new Set<number>();
    normalized.forEach((message, index) => { if (message.role === "system") protectedIndexes.add(index); });
    for (let index = 0; index < Math.min(input.headMessages, normalized.length); index += 1) protectedIndexes.add(index);
    for (let index = Math.max(0, normalized.length - input.tailMessages); index < normalized.length; index += 1) protectedIndexes.add(index);
    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      if (normalized[index].role === "user") { protectedIndexes.add(index); break; }
    }
    const kept = new Set(normalized.map((_message, index) => index));
    const remove = (indexes: number[]) => {
      for (const index of indexes) {
        if (estimateContextTokens(normalized.filter((_message, itemIndex) => kept.has(itemIndex))) <= input.maxTokens) break;
        kept.delete(index);
      }
    };
    if (before > input.maxTokens) {
      const toolCandidates = normalized.map((message, index) => ({ message, index })).filter(({ message, index }) => message.role === "tool" && !protectedIndexes.has(index)).sort((left, right) => right.message.content.length - left.message.content.length || left.index - right.index).map(({ index }) => index);
      remove(toolCandidates);
      const otherCandidates = normalized.map((_message, index) => index).filter((index) => !protectedIndexes.has(index) && kept.has(index));
      remove(otherCandidates);
    }
    const selected = normalized.filter((_message, index) => kept.has(index));
    const after = estimateContextTokens(selected);
    if (after > input.maxTokens) throw new Error("protected context exceeds the configured budget");
    const omitted = sourceIds.filter((_id, index) => !kept.has(index));
    const receipt: CompressionReceipt = {
      strategy: before === after ? "none" : "deterministic-trim",
      sourceMessageIds: sourceIds,
      protectedMessageIds: [...protectedIndexes].sort((a, b) => a - b).map((index) => normalized[index].id),
      omittedMessageIds: omitted,
      tokenEstimateBefore: before,
      tokenEstimateAfter: after,
      sourceHash: sourceHash(normalized),
      createdAt: this.now(),
    };
    this.persist(input.sessionId, receipt);
    return { messages: selected, receipt };
  }

  async compressAsync(input: CompressionRequest): Promise<CompressionResult> {
    try {
      const baseline = this.compress(input);
      if (baseline.receipt.strategy === "none" || !this.options.summarizer || baseline.receipt.omittedMessageIds.length === 0) return baseline;
      const omitted = input.messages.filter((message) => baseline.receipt.omittedMessageIds.includes(message.id));
      const summary = (await this.options.summarizer(omitted)).trim();
      if (!summary) return baseline;
      const summaryMessage: ContextMessage = { id: `summary-${randomUUID()}`, role: "assistant", content: `[bounded summary of ${omitted.length} omitted messages]\n${summary}`.slice(0, input.maxTokens * 4), toolName: "context-compressor" };
      const withSummary = [...baseline.messages, summaryMessage];
      if (estimateContextTokens(withSummary) > input.maxTokens) return baseline;
      const receipt: CompressionReceipt = { ...baseline.receipt, strategy: "injected-summary", summaryMessageId: summaryMessage.id, tokenEstimateAfter: estimateContextTokens(withSummary) };
      this.persist(input.sessionId, receipt);
      return { messages: withSummary, receipt };
    } catch (error) {
      const baseline = this.compress(input);
      return { messages: baseline.messages, receipt: { ...baseline.receipt, failure: error instanceof Error ? error.message.slice(0, 256) : "summarizer failed" } };
    }
  }

  private persist(sessionId: string, receipt: CompressionReceipt): void {
    if (!this.options.db) return;
    try {
      const lease = this.options.db.acquireCompressionLease({ sessionId, holderId: "context-compressor", leaseMs: 30_000, now: receipt.createdAt });
      if (lease.acquired) this.options.db.saveCompression({ sessionId, lockKey: lease.lockKey, holderId: lease.holderId, sourceHash: receipt.sourceHash, strategy: receipt.strategy, receipt, createdAt: receipt.createdAt });
    } catch {
      // Compression persistence is an observable receipt concern; the caller still has deterministic output.
    }
  }
}
