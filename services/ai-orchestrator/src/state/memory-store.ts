import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type MemoryType =
  | "project_knowledge"
  | "user_preference"
  | "task_note"
  | "constraint"
  | "decision";

export interface MemoryEntity {
  readonly id: string;
  readonly content: string;
  readonly type: MemoryType;
  readonly tags: readonly string[];
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateMemoryInput {
  readonly id?: string;
  readonly content: string;
  readonly type: MemoryType;
  readonly tags?: readonly string[];
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt?: string;
}

export interface UpdateMemoryInput {
  readonly content?: string;
  readonly type?: MemoryType;
  readonly tags?: readonly string[];
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface MemoryFilter {
  readonly type?: MemoryType;
  readonly tag?: string;
  readonly source?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface MemoryStoreOptions {
  readonly filename?: string;
  readonly database?: DatabaseSync;
  readonly now?: () => string;
}

export class MemoryStore {
  private readonly db: DatabaseSync;
  private readonly ownsDatabase: boolean;
  private readonly now: () => string;

  constructor(options: MemoryStoreOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());

    if (options.database) {
      this.db = options.database;
      this.ownsDatabase = false;
    } else {
      this.db = new DatabaseSync(options.filename ?? ":memory:");
      this.ownsDatabase = true;
    }

    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS persistent_memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        tags TEXT NOT NULL,
        source TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_type ON persistent_memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON persistent_memories(created_at);
    `);
  }

  addMemory(input: CreateMemoryInput): MemoryEntity {
    const id = input.id ?? `mem-${randomUUID()}`;
    const now = input.createdAt ?? this.now();
    const tagsJson = JSON.stringify(input.tags ?? []);
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    this.db.prepare(`
      INSERT INTO persistent_memories (id, content, type, tags, source, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.content,
      input.type,
      tagsJson,
      input.source ?? null,
      metadataJson,
      now,
      now,
    );

    return this.getMemory(id)!;
  }

  getMemory(id: string): MemoryEntity | undefined {
    const row = this.db.prepare("SELECT * FROM persistent_memories WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  getMemoriesByType(type: MemoryType): MemoryEntity[] {
    return this.listMemories({ type });
  }

  searchMemories(query: string, options: { type?: MemoryType; limit?: number } = {}): MemoryEntity[] {
    const q = query.toLowerCase();
    const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
    const all = this.listMemories({ type: options.type, limit: 1000 });

    const matches = all.filter((m) => {
      if (m.content.toLowerCase().includes(q)) return true;
      if (m.tags.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });

    return matches.slice(0, limit);
  }

  updateMemory(id: string, updates: UpdateMemoryInput): MemoryEntity {
    const existing = this.getMemory(id);
    if (!existing) throw new Error(`Memory record not found: ${id}`);

    const content = updates.content ?? existing.content;
    const type = updates.type ?? existing.type;
    const tagsJson = JSON.stringify(updates.tags ?? existing.tags);
    const source = updates.source !== undefined ? updates.source : existing.source;
    const metadataJson = updates.metadata !== undefined ? JSON.stringify(updates.metadata) : (existing.metadata ? JSON.stringify(existing.metadata) : null);
    const updatedAt = this.now();

    this.db.prepare(`
      UPDATE persistent_memories
      SET content = ?, type = ?, tags = ?, source = ?, metadata_json = ?, updated_at = ?
      WHERE id = ?
    `).run(content, type, tagsJson, source ?? null, metadataJson, updatedAt, id);

    return this.getMemory(id)!;
  }

  deleteMemory(id: string): boolean {
    const result = this.db.prepare("DELETE FROM persistent_memories WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  }

  listMemories(filter: MemoryFilter = {}): MemoryEntity[] {
    const clauses: string[] = [];
    const args: unknown[] = [];

    if (filter.type) {
      clauses.push("type = ?");
      args.push(filter.type);
    }
    if (filter.source) {
      clauses.push("source = ?");
      args.push(filter.source);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 1000));
    const offset = Math.max(0, filter.offset ?? 0);

    const query = `
      SELECT * FROM persistent_memories
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = this.db.prepare(query).all(...args, limit, offset) as Array<Record<string, unknown>>;
    let results = rows.map((r) => this.mapRow(r));

    if (filter.tag) {
      const targetTag = filter.tag.toLowerCase();
      results = results.filter((m) => m.tags.some((t) => t.toLowerCase() === targetTag));
    }

    return results;
  }

  close(): void {
    if (this.ownsDatabase) {
      this.db.close();
    }
  }

  private mapRow(row: Record<string, unknown>): MemoryEntity {
    let tags: string[] = [];
    try {
      tags = JSON.parse(String(row.tags ?? "[]"));
    } catch {
      tags = [];
    }

    let metadata: Record<string, unknown> | undefined;
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(String(row.metadata_json));
      } catch {
        metadata = undefined;
      }
    }

    return {
      id: String(row.id),
      content: String(row.content),
      type: String(row.type) as MemoryType,
      tags: Object.freeze(tags),
      source: row.source ? String(row.source) : undefined,
      metadata: metadata ? Object.freeze(metadata) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

export function createMemoryStore(options?: MemoryStoreOptions): MemoryStore {
  return new MemoryStore(options);
}
