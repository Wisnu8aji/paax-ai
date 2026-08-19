import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type GoalStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked"
  | "cancelled";

export type GoalPriority = "low" | "medium" | "high" | "critical";

export interface GoalEntity {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: GoalStatus;
  readonly priority: GoalPriority;
  readonly progress: number; // 0 - 100
  readonly deadline?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly notes?: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateGoalInput {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly status?: GoalStatus;
  readonly priority?: GoalPriority;
  readonly progress?: number;
  readonly deadline?: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt?: string;
}

export interface UpdateGoalInput {
  readonly title?: string;
  readonly description?: string;
  readonly status?: GoalStatus;
  readonly priority?: GoalPriority;
  readonly progress?: number;
  readonly deadline?: string;
  readonly metadata?: Record<string, unknown>;
  readonly note?: string;
}

export interface GoalFilter {
  readonly status?: GoalStatus;
  readonly priority?: GoalPriority;
  readonly limit?: number;
  readonly offset?: number;
}

export interface GoalStoreOptions {
  readonly filename?: string;
  readonly database?: DatabaseSync;
  readonly now?: () => string;
}

export class GoalStore {
  private readonly db: DatabaseSync;
  private readonly ownsDatabase: boolean;
  private readonly now: () => string;

  constructor(options: GoalStoreOptions = {}) {
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
      CREATE TABLE IF NOT EXISTS persistent_goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        progress REAL NOT NULL DEFAULT 0,
        deadline TEXT,
        notes_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_goals_status ON persistent_goals(status);
      CREATE INDEX IF NOT EXISTS idx_goals_priority ON persistent_goals(priority);
    `);
  }

  createGoal(input: CreateGoalInput): GoalEntity {
    const id = input.id ?? `goal-${randomUUID()}`;
    const now = input.createdAt ?? this.now();
    const status = input.status ?? "pending";
    const priority = input.priority ?? "medium";
    const progress = Math.max(0, Math.min(input.progress ?? 0, 100));
    const description = input.description ?? "";
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
    const notesJson = JSON.stringify([]);

    this.db.prepare(`
      INSERT INTO persistent_goals (id, title, description, status, priority, progress, deadline, notes_json, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.title,
      description,
      status,
      priority,
      progress,
      input.deadline ?? null,
      notesJson,
      metadataJson,
      now,
      now,
    );

    return this.getGoal(id)!;
  }

  getGoal(id: string): GoalEntity | undefined {
    const row = this.db.prepare("SELECT * FROM persistent_goals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  updateGoal(id: string, updates: UpdateGoalInput): GoalEntity {
    const existing = this.getGoal(id);
    if (!existing) throw new Error(`Goal not found: ${id}`);

    const title = updates.title ?? existing.title;
    const description = updates.description ?? existing.description;
    const status = updates.status ?? existing.status;
    const priority = updates.priority ?? existing.priority;
    const progress = updates.progress !== undefined ? Math.max(0, Math.min(updates.progress, 100)) : existing.progress;
    const deadline = updates.deadline !== undefined ? updates.deadline : existing.deadline;
    const metadataJson = updates.metadata !== undefined ? JSON.stringify(updates.metadata) : (existing.metadata ? JSON.stringify(existing.metadata) : null);

    const notes = [...(existing.notes ?? [])];
    if (updates.note) {
      notes.push(`[${this.now()}] ${updates.note}`);
    }
    const notesJson = JSON.stringify(notes);
    const updatedAt = this.now();

    this.db.prepare(`
      UPDATE persistent_goals
      SET title = ?, description = ?, status = ?, priority = ?, progress = ?, deadline = ?, notes_json = ?, metadata_json = ?, updated_at = ?
      WHERE id = ?
    `).run(title, description, status, priority, progress, deadline ?? null, notesJson, metadataJson, updatedAt, id);

    return this.getGoal(id)!;
  }

  updateGoalStatus(id: string, status: GoalStatus, note?: string): GoalEntity {
    const progress = status === "completed" ? 100 : undefined;
    return this.updateGoal(id, { status, ...(progress !== undefined ? { progress } : {}), ...(note ? { note } : {}) });
  }

  updateGoalProgress(id: string, progress: number, note?: string): GoalEntity {
    const status: GoalStatus | undefined = progress >= 100 ? "completed" : undefined;
    return this.updateGoal(id, { progress, ...(status ? { status } : {}), ...(note ? { note } : {}) });
  }

  deleteGoal(id: string): boolean {
    const result = this.db.prepare("DELETE FROM persistent_goals WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  }

  listGoals(filter: GoalFilter = {}): GoalEntity[] {
    const clauses: string[] = [];
    const args: unknown[] = [];

    if (filter.status) {
      clauses.push("status = ?");
      args.push(filter.status);
    }
    if (filter.priority) {
      clauses.push("priority = ?");
      args.push(filter.priority);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 1000));
    const offset = Math.max(0, filter.offset ?? 0);

    const query = `
      SELECT * FROM persistent_goals
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = this.db.prepare(query).all(...args, limit, offset) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRow(r));
  }

  getGoalProgress(id: string): { progress: number; status: GoalStatus; title: string } {
    const goal = this.getGoal(id);
    if (!goal) throw new Error(`Goal not found: ${id}`);
    return {
      progress: goal.progress,
      status: goal.status,
      title: goal.title,
    };
  }

  close(): void {
    if (this.ownsDatabase) {
      this.db.close();
    }
  }

  private mapRow(row: Record<string, unknown>): GoalEntity {
    let notes: string[] = [];
    try {
      notes = JSON.parse(String(row.notes_json ?? "[]"));
    } catch {
      notes = [];
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
      title: String(row.title),
      description: String(row.description),
      status: String(row.status) as GoalStatus,
      priority: String(row.priority) as GoalPriority,
      progress: Number(row.progress),
      deadline: row.deadline ? String(row.deadline) : undefined,
      notes: Object.freeze(notes),
      metadata: metadata ? Object.freeze(metadata) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

export function createGoalStore(options?: GoalStoreOptions): GoalStore {
  return new GoalStore(options);
}
