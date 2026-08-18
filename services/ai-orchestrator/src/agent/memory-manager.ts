import { randomUUID } from "node:crypto";
import {
  SessionDB,
  type MemoryRecord,
  type MemoryWriteInput,
  type StateSearchResult,
} from "../state/session-db";
import { safeJsonDecode, safeJsonEncode, safeStateText, type MemoryKind, type MemoryProvenance } from "../state/schema";

export interface MemoryWriteRequest {
  tenantId: string;
  projectId?: string;
  sessionId?: string;
  kind: MemoryKind;
  key: string;
  value: string;
  provenance: MemoryProvenance;
  evidenceRefs: readonly string[];
  confidence?: number;
  approval?: ApprovalReceipt;
  supersedesId?: string;
}

export interface ApprovalReceipt {
  approvalId: string;
  state: "approved" | "rejected" | "expired";
  actorId?: string;
  issuedAt?: string;
  expiresAt?: string;
}

export interface MemoryProposal {
  proposalId: string;
  request: Readonly<MemoryWriteRequest>;
  createdAt: string;
  status: "proposed" | "committed" | "rejected";
}

export interface MemoryRecallRequest {
  tenantId: string;
  projectId?: string;
  sessionId?: string;
  query: string;
  limit?: number;
}

export interface MemoryRecallRecord {
  id: string;
  key: string;
  value: string;
  kind: MemoryKind;
  tenantId: string;
  projectId?: string;
  sessionId?: string;
  evidenceRefs: readonly string[];
  provenance: MemoryProvenance;
  confidence?: number;
  sourceIds: readonly string[];
}

export interface MemoryRecallResult {
  status: "matched" | "empty" | "unavailable";
  records: readonly MemoryRecallRecord[];
  failures: readonly string[];
}

export interface MemorySupersedeRequest {
  tenantId: string;
  previousId: string;
  value: string;
  provenance: MemoryProvenance;
  evidenceRefs: readonly string[];
  confidence?: number;
}

export class MemoryManager {
  private readonly proposals = new Map<string, MemoryProposal>();

  constructor(private readonly db: SessionDB, private readonly now: () => string = () => new Date().toISOString()) {}

  propose(input: MemoryWriteRequest): MemoryProposal {
    const tenantId = required(input.tenantId, "tenantId");
    const key = required(input.key, "memory key", 256);
    const value = safeStateText(input.value, 16_000);
    const provenance = safeJsonDecode(safeJsonEncode(input.provenance, 8_000)) as MemoryProvenance;
    const evidenceRefs = Object.freeze([...input.evidenceRefs].map((ref) => required(ref, "evidence reference", 512)).slice(0, 64));
    if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) throw new Error("memory confidence is invalid");
    const request: MemoryWriteRequest = Object.freeze({
      tenantId,
      ...(input.projectId ? { projectId: required(input.projectId, "projectId") } : {}),
      ...(input.sessionId ? { sessionId: required(input.sessionId, "sessionId") } : {}),
      kind: input.kind,
      key,
      value,
      provenance,
      evidenceRefs,
      ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
      ...(input.approval ? { approval: input.approval } : {}),
      ...(input.supersedesId ? { supersedesId: required(input.supersedesId, "supersedesId") } : {}),
    });
    const proposal: MemoryProposal = Object.freeze({ proposalId: `memory-proposal-${randomUUID()}`, request, createdAt: this.now(), status: "proposed" });
    this.proposals.set(proposal.proposalId, proposal);
    return proposal;
  }

  commit(proposal: MemoryProposal): MemoryRecord {
    const current = this.proposals.get(proposal.proposalId);
    if (!current || current.status !== "proposed") throw new Error("memory proposal is not pending");
    const request: MemoryWriteInput = { ...current.request, evidenceRefs: [...current.request.evidenceRefs] };
    const record = this.db.putMemory(request);
    this.proposals.set(proposal.proposalId, Object.freeze({ ...current, status: "committed" }));
    return record;
  }

  recall(input: MemoryRecallRequest): MemoryRecallResult {
    try {
      const memories = this.db.listMemory({ tenantId: input.tenantId, projectId: input.projectId, sessionId: input.sessionId, includeSuperseded: false, limit: input.limit });
      const matched = input.query.trim()
        ? this.db.search({ query: input.query, tenantId: input.tenantId, projectId: input.projectId, sessionId: input.sessionId, kinds: ["semantic", "episodic", "procedural", "standard", "review"], limit: input.limit }).map((item) => item.recordId)
        : memories.map((item) => item.id);
      const allowed = new Set(matched);
      const records = memories.filter((memory) => allowed.has(memory.id)).map((memory) => this.toRecallRecord(memory));
      return { status: records.length ? "matched" : "empty", records, failures: [] };
    } catch (error) {
      return { status: "unavailable", records: [], failures: [error instanceof Error ? error.message.slice(0, 256) : "memory retrieval failed"] };
    }
  }

  supersede(input: MemorySupersedeRequest): MemoryRecord {
    const previous = this.db.listMemory({ tenantId: input.tenantId, includeSuperseded: true, limit: 2_000 }).find((item) => item.id === input.previousId);
    if (!previous) throw new Error("memory record to supersede was not found");
    return this.commit(this.propose({ tenantId: input.tenantId, projectId: previous.projectId, sessionId: previous.sessionId, kind: previous.kind, key: previous.key, value: input.value, provenance: input.provenance, evidenceRefs: input.evidenceRefs, confidence: input.confidence, supersedesId: input.previousId }));
  }

  private toRecallRecord(memory: MemoryRecord): MemoryRecallRecord {
    return { id: memory.id, key: memory.key, value: memory.value, kind: memory.kind, tenantId: memory.tenantId, projectId: memory.projectId, sessionId: memory.sessionId, evidenceRefs: memory.evidenceRefs, provenance: memory.provenance, confidence: memory.confidence, sourceIds: [...memory.evidenceRefs] };
  }
}

function required(value: unknown, field: string, max = 256): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`${field} is invalid`);
  return result;
}

export type { StateSearchResult };
