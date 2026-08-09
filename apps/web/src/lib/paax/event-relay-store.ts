import type { PaaxEventEnvelope } from '@/components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract';

export class PaaxEventRelayStore {
  private runs = new Map<string, PaaxEventEnvelope[]>();
  private listeners = new Map<string, Set<(event: PaaxEventEnvelope) => void>>();

  /** Ingest event and convert to full v2 envelope. */
  ingest(runId: string, rawEvent: Record<string, any>): PaaxEventEnvelope {
    const existing = this.runs.get(runId) || [];
    const seq = Number(rawEvent.sequence ?? existing.length + 1);

    const envelope: PaaxEventEnvelope = {
      jsonrpc: '2.0',
      method: 'paax.event',
      params: {
        event_id: String(rawEvent.event_id || `paax:evt:${runId}:${seq}:00000000`),
        run_id: String(rawEvent.run_id || runId),
        task_id: rawEvent.task_id ?? null,
        parent_task_id: rawEvent.parent_task_id ?? null,
        agent_id: rawEvent.agent_id ?? null,
        session_id: rawEvent.session_id ?? null,
        worker_id: rawEvent.worker_id ?? null,
        provider: rawEvent.provider ?? null,
        model: rawEvent.model ?? null,
        sequence: seq,
        timestamp: String(rawEvent.timestamp || new Date().toISOString()),
        type: String(rawEvent.type || 'task.progress'),
        stage: rawEvent.stage ?? null,
        payload_summary: rawEvent.payload_summary ?? rawEvent.payload ?? null,
        payload_ref: rawEvent.payload_ref ?? null,
        redaction_state: rawEvent.redaction_state || 'clean',
        persistence_status: rawEvent.persistence_status || 'durable',
      },
      _replay: true,
    };

    existing.push(envelope);
    this.runs.set(runId, existing);

    const runListeners = this.listeners.get(runId);
    if (runListeners) {
      for (const listener of runListeners) {
        listener(envelope);
      }
    }

    return envelope;
  }

  /** Ingest batch of raw events or JSONL lines. */
  ingestBatch(runId: string, events: Array<Record<string, any>>): PaaxEventEnvelope[] {
    return events.map((ev) => this.ingest(runId, ev));
  }

  /** Query events for a run after a sequence number, optionally filtered by task. */
  getEvents(runId: string, afterSequence = -1, taskId?: string | null): PaaxEventEnvelope[] {
    const list = this.runs.get(runId) || [];
    return list
      .filter((ev) => ev.params.sequence > afterSequence)
      .filter((ev) => !taskId || ev.params.task_id === taskId)
      .sort((a, b) => a.params.sequence - b.params.sequence);
  }

  /** Check if a run exists in the store. */
  hasRun(runId: string): boolean {
    return this.runs.has(runId) && (this.runs.get(runId)?.length ?? 0) > 0;
  }

  /** Subscribe to live events pushed for a run. */
  subscribe(runId: string, listener: (event: PaaxEventEnvelope) => void): () => void {
    if (!this.listeners.has(runId)) {
      this.listeners.set(runId, new Set());
    }
    this.listeners.get(runId)!.add(listener);
    return () => {
      this.listeners.get(runId)?.delete(listener);
    };
  }

  /** Clear all stored runs and listeners. */
  clear(): void {
    this.runs.clear();
    this.listeners.clear();
  }
}

const globalRef = globalThis as unknown as { __paaxEventRelayStore?: PaaxEventRelayStore };

export function getRelayStore(): PaaxEventRelayStore {
  if (!globalRef.__paaxEventRelayStore) {
    globalRef.__paaxEventRelayStore = new PaaxEventRelayStore();
  }
  return globalRef.__paaxEventRelayStore;
}
