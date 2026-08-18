import { createHash } from "node:crypto";
import type { SessionRecord } from "../gateway/session";
import type { MessageRecord, SessionDB } from "../state/session-db";
import type { AgentMessage, ContextSnippet } from "./prompt-builder";

export interface ContextReceipt {
  sourceIds: readonly string[];
  omittedSourceIds: readonly string[];
  tokenEstimate: number;
  failures: readonly string[];
  mode: "durable" | "manual";
}

export interface ContextBuildInput {
  session: SessionRecord;
  messages?: readonly AgentMessage[];
  maxChars: number;
}

export interface ContextBuildResult {
  text: string;
  snippets: readonly ContextSnippet[];
  receipt: ContextReceipt;
}

export interface ContextEngineOptions {
  db: SessionDB;
  maxMessages?: number;
  maxTokens?: number;
  stableSources?: readonly ContextSnippet[];
}

function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }

/** Durable context composer; it never owns model calls or a second conversation loop. */
export class ContextEngine {
  private readonly maxMessages: number;
  private readonly maxTokens: number | undefined;
  private readonly stableSources: readonly ContextSnippet[];

  constructor(private readonly options: ContextEngineOptions) {
    this.maxMessages = Math.max(1, Math.min(options.maxMessages ?? 40, 200));
    this.maxTokens = options.maxTokens === undefined ? undefined : Math.max(1, Math.min(Math.floor(options.maxTokens), 128_000));
    this.stableSources = Object.freeze([...(options.stableSources ?? [])]);
  }

  build(input: ContextBuildInput): ContextBuildResult {
    if (!Number.isInteger(input.maxChars) || input.maxChars <= 0) throw new Error("context maxChars is invalid");
    const maxChars = Math.min(input.maxChars, this.maxTokens === undefined ? input.maxChars : this.maxTokens * 4);
    const current = [...(input.messages ?? [])].map((message, index) => ({
      sourceId: `current-${index}`,
      text: `[current ${message.role}] ${message.content}`,
      projectId: input.session.source.projectId,
      hash: hash(`${message.role}:${message.content}`),
      current: true,
    }));
    const failures: string[] = [];
    const entries: Array<ContextSnippet & { hash: string; current?: boolean }> = [];
    for (const source of this.stableSources) entries.push({ ...source, hash: hash(source.text) });
    let mode: ContextReceipt["mode"] = "durable";
    try {
      const messages = this.options.db.loadMessages({ sessionId: input.session.sessionId, limit: this.maxMessages });
      const currentHashes = new Set(current.map((item) => item.hash));
      for (const message of messages) {
        if (currentHashes.has(message.contentHash)) {
          entries.push(this.messageSnippet(message, input.session));
          currentHashes.delete(message.contentHash);
        } else entries.push(this.messageSnippet(message, input.session));
      }
      const memories = this.options.db.listMemory({ tenantId: input.session.source.tenantId, projectId: input.session.source.projectId, sessionId: input.session.sessionId, limit: 50 });
      for (const memory of memories) entries.push({ sourceId: memory.id, text: `[memory ${memory.kind}] ${memory.key}: ${memory.value}`, evidenceRefs: memory.evidenceRefs, projectId: memory.projectId, hash: hash(`${memory.key}:${memory.value}`) });
    } catch (error) {
      mode = "manual";
      failures.push(error instanceof Error ? error.message.slice(0, 256) : "durable context retrieval failed");
    }
    const all = [...entries, ...current];
    const selected: typeof all = [];
    let used = 0;
    const omitted: string[] = [];
    for (const item of all) {
      const cost = item.text.length + (selected.length ? 1 : 0);
      if (used + cost <= maxChars || item.current) {
        selected.push(item);
        used += cost;
      } else omitted.push(item.sourceId ?? "unknown");
    }
    // Current intent is mandatory. If it alone cannot fit, expose a typed boundary error instead of silently truncating it.
    const currentText = current.map((item) => item.text).join("\n");
    if (currentText.length > maxChars) throw new Error("current turn exceeds context budget");
    const text = selected.map((item) => item.text).join("\n");
    const sourceIds = selected.map((item) => item.sourceId).filter((item): item is string => Boolean(item));
    return {
      text,
      snippets: selected.map(({ hash: _hash, current: _current, ...snippet }) => snippet),
      receipt: { sourceIds, omittedSourceIds: omitted, tokenEstimate: Math.ceil(text.length / 4), failures, mode },
    };
  }

  getContext(input: { session: SessionRecord; maxChars: number }): readonly ContextSnippet[] {
    return this.build(input).snippets;
  }

  private messageSnippet(message: MessageRecord, session: SessionRecord): ContextSnippet & { hash: string } {
    return { sourceId: message.id, text: `[history ${message.role}] ${message.content}`, projectId: session.source.projectId, hash: message.contentHash };
  }
}
