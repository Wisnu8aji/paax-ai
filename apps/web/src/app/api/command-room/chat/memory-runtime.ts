export interface DurableMemoryRuntimeRecord {
  scope: string;
  scope_ref_id?: string | null;
  type: string;
  content: string;
  source_type: string;
  importance?: number;
  status: string;
}

const PROJECT_FACT_SOURCES = new Set(["evidence", "approved_correction", "project_graph"]);

/** Project facts can only originate from traceable evidence or an approved correction. */
export function canPersistDurableMemory(memory: Pick<DurableMemoryRuntimeRecord, "scope" | "type" | "source_type">): boolean {
  return !(memory.scope === "project" && memory.type === "fact") || PROJECT_FACT_SOURCES.has(memory.source_type);
}

function terms(value: string): string[] {
  return value.toLocaleLowerCase("id-ID").split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2);
}

/** Relevance-scoped recall; temporary run state is intentionally excluded across requests. */
export function selectRelevantMemories(input: {
  projectId?: string;
  conversationId?: string;
  query: string;
  memories: DurableMemoryRuntimeRecord[];
  limit?: number;
}): string[] {
  const queryTerms = new Set(terms(input.query));
  return input.memories
    .filter((memory) => memory.status === "active" && canPersistDurableMemory(memory))
    .filter((memory) => (
      (memory.scope === "project" && memory.scope_ref_id === input.projectId) ||
      (memory.scope === "conversation" && memory.scope_ref_id === input.conversationId) ||
      memory.scope === "global_user"
    ))
    .map((memory) => ({ memory, score: terms(memory.content).filter((term) => queryTerms.has(term)).length }))
    .sort((left, right) => (right.score - left.score) || ((right.memory.importance ?? 0.5) - (left.memory.importance ?? 0.5)))
    .slice(0, input.limit ?? 8)
    .map(({ memory }) => memory.content);
}

/** Best-effort summary persistence; failures never affect the chat response. */
export async function persistConversationSummary(input: {
  dbApiUrl?: string;
  authorization?: string | null;
  conversationId?: string;
  content: string;
  fetchFn?: typeof fetch;
}): Promise<void> {
  if (!input.dbApiUrl || !input.conversationId || !input.content.trim()) return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.authorization) headers.Authorization = input.authorization;
  const internalKey = process.env.INTERNAL_SERVICE_KEY?.trim();
  if (internalKey) {
    headers["X-Internal-Key"] = internalKey;
    headers["X-User-Id"] = "service-account";
  }
  const summary = input.content.trim().slice(0, 2_000);
  try {
    await (input.fetchFn ?? fetch)(`${input.dbApiUrl.replace(/\/$/, "")}/memory/durable`, {
      method: "POST", headers,
      body: JSON.stringify({
        scope: "conversation", scope_ref_id: input.conversationId, type: "summary", content: summary,
        entities: [], importance: 0.5, confidence: 1, source_type: "server_summary", source_id: input.conversationId,
      }),
    });
  } catch { /* persistence is nonblocking and fail-closed */ }
}
