import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ProjectContextBinding } from './types';

export interface AgentEvent<T = unknown> {
  eventId: string;
  type: string;
  binding: ProjectContextBinding;
  payload: T;
  occurredAt: string;
  idempotencyKey: string;
}

type Handler<T = unknown> = (event: AgentEvent<T>) => Promise<void> | void;

export class DurableAgentEventBus {
  private readonly handlers = new Map<string, Handler[]>();
  private readonly seen = new Set<string>();
  constructor(private readonly journalPath: string) {}

  subscribe<T>(type: string, handler: Handler<T>): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as Handler);
    this.handlers.set(type, list);
    return () => this.handlers.set(type, (this.handlers.get(type) ?? []).filter((x) => x !== handler));
  }

  async publish<T>(event: AgentEvent<T>): Promise<'published' | 'duplicate'> {
    if (this.seen.has(event.idempotencyKey)) return 'duplicate';
    this.seen.add(event.idempotencyKey);
    await mkdir(dirname(this.journalPath), { recursive: true });
    await appendFile(this.journalPath, `${JSON.stringify(event)}\n`, 'utf8');
    for (const handler of this.handlers.get(event.type) ?? []) await handler(event);
    for (const handler of this.handlers.get('*') ?? []) await handler(event);
    return 'published';
  }

  async publishWithRecovery<T>(event: AgentEvent<T>, deadLetterPath: string): Promise<'published' | 'duplicate' | 'dead_lettered'> {
    try {
      return await this.publish(event);
    } catch (error: any) {
      await mkdir(dirname(deadLetterPath), { recursive: true });
      await appendFile(deadLetterPath, `${JSON.stringify({ event, error: String(error?.message ?? error), failedAt: new Date().toISOString() })}\n`, 'utf8');
      return 'dead_lettered';
    }
  }

  async replay(): Promise<AgentEvent[]> {
    try {
      const lines = (await readFile(this.journalPath, 'utf8')).split(/\r?\n/).filter(Boolean);
      const events = lines.map((line) => JSON.parse(line) as AgentEvent);
      for (const event of events) this.seen.add(event.idempotencyKey);
      return events;
    } catch (error: any) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }
}
