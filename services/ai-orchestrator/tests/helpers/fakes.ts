import type {
  ProviderCompletion,
  ProviderEvent,
  ProviderRequest,
  ProviderTransport,
} from "../../src/providers/base";

export class FakeClock {
  private currentMs: number;

  constructor(start = "2026-08-18T00:00:00.000Z") {
    const parsed = Date.parse(start);
    if (!Number.isFinite(parsed)) throw new Error("fake clock start must be ISO-8601");
    this.currentMs = parsed;
  }

  now = (): string => new Date(this.currentMs).toISOString();

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("fake clock delta must be non-negative");
    this.currentMs += milliseconds;
  }
}

export class FakeFetch {
  readonly calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

  constructor(private readonly responder: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>) {}

  fetch: typeof fetch = async (input, init) => {
    this.calls.push({ input, init });
    return this.responder(input, init);
  };
}

export class FakeTransport implements ProviderTransport {
  readonly id = "fake-transport";
  readonly capabilities = new Set(["complete", "stream"]);
  readonly completeRequests: ProviderRequest[] = [];
  readonly streamRequests: ProviderRequest[] = [];

  constructor(
    private readonly completions: ProviderCompletion[] = [{ content: "fake completion", finishReason: "stop" }],
    private readonly streams: ProviderEvent[][] = [[{ type: "completed", completion: { content: "fake stream completion", finishReason: "stop" } }]],
  ) {}

  async complete(request: ProviderRequest): Promise<ProviderCompletion> {
    this.completeRequests.push(request);
    const completion = this.completions.shift();
    if (!completion) throw new Error("fake transport completion queue exhausted");
    return completion;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.streamRequests.push(request);
    const events = this.streams.shift();
    if (!events) throw new Error("fake transport stream queue exhausted");
    yield* events;
  }
}

export class FakeToolRegistry<TEntry = unknown> {
  readonly lookups: string[] = [];

  constructor(private readonly entries: ReadonlyMap<string, TEntry> = new Map()) {}

  get(name: string): TEntry | undefined {
    this.lookups.push(name);
    return this.entries.get(name);
  }
}

export class FakeApprovalDecisionSource<TDecision = "approved" | "rejected"> {
  readonly requests: unknown[] = [];
  private readonly waiters = new Map<string, (decision: TDecision) => void>();

  request(approvalId: string, request: unknown): Promise<TDecision> {
    this.requests.push(request);
    return new Promise<TDecision>((resolve) => this.waiters.set(approvalId, resolve));
  }

  decide(approvalId: string, decision: TDecision): boolean {
    const resolve = this.waiters.get(approvalId);
    if (!resolve) return false;
    this.waiters.delete(approvalId);
    resolve(decision);
    return true;
  }
}
