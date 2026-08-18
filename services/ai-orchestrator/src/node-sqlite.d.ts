declare module "node:sqlite" {
  export interface StatementSync {
    run(...parameters: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...parameters: unknown[]): Record<string, unknown> | undefined;
    all(...parameters: unknown[]): Array<Record<string, unknown>>;
    iterate(...parameters: unknown[]): Iterable<Record<string, unknown>>;
  }

  export class DatabaseSync {
    constructor(location: string, options?: Record<string, unknown>);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
