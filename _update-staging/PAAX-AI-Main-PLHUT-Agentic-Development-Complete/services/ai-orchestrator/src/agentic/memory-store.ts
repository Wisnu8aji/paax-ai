import type { ProjectContextBinding } from './types';

export type MemoryKind = 'semantic' | 'episodic' | 'procedural' | 'standard' | 'reviewer';
export interface AgentMemoryRecord {
  memoryId: string;
  kind: MemoryKind;
  projectId?: string;
  organizationId?: string;
  revisionId?: string;
  key: string;
  value: unknown;
  evidenceRefs: string[];
  createdBy: string;
  createdAt: string;
  supersedesMemoryId?: string;
}

export class AgentMemoryStore {
  private readonly records = new Map<string, AgentMemoryRecord>();

  put(record: AgentMemoryRecord): void {
    if (record.kind === 'semantic' && !record.projectId) throw new Error('semantic project facts require projectId');
    if (record.kind === 'standard' && !record.evidenceRefs.length) throw new Error('standards memory requires source evidence');
    this.records.set(record.memoryId, record);
  }

  query(binding: ProjectContextBinding, kind?: MemoryKind, key?: string): AgentMemoryRecord[] {
    return [...this.records.values()].filter((record) => {
      if (kind && record.kind !== kind) return false;
      if (key && record.key !== key) return false;
      if (record.projectId && record.projectId !== binding.projectId) return false;
      return true;
    });
  }
}
