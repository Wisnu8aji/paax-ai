import { redactWorkPayload } from "./work-agent-redaction";
import type {
  WorkApprovalRequest,
  WorkEvent,
  WorkSessionSnapshot,
  WorkTask,
  WorkToolRecord,
} from "./work-agent-types";

export const WORK_STORAGE_KEY = "paax-work-sessions-v1";
const MAX_EVENTS = 240;
const MAX_COMMENTARY = 120;
const MAX_LOGS = 160;
const MAX_TEXT = 120_000;

export type WorkStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface WorkAgentStoreSnapshot {
  sessionsById: Record<string, WorkSessionSnapshot>;
  sessionOrder: string[];
}

type Listener = () => void;

function browserStorage(): WorkStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function now(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function newSession(sessionId: string, title: string): WorkSessionSnapshot {
  const timestamp = now();
  return {
    sessionId,
    title: title.trim() || "New work",
    runId: null,
    state: "idle",
    phase: "idle",
    prompt: "",
    tasks: [],
    tools: [],
    events: [],
    commentary: [],
    reasoning: "",
    answer: "",
    logs: [],
    pendingApproval: null,
    lastSequence: -1,
    updatedAt: timestamp,
  };
}

function storageState(value: string | null): WorkAgentStoreSnapshot {
  if (!value) return { sessionsById: {}, sessionOrder: [] };
  try {
    const parsed = JSON.parse(value) as Partial<WorkAgentStoreSnapshot>;
    if (!parsed || typeof parsed !== "object" || !parsed.sessionsById || !Array.isArray(parsed.sessionOrder)) {
      return { sessionsById: {}, sessionOrder: [] };
    }
    const sessionsById = Object.fromEntries(
      Object.entries(parsed.sessionsById).filter(([, session]) => Boolean(session && typeof session === "object")),
    ) as Record<string, WorkSessionSnapshot>;
    const sessionOrder = parsed.sessionOrder.filter((id): id is string => typeof id === "string" && Boolean(sessionsById[id]));
    return { sessionsById, sessionOrder };
  } catch {
    return { sessionsById: {}, sessionOrder: [] };
  }
}

function upsertTask(tasks: WorkTask[], task: WorkTask): WorkTask[] {
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index < 0) return [...tasks, task];
  return tasks.map((item, itemIndex) => (itemIndex === index ? { ...item, ...task } : item));
}

function upsertTool(tools: WorkToolRecord[], tool: WorkToolRecord): WorkToolRecord[] {
  const safeTool: WorkToolRecord = {
    ...tool,
    args: tool.args === undefined ? undefined : redactWorkPayload(tool.args),
    result: tool.result === undefined ? undefined : redactWorkPayload(tool.result),
  };
  const index = tools.findIndex((item) => item.toolId === tool.toolId);
  if (index < 0) return [...tools, safeTool];
  return tools.map((item, itemIndex) => (itemIndex === index ? { ...item, ...safeTool } : item));
}

export class WorkAgentStore {
  private state: WorkAgentStoreSnapshot;
  private readonly storage: WorkStorage | null;
  private readonly listeners = new Set<Listener>();
  private readonly seenEventIds = new Map<string, Set<string>>();
  private readonly seenSequences = new Map<string, Set<number>>();

  constructor(storage: WorkStorage | null = browserStorage()) {
    this.storage = storage;
    this.state = storageState(storage?.getItem(WORK_STORAGE_KEY) ?? null);
    for (const [sessionId, session] of Object.entries(this.state.sessionsById)) {
      this.seenEventIds.set(sessionId, new Set(session.events.map((event) => event.eventId)));
      this.seenSequences.set(sessionId, new Set(session.events.map((event) => event.sequence)));
    }
  }

  getSnapshot = (): WorkAgentStoreSnapshot => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  listSessions(): WorkSessionSnapshot[] {
    return this.state.sessionOrder
      .map((sessionId) => this.state.sessionsById[sessionId])
      .filter((session): session is WorkSessionSnapshot => Boolean(session));
  }

  getSession(sessionId: string): WorkSessionSnapshot | undefined {
    return this.state.sessionsById[sessionId];
  }

