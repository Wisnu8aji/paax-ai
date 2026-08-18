import type {
  AppendWorkEventInput,
  SessionDB,
  StoredWorkEvent,
} from "./session-db";

export interface DurableWorkEventInput extends AppendWorkEventInput {}

export interface DurableWorkEventReplayInput {
  runId: string;
  sessionId: string;
  afterSequence?: number;
  limit?: number;
}

/** Durable append-before-deliver/replay adapter for the existing WorkEvent envelope. */
export class DurableWorkEventStore {
  constructor(private readonly db: SessionDB) {}

  append(event: DurableWorkEventInput): StoredWorkEvent {
    return this.db.appendWorkEvent(event);
  }

  appendBeforeDeliver(event: DurableWorkEventInput, deliver: (stored: StoredWorkEvent) => void | Promise<void>): Promise<StoredWorkEvent> {
    const stored = this.append(event);
    return Promise.resolve(deliver(stored)).then(() => stored);
  }

  replay(input: DurableWorkEventReplayInput): StoredWorkEvent[] {
    return this.db.readWorkEvents(input);
  }
}
