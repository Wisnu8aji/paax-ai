import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MatureAgentRun, MatureRunStatus } from './runtime-types';

const TERMINAL: MatureRunStatus[] = ['failed', 'completed', 'cancelled'];
const TRANSITIONS: Record<MatureRunStatus, MatureRunStatus[]> = {
  queued: ['planning', 'cancelled'],
  planning: ['running', 'blocked', 'failed', 'cancelled'],
  running: ['waiting_tool', 'waiting_approval', 'blocked', 'paused', 'failed', 'completed', 'cancelled'],
  waiting_tool: ['running', 'blocked', 'failed', 'cancelled'],
  waiting_approval: ['running', 'blocked', 'cancelled'],
  blocked: ['running', 'paused', 'failed', 'cancelled'],
  paused: ['running', 'cancelled'],
  failed: [], completed: [], cancelled: [],
};

export function validateMatureTransition(from: MatureRunStatus, to: MatureRunStatus): void {
  if (!TRANSITIONS[from].includes(to)) throw new Error(`invalid agent run transition: ${from} -> ${to}`);
}

export class AgentRunStore {
  private chain: Promise<void> = Promise.resolve();
  constructor(private readonly path: string) {}

  async list(): Promise<MatureAgentRun[]> {
    const data = await this.load();
    return Object.values(data).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async get(runId: string): Promise<MatureAgentRun | null> {
    const data = await this.load();
    return data[runId] ?? null;
  }

  async create(run: MatureAgentRun): Promise<MatureAgentRun> {
    return await this.serialized(async () => {
      const data = await this.load();
      if (data[run.runId]) throw new Error(`agent run already exists: ${run.runId}`);
      data[run.runId] = run;
      await this.save(data);
      return run;
    });
  }

  async update(run: MatureAgentRun, expectedVersion: number): Promise<MatureAgentRun> {
    return await this.serialized(async () => {
      const data = await this.load();
      const current = data[run.runId];
      if (!current) throw new Error(`agent run not found: ${run.runId}`);
      if (current.version !== expectedVersion) throw new Error(`stale agent run: expected ${expectedVersion}, actual ${current.version}`);
      run.version = expectedVersion + 1;
      run.updatedAt = new Date().toISOString();
      data[run.runId] = run;
      await this.save(data);
      return run;
    });
  }

  async transition(runId: string, to: MatureRunStatus, expectedVersion: number, failure?: string): Promise<MatureAgentRun> {
    const run = await this.get(runId);
    if (!run) throw new Error(`agent run not found: ${runId}`);
    validateMatureTransition(run.status, to);
    if (to === 'failed' && !failure?.trim()) throw new Error('failure reason is required');
    return await this.update({ ...run, status: to, failure }, expectedVersion);
  }

  async branch(runId: string, newRunId: string): Promise<MatureAgentRun> {
    const source = await this.get(runId);
    if (!source) throw new Error(`agent run not found: ${runId}`);
    const now = new Date().toISOString();
    const branch: MatureAgentRun = {
      ...structuredClone(source), runId: newRunId, branchOfRunId: runId, replayOfRunId: undefined,
      status: 'queued', activeTaskId: undefined, completedTaskIds: [], failedTaskIds: [],
      invocations: [], observations: [], artifacts: [], pendingApprovalIds: [], version: 0,
      createdAt: now, updatedAt: now, failure: undefined,
    };
    return await this.create(branch);
  }

  async replay(runId: string, newRunId: string): Promise<MatureAgentRun> {
    const replay = await this.branch(runId, newRunId);
    replay.replayOfRunId = runId;
    replay.branchOfRunId = undefined;
    return await this.update(replay, 0);
  }

  private async serialized<T>(fn: () => Promise<T>): Promise<T> {
    let resolveResult!: (value: T) => void;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<T>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
    this.chain = this.chain.then(async () => {
      try { resolveResult(await fn()); } catch (error) { rejectResult(error); }
    });
    await result;
    return result;
  }

  private async load(): Promise<Record<string, MatureAgentRun>> {
    try { return JSON.parse(await readFile(this.path, 'utf8')) as Record<string, MatureAgentRun>; }
    catch (error: any) { if (error?.code === 'ENOENT') return {}; throw error; }
  }

  private async save(data: Record<string, MatureAgentRun>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    await writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
    await rename(temp, this.path);
  }
}
