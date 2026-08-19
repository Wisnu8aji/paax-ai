import { appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { SessionRecord, SessionSource } from "./session";

export interface SessionIndexEntry {
  readonly sessionId: string;
  readonly keyFingerprint: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly projectId?: string;
  readonly conversationId: string;
  readonly channel: string;
  readonly lastRunId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly summary?: string;
}

export interface SessionIndexFilter {
  readonly tenantId?: string;
  readonly actorId?: string;
  readonly projectId?: string;
  readonly channel?: string;
  readonly limit?: number;
}

export class SessionIndex {
  private readonly filePath?: string;
  private readonly inMemoryEntries: SessionIndexEntry[] = [];

  constructor(filePath?: string) {
    if (filePath) {
      this.filePath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
    }
  }

  async append(session: SessionRecord, summary?: string): Promise<SessionIndexEntry> {
    const entry: SessionIndexEntry = {
      sessionId: session.sessionId,
      keyFingerprint: session.keyFingerprint,
      tenantId: session.source.tenantId,
      actorId: session.source.actorId,
      projectId: session.source.projectId,
      conversationId: session.source.conversationId,
      channel: session.source.channel,
      lastRunId: session.lastRunId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      summary,
    };

    if (this.filePath) {
      const line = JSON.stringify(entry) + "\n";
      await appendFile(this.filePath, line, "utf8");
    } else {
      this.inMemoryEntries.push(entry);
    }

    return entry;
  }

  async list(filter: SessionIndexFilter = {}): Promise<readonly SessionIndexEntry[]> {
    const all = await this.readAll();
    const filtered = all.filter((entry) => {
      if (filter.tenantId && entry.tenantId !== filter.tenantId) return false;
      if (filter.actorId && entry.actorId !== filter.actorId) return false;
      if (filter.projectId && entry.projectId !== filter.projectId) return false;
      if (filter.channel && entry.channel !== filter.channel) return false;
      return true;
    });

    const limit = filter.limit ?? 100;
    return Object.freeze(filtered.slice(-limit).reverse());
  }

  async findBySessionId(sessionId: string): Promise<SessionIndexEntry | undefined> {
    const all = await this.readAll();
    return all.find((e) => e.sessionId === sessionId);
  }

  async findByFingerprint(fingerprint: string): Promise<SessionIndexEntry | undefined> {
    const all = await this.readAll();
    return all.find((e) => e.keyFingerprint === fingerprint);
  }

  private async readAll(): Promise<SessionIndexEntry[]> {
    if (!this.filePath) {
      return [...this.inMemoryEntries];
    }

    if (!existsSync(this.filePath)) {
      return [];
    }

    const content = await readFile(this.filePath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const entries: SessionIndexEntry[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as SessionIndexEntry;
        entries.push(parsed);
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  }
}

export function createSessionIndex(filePath?: string): SessionIndex {
  return new SessionIndex(filePath);
}
