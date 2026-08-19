export type ContextHealthStatus = "normal" | "warning" | "critical";

export interface ContextUsageSnapshot {
  readonly turnIndex: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly maxTokens: number;
  readonly utilizationPercent: number;
  readonly healthStatus: ContextHealthStatus;
  readonly deltaTokens: number;
  readonly timestamp: string;
}

export interface ContextUsageMeterOptions {
  readonly maxWindowTokens?: number;
  readonly warningThresholdPercent?: number;
  readonly criticalThresholdPercent?: number;
  readonly now?: () => string;
}

export class ContextUsageMeter {
  readonly maxWindowTokens: number;
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;
  private readonly now: () => string;
  private readonly snapshots: ContextUsageSnapshot[] = [];

  constructor(options: ContextUsageMeterOptions = {}) {
    this.maxWindowTokens = options.maxWindowTokens ?? 128_000;
    this.warningThreshold = options.warningThresholdPercent ?? 70;
    this.criticalThreshold = options.criticalThresholdPercent ?? 90;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Records token usage for a turn and returns a usage snapshot.
   */
  recordUsage(input: {
    turnIndex: number;
    promptTokens: number;
    completionTokens: number;
  }): ContextUsageSnapshot {
    const totalTokens = input.promptTokens + input.completionTokens;
    const utilizationPercent = Number(((totalTokens / this.maxWindowTokens) * 100).toFixed(2));

    let healthStatus: ContextHealthStatus = "normal";
    if (utilizationPercent >= this.criticalThreshold) {
      healthStatus = "critical";
    } else if (utilizationPercent >= this.warningThreshold) {
      healthStatus = "warning";
    }

    const previousTotal = this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1].totalTokens
      : 0;
    const deltaTokens = totalTokens - previousTotal;

    const snapshot: ContextUsageSnapshot = {
      turnIndex: input.turnIndex,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens,
      maxTokens: this.maxWindowTokens,
      utilizationPercent,
      healthStatus,
      deltaTokens,
      timestamp: this.now(),
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  getLatestSnapshot(): ContextUsageSnapshot | undefined {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : undefined;
  }

  getHistory(): readonly ContextUsageSnapshot[] {
    return Object.freeze([...this.snapshots]);
  }

  reset(): void {
    this.snapshots.length = 0;
  }

  /**
   * Estimates token count from text using standard ~4 chars per token rule of thumb.
   */
  static estimateTokens(text: string): number {
    if (!text || typeof text !== "string") return 0;
    return Math.ceil(text.length / 4);
  }
}

export function createContextUsageMeter(options?: ContextUsageMeterOptions): ContextUsageMeter {
  return new ContextUsageMeter(options);
}
