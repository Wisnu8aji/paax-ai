import { redactWorkPayload } from "./work-agent-redaction";
import type {
  WorkApprovalRequest,
  WorkEvent,
  WorkSessionSnapshot,
  WorkTask,
  WorkToolRecord,
} from "./work-agent-types";
import { normalizeWorkEvent } from "./work-agent-types";

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
  private readonly seenSequences = new Map<string, Set<string>>();
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(storage: WorkStorage | null = browserStorage()) {
    this.storage = storage;
    this.state = storageState(storage?.getItem(WORK_STORAGE_KEY) ?? null);
    for (const [sessionId, session] of Object.entries(this.state.sessionsById)) {
      this.seenEventIds.set(sessionId, new Set(session.events.map((event) => event.eventId)));
      this.seenSequences.set(sessionId, new Set(session.events.map((event) => `${event.runId}:${event.sequence}`)));
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
    this.seenSequences.set(sessionId, new Set<string>());
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
    this.abortControllers.get(sessionId)?.abort();
    this.abortControllers.delete(sessionId);
    this.persist();
    this.notify();
  }

  applyEvent(sessionId: string, event: WorkEvent): void {
    const session = this.state.sessionsById[sessionId];
    if (!session || event.conversationId !== sessionId) return;
    if (session.runId && session.runId !== event.runId) return;

    const safeEvent = redactWorkPayload(event, 120_000) as WorkEvent;

    const eventIds = this.seenEventIds.get(sessionId) ?? new Set<string>();
    const sequences = this.seenSequences.get(sessionId) ?? new Set<string>();
    const sequenceKey = `${safeEvent.runId}:${safeEvent.sequence}`;
    if (eventIds.has(safeEvent.eventId) || sequences.has(sequenceKey)) return;
    eventIds.add(safeEvent.eventId);
    sequences.add(sequenceKey);
    this.seenEventIds.set(sessionId, eventIds);
    this.seenSequences.set(sessionId, sequences);

    let next: WorkSessionSnapshot = {
      ...session,
      runId: session.runId ?? safeEvent.runId,
      events: [...session.events, safeEvent].slice(-MAX_EVENTS),
      lastSequence: Math.max(session.lastSequence, safeEvent.sequence),
      updatedAt: safeEvent.timestamp || now(),
    };

    switch (safeEvent.type) {
      case "turn.started":
        next = { ...next, state: "running", phase: safeEvent.phase ?? "starting", prompt: typeof safeEvent.message === "string" ? safeEvent.message : next.prompt };
        break;
      case "status.update":
        next = { ...next, state: next.state === "waiting_approval" ? next.state : "running", phase: safeEvent.phase ?? next.phase };
        break;
      case "assistant.interim":
        if (typeof safeEvent.message === "string" && safeEvent.message.trim()) {
          next = { ...next, commentary: [...next.commentary, safeEvent.message].slice(-MAX_COMMENTARY) };
        }
        break;
      case "reasoning.delta":
        next = { ...next, reasoning: `${next.reasoning}${typeof safeEvent.delta === "string" ? safeEvent.delta : ""}`.slice(-MAX_TEXT) };
        break;
      case "plan.updated":
        if (Array.isArray(safeEvent.tasks)) next = { ...next, tasks: safeEvent.tasks };
        else if (safeEvent.task) next = { ...next, tasks: upsertTask(next.tasks, safeEvent.task) };
        break;
      case "tool.generating":
      case "tool.started":
      case "tool.progress":
      case "tool.completed":
        if (safeEvent.tool) next = { ...next, tools: upsertTool(next.tools, safeEvent.tool) };
        break;
      case "approval.requested":
        next = { ...next, state: "waiting_approval", pendingApproval: safeEvent.approval ?? null };
        break;
      case "approval.resolved":
        next = { ...next, state: safeEvent.approval?.state === "denied" ? "failed" : "running", pendingApproval: null };
        break;
      case "log.line":
        if (safeEvent.log) next = { ...next, logs: [...next.logs, { ...safeEvent.log, timestamp: safeEvent.timestamp }].slice(-MAX_LOGS) };
        break;
      case "assistant.delta":
        next = { ...next, state: "running", answer: `${next.answer}${typeof safeEvent.delta === "string" ? safeEvent.delta : ""}`.slice(-MAX_TEXT) };
        break;
      case "turn.completed":
        next = { ...next, state: "completed", phase: "completed", answer: typeof safeEvent.finalMarkdown === "string" ? safeEvent.finalMarkdown : next.answer };
        break;
      case "error":
        next = { ...next, state: "failed", phase: "failed", errorMessage: safeEvent.errorMessage ?? safeEvent.message ?? "Work failed" };
        break;
      default:
        break;
    }

    this.state = { ...this.state, sessionsById: { ...this.state.sessionsById, [sessionId]: next }, sessionOrder: [sessionId, ...this.state.sessionOrder.filter((id) => id !== sessionId)] };
    this.persist();
    this.notify();
  }

  async startTurn(sessionId: string, prompt: string): Promise<void> {
    const session = this.state.sessionsById[sessionId];
    const cleanPrompt = prompt.trim();
    if (!session || !cleanPrompt || this.abortControllers.has(sessionId)) return;

    const runId = newId("work-run");
    const startedAt = now();
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const event of session.events) {
      if (event.type === "turn.started" && typeof event.message === "string" && event.message.trim()) {
        history.push({ role: "user", content: event.message });
      }
      if (event.type === "turn.completed" && typeof event.finalMarkdown === "string" && event.finalMarkdown.trim()) {
        history.push({ role: "assistant", content: event.finalMarkdown });
      }
    }
    history.push({ role: "user", content: cleanPrompt });

    this.state = {
      ...this.state,
      sessionsById: {
        ...this.state.sessionsById,
        [sessionId]: {
          ...session,
          runId,
          state: "running",
          phase: "starting",
          prompt: cleanPrompt,
          tasks: [],
          tools: [],
          commentary: [],
          reasoning: "",
          answer: "",
          logs: [],
          pendingApproval: null,
          lastSequence: -1,
          errorMessage: undefined,
          updatedAt: startedAt,
        },
      },
      sessionOrder: [sessionId, ...this.state.sessionOrder.filter((id) => id !== sessionId)],
    };
    this.seenEventIds.set(sessionId, new Set());
    this.seenSequences.set(sessionId, new Set<string>());
    this.persist();
    this.notify();

    const controller = new AbortController();
    this.abortControllers.set(sessionId, controller);
    try {
      const response = await fetch("/api/command-room/work", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Conversation-Id": sessionId },
        body: JSON.stringify({
          mode: "work",
          runId,
          conversationId: sessionId,
          messages: history,
          modelAlias: "lucent",
          reasoningEffort: "high",
          thinking: "on",
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let message = `HTTP ${response.status} ${response.statusText}`;
        try {
          const body = await response.json() as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // Non-JSON error bodies are represented by the HTTP status.
        }
        throw new Error(message);
      }
      if (!response.body) throw new Error("Work response stream tidak tersedia.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      const consume = (block: string) => {
        const dataLine = block.split(/\r?\n/).find((line) => line.startsWith("data: "));
        if (!dataLine) return;
        const raw = dataLine.slice(6).trim();
        if (!raw || raw === "[DONE]") return;
        let value: unknown;
        try { value = JSON.parse(raw); } catch { return; }
        const event = normalizeWorkEvent(value);
        if (event) this.applyEvent(sessionId, event);
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        blocks.forEach(consume);
      }
      if (buffer.trim()) consume(buffer);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        const current = this.state.sessionsById[sessionId];
        const sequence = Math.max(0, current?.lastSequence ?? -1) + 1;
        this.applyEvent(sessionId, {
          type: "error",
          runId,
          conversationId: sessionId,
          eventId: `${runId}:${sequence}`,
          sequence,
          timestamp: now(),
          errorMessage: error instanceof Error ? error.message : "Work request gagal",
        });
      }
    } finally {
      this.abortControllers.delete(sessionId);
    }
  }

  cancelTurn(sessionId: string): void {
    const controller = this.abortControllers.get(sessionId);
    const session = this.state.sessionsById[sessionId];
    if (!controller || !session) return;
    controller.abort();
    this.abortControllers.delete(sessionId);
    this.state = {
      ...this.state,
      sessionsById: {
        ...this.state.sessionsById,
        [sessionId]: { ...session, state: "cancelled", phase: "cancelled", updatedAt: now() },
      },
    };
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
