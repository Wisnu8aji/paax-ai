import type { PaaxEventEnvelope } from '@/components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract';
import { getAgentEventJournalPath, readJournalEvents } from './agent-event-journal';

/** Strip the `paax:run:` prefix so raw and canonical run ids share one store key. */
function canonicalRunId(runId: string): string {
  return String(runId).trim().replace(/^paax:run:/, '');
}

export class PaaxEventRelayStore {
  private runs = new Map<string, PaaxEventEnvelope[]>();
  private listeners = new Map<string, Set<(event: PaaxEventEnvelope) => void>>();

  /** Ingest event and convert to full v2 envelope. Dedup by event_id (plan §3.6). */
  ingest(runId: string, rawEvent: Record<string, any>): PaaxEventEnvelope {
    const key = canonicalRunId(runId);
    const src = (rawEvent && typeof rawEvent === 'object' && rawEvent.params && typeof rawEvent.params === 'object')
      ? (rawEvent.params as Record<string, any>)
      : (rawEvent || {});
    const existing = this.runs.get(key) || [];
    const seq = Number(src.sequence ?? existing.length + 1);

    const envelope: PaaxEventEnvelope = {
      jsonrpc: '2.0',
      method: 'paax.event',
      params: {
        event_id: String(src.event_id || `paax:evt:${runId}:${seq}:00000000`),
        run_id: String(src.run_id || runId),
        task_id: src.task_id ?? null,
        parent_task_id: src.parent_task_id ?? null,
        agent_id: src.agent_id ?? null,
        session_id: src.session_id ?? null,
        worker_id: src.worker_id ?? null,
        provider: src.provider ?? null,
        model: src.model ?? null,
        sequence: seq,
        timestamp: String(src.timestamp || new Date().toISOString()),
        type: String(src.type || 'task.progress'),
        stage: src.stage ?? null,
        payload_summary: src.payload_summary ?? src.payload ?? null,
        payload_ref: src.payload_ref ?? null,
        redaction_state: src.redaction_state || 'clean',
        persistence_status: src.persistence_status || 'durable',
      },
      _replay: true,
    };

    // Dedup event_id sesuai kontrak plan §3.6 (EventStore append-only, dedup event_id).
    if (existing.some((e) => e.params.event_id === envelope.params.event_id)) {
      return envelope; // idempotent — sudah ada, tidak diduplikasi
    }

    existing.push(envelope);
    // Sort by sequence untuk menjaga urutan deterministik setelah push.
    existing.sort((a, b) => a.params.sequence - b.params.sequence);
    this.runs.set(key, existing);

    const runListeners = this.listeners.get(key);
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

  /**
   * Replay events for a run from the durable worker journal
   * (PAAX_AGENT_EVENT_JOURNAL). Recovery path for worker→web relay outages:
   * events the worker persisted locally but could not relay are hydrated here
   * so the browser never stays at sequence 0.
   *
   * Keyed by raw or `paax:run:<id>` run ids (canonical store key), dedup by
   * event_id AND sequence. Replay is SILENT (no listener notification) —
   * callers that need live push (e.g. SSE) use `refreshFromJournal` or send
   * the returned envelopes themselves, so hydrated events are never
   * double-delivered. Returns the newly added envelopes, [] if nothing new or
   * the journal is missing/empty/unconfigured.
   */
  hydrateFromJournal(runId: string, journalPath?: string): PaaxEventEnvelope[] {
    const path = journalPath ?? getAgentEventJournalPath();
    if (!path) return [];

    const journalEvents = readJournalEvents(path, runId);
    if (journalEvents.length === 0) return [];

    const key = canonicalRunId(runId);
    const existing = this.runs.get(key) || [];
    const seenIds = new Set(existing.map((e) => e.params.event_id));
    const seenSeqs = new Set(existing.map((e) => e.params.sequence));
    const added: PaaxEventEnvelope[] = [];
    for (const ev of journalEvents) {
      if (seenIds.has(ev.params.event_id) || seenSeqs.has(ev.params.sequence)) continue;
      seenIds.add(ev.params.event_id);
      seenSeqs.add(ev.params.sequence);
      added.push(ev);
    }
    if (added.length === 0) return [];

    this.runs.set(key, [...existing, ...added].sort((a, b) => a.params.sequence - b.params.sequence));
    return added;
  }

  /** Hydrate new journal events and notify live subscribers (SSE refresh path). */
  refreshFromJournal(runId: string, journalPath?: string): PaaxEventEnvelope[] {
    const added = this.hydrateFromJournal(runId, journalPath);
    if (added.length === 0) return [];

    const key = canonicalRunId(runId);
    const runListeners = this.listeners.get(key);
    if (runListeners) {
      for (const listener of runListeners) {
        for (const ev of added) {
          listener(ev);
        }
      }
    }
    return added;
  }

  /** Query events for a run after a sequence number, optionally filtered by task. */
  getEvents(runId: string, afterSequence = -1, taskId?: string | null): PaaxEventEnvelope[] {
    const list = this.runs.get(canonicalRunId(runId)) || [];
    return list
      .filter((ev) => ev.params.sequence > afterSequence)
      .filter((ev) => !taskId || ev.params.task_id === taskId)
      .sort((a, b) => a.params.sequence - b.params.sequence);
  }

  /** Check if a run exists in the store. */
  hasRun(runId: string): boolean {
    return this.runs.has(canonicalRunId(runId)) && (this.runs.get(canonicalRunId(runId))?.length ?? 0) > 0;
  }

  /** Subscribe to live events pushed for a run. */
  subscribe(runId: string, listener: (event: PaaxEventEnvelope) => void): () => void {
    const key = canonicalRunId(runId);
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
    return () => {
      this.listeners.get(key)?.delete(listener);
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
