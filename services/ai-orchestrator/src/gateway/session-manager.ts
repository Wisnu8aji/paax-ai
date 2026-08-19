import type { MessageRecord, RunRecord, SessionDB } from "../state/session-db";
import type { SessionRecord, SessionStore } from "./session";
import { SessionIndex } from "./session-index";

export interface SessionResumeResult {
  readonly session: SessionRecord;
  readonly lastRun?: RunRecord;
  readonly messages: readonly MessageRecord[];
  readonly canResume: boolean;
}

export interface SessionArchiveManifest {
  readonly archiveId: string;
  readonly sessionId: string;
  readonly messageCount: number;
  readonly archivedAt: string;
  readonly data: {
    readonly session: SessionRecord;
    readonly messages: readonly MessageRecord[];
  };
}

export class SessionManager {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly sessionDb?: SessionDB,
    private readonly sessionIndex?: SessionIndex,
  ) {}

  /**
   * Resumes a session after a restart or crash by recovering session metadata,
   * message history, and the last active run.
   */
  async resumeSession(sessionId: string): Promise<SessionResumeResult> {
    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      throw new Error(`Session not found for resume: ${sessionId}`);
    }

    let lastRun: RunRecord | undefined;
    let messages: MessageRecord[] = [];

    if (this.sessionDb) {
      if (session.lastRunId) {
        lastRun = this.sessionDb.getRun(session.lastRunId);
      }
      messages = this.sessionDb.loadMessages({ sessionId, limit: 500 });
    }

    const canResume = session !== null;

    return {
      session,
      lastRun,
      messages: Object.freeze(messages),
      canResume,
    };
  }

  /**
   * Creates an archival snapshot of a session.
   */
  async archiveSession(sessionId: string): Promise<SessionArchiveManifest> {
    const resume = await this.resumeSession(sessionId);
    const manifest: SessionArchiveManifest = {
      archiveId: `arch-${sessionId}-${Date.now()}`,
      sessionId,
      messageCount: resume.messages.length,
      archivedAt: new Date().toISOString(),
      data: {
        session: resume.session,
        messages: resume.messages,
      },
    };

    return manifest;
  }
}

export function createSessionManager(
  sessionStore: SessionStore,
  sessionDb?: SessionDB,
  sessionIndex?: SessionIndex,
): SessionManager {
  return new SessionManager(sessionStore, sessionDb, sessionIndex);
}