  createSession(title = "New work", sessionId = newId("work")): string {
    const session = newSession(sessionId, title);
    this.state = {
      sessionsById: { ...this.state.sessionsById, [sessionId]: session },
      sessionOrder: [sessionId, ...this.state.sessionOrder.filter((id) => id !== sessionId)],
    };
    this.seenEventIds.set(sessionId, new Set());
    this.seenSequences.set(sessionId, new Set());
    this.persist();
    this.notify();
    return sessionId;
  }

  removeSession(sessionId: string): void {
    if (!this.state.sessionsById[sessionId]) return;
    const { [sessionId]: _removed, ...sessionsById } = this.state.sessionsById;
    this.state = {
      sessionsById,
      sessionOrder: this.state.sessionOrder.filter((id) => id !== sessionId),
    };
    this.seenEventIds.delete(sessionId);
    this.seenSequences.delete(sessionId);
    this.persist();
    this.notify();
  }

  applyEvent(sessionId: string, event: WorkEvent): void {
    const session = this.state.sessionsById[sessionId];
    if (!session || event.conversationId !== sessionId) return;
    if (session.runId && session.runId !== event.runId) return;

    const eventIds = this.seenEventIds.get(sessionId) ?? new Set<string>();
    const sequences = this.seenSequences.get(sessionId) ?? new Set<number>();
    if (eventIds.has(event.eventId) || sequences.has(event.sequence)) return;
    eventIds.add(event.eventId);
    sequences.add(event.sequence);
    this.seenEventIds.set(sessionId, eventIds);
    this.seenSequences.set(sessionId, sequences);

    let next: WorkSessionSnapshot = {
      ...session,
      runId: session.runId ?? event.runId,
      events: [...session.events, { ...event, args: event.args === undefined ? undefined : redactWorkPayload(event.args) }].slice(-MAX_EVENTS),
      lastSequence: Math.max(session.lastSequence, event.sequence),
      updatedAt: event.timestamp || now(),
    };

    switch (event.type) {
      case "turn.started":
        next = { ...next, state: "running", phase: event.phase ?? "starting", prompt: typeof event.message === "string" ? event.message : next.prompt };
        break;
      case "status.update":
        next = { ...next, state: next.state === "waiting_approval" ? next.state : "running", phase: event.phase ?? next.phase };
        break;
      case "assistant.interim":
        if (typeof event.message === "string" && event.message.trim()) {
          next = { ...next, commentary: [...next.commentary, event.message].slice(-MAX_COMMENTARY) };
        }
        break;
      case "reasoning.delta":
        next = { ...next, reasoning: `${next.reasoning}${typeof event.delta === "string" ? event.delta : ""}`.slice(-MAX_TEXT) };
        break;
      case "plan.updated":
        if (Array.isArray(event.tasks)) next = { ...next, tasks: event.tasks };
        else if (event.task) next = { ...next, tasks: upsertTask(next.tasks, event.task) };
        break;
      case "tool.generating":
      case "tool.started":
      case "tool.progress":
      case "tool.completed":
        if (event.tool) next = { ...next, tools: upsertTool(next.tools, event.tool) };
        break;
      case "approval.requested":
        next = { ...next, state: "waiting_approval", pendingApproval: event.approval ?? null };
        break;
      case "approval.resolved":
        next = { ...next, state: event.approval?.state === "denied" ? "failed" : "running", pendingApproval: null };
        break;
      case "log.line":
        if (event.log) next = { ...next, logs: [...next.logs, { ...event.log, timestamp: event.timestamp }].slice(-MAX_LOGS) };
        break;
      case "assistant.delta":
        next = { ...next, state: "running", answer: `${next.answer}${typeof event.delta === "string" ? event.delta : ""}`.slice(-MAX_TEXT) };
        break;
      case "turn.completed":
        next = { ...next, state: "completed", phase: "completed", answer: typeof event.finalMarkdown === "string" ? event.finalMarkdown : next.answer };
        break;
      case "error":
        next = { ...next, state: "failed", phase: "failed", errorMessage: event.errorMessage ?? event.message ?? "Work failed" };
        break;
      default:
        break;
    }

    this.state = { ...this.state, sessionsById: { ...this.state.sessionsById, [sessionId]: next }, sessionOrder: [sessionId, ...this.state.sessionOrder.filter((id) => id !== sessionId)] };
    this.persist();
    this.notify();
  }

  private persist(): void {
    try {
      this.storage?.setItem(WORK_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // A full or unavailable browser storage must not interrupt a live turn.
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const workAgentStore = new WorkAgentStore();
