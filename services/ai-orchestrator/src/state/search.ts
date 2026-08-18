import { DatabaseSync } from "node:sqlite";
import { safeJsonDecode } from "./schema";

export interface StateSearchInput {
  query: string;
  tenantId: string;
  sessionId?: string;
  projectId?: string;
  kinds?: readonly string[];
  limit?: number;
}

export interface StateSearchResult {
  recordId: string;
  scopeType: string;
  tenantId: string;
  sessionId?: string;
  projectId?: string;
  kind: string;
  content: string;
  createdAt: string;
  rank: number;
  evidenceRefs: readonly string[];
}

function required(value: unknown, field: string, max = 256): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`${field} is invalid`);
  return normalized;
}

function escapedMatchQuery(query: string): string {
  const normalized = required(query, "search query", 2_000);
  if (/["'*:(){}\[\]]/.test(normalized)) throw new Error("search query contains unsupported MATCH syntax");
  const terms = normalized.match(/[\p{L}\p{N}_-]+/gu)?.filter((term) => !/^(AND|OR|NOT|NEAR)$/i.test(term)) ?? [];
  if (terms.length === 0 || terms.length > 32) throw new Error("search query has no usable terms");
  return terms.map((term) => `"${term.replace(/"/g, "")}"`).join(" AND ");
}

export function searchState(db: DatabaseSync, input: StateSearchInput): StateSearchResult[] {
  const tenantId = required(input.tenantId, "tenantId");
  const match = escapedMatchQuery(input.query);
  const limit = input.limit === undefined ? 50 : input.limit;
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("search result limit is invalid");
  const clauses = ["state_fts MATCH ?", "tenant_id = ?"];
  const args: (string | number)[] = [match, tenantId];
  if (input.sessionId) { clauses.push("session_id = ?"); args.push(required(input.sessionId, "sessionId")); }
  if (input.projectId) { clauses.push("project_id = ?"); args.push(required(input.projectId, "projectId")); }
  if (input.kinds && input.kinds.length > 0) {
    const kinds = input.kinds.map((kind) => required(kind, "search kind", 64));
    clauses.push(`kind in (${kinds.map(() => "?").join(",")})`);
    args.push(...kinds);
  }
  args.push(Math.min(limit, 500));
  let rows: Array<Record<string, unknown>>;
  try {
    rows = db.prepare(`select record_id, scope_type, tenant_id, session_id, project_id, kind, content, created_at, bm25(state_fts) as rank from state_fts where ${clauses.join(" and ")} order by rank asc, created_at asc, record_id asc limit ?`).all(...args) as Array<Record<string, unknown>>;
  } catch {
    throw new Error("state search is unavailable");
  }
  return rows.map((row) => {
    let evidenceRefs: readonly string[] = [];
    if (row.scope_type === "memory") {
      const memory = db.prepare("select evidence_refs_json from memory_records where id = ? and status = 'active'").get(String(row.record_id)) as { evidence_refs_json?: string } | undefined;
      if (memory?.evidence_refs_json) {
        const parsed = safeJsonDecode(memory.evidence_refs_json);
        if (Array.isArray(parsed)) evidenceRefs = parsed.filter((item): item is string => typeof item === "string").slice(0, 64);
      }
    }
    return {
      recordId: String(row.record_id),
      scopeType: String(row.scope_type),
      tenantId: String(row.tenant_id),
      sessionId: row.session_id === null ? undefined : String(row.session_id),
      projectId: row.project_id === null ? undefined : String(row.project_id),
      kind: String(row.kind),
      content: String(row.content).slice(0, 16_000),
      createdAt: String(row.created_at),
      rank: Number(row.rank),
      evidenceRefs,
    } satisfies StateSearchResult;
  });
}
