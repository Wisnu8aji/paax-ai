export interface CronHostScheduler {
  tick(now?: string): Promise<readonly unknown[]>;
}

export interface CronHostOptions {
  scheduler: CronHostScheduler;
  enabled?: boolean;
  intervalMs?: number;
  now?: () => string;
  onError?: (error: Error) => void | Promise<void>;
}

/** Explicitly controlled timer host. It is disabled unless the composition root opts in. */
export class CronHost {
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly now: () => string;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<readonly unknown[]> | undefined;

  constructor(private readonly options: CronHostOptions) {
    this.enabled = options.enabled ?? (process.env.PAAX_CRON_ENABLED === "1" || process.env.PAAX_CRON_ENABLED?.trim().toLowerCase() === "true");
    this.intervalMs = Math.max(10, Math.min(Math.floor(options.intervalMs ?? 60_000), 3_600_000));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  get running(): boolean {
    return this.timer !== undefined;
  }

  async start(): Promise<void> {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, this.intervalMs);
  }

  async tick(now = this.now()): Promise<readonly unknown[]> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      try {
        return await this.options.scheduler.tick(now);
      } catch {
        const error = new Error("cron host tick failed");
        try { await this.options.onError?.(error); } catch { /* host error reporting is isolated */ }
        return [];
      } finally {
        this.inFlight = undefined;
      }
    })();
    return this.inFlight;
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.inFlight;
  }
}
