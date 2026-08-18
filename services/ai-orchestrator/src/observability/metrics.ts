import { redactText } from "../security/redaction";
import type { RuntimeObservation } from "../agent/monitoring";

export type MetricLabels = Record<string, string | undefined>;

export interface MetricSnapshot {
  name: string;
  labels: Readonly<Record<string, string>>;
  count: number;
  sum: number;
  min: number;
  max: number;
}

interface MetricPoint extends MetricSnapshot {
  labels: Record<string, string>;
}

function labelsFor(input: MetricLabels): Record<string, string> {
  const allowed = new Set(["provider", "transport", "tool", "stopReason", "status", "adapter"]);
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => allowed.has(key) && typeof value === "string" && value.trim()).map(([key, value]) => [key, redactText(value!.trim()).slice(0, 128)]).sort(([left], [right]) => left.localeCompare(right)));
}

export class MetricsRegistry {
  private readonly points = new Map<string, MetricPoint>();
  private readonly maxSeries: number;
  droppedSeries = 0;

  constructor(options: { maxSeries?: number } = {}) {
    this.maxSeries = Math.max(1, Math.min(Math.floor(options.maxSeries ?? 1_000), 10_000));
  }

  increment(name: string, labels: MetricLabels = {}, value = 1): void {
    if (!/^[A-Za-z0-9_.:-]{1,128}$/u.test(name) || !Number.isFinite(value) || value < 0) throw new Error("metric input is invalid");
    const normalized = labelsFor(labels);
    const key = `${name}:${JSON.stringify(normalized)}`;
    let point = this.points.get(key);
    if (!point) {
      if (this.points.size >= this.maxSeries) { this.droppedSeries += 1; return; }
      point = { name, labels: normalized, count: 0, sum: 0, min: value, max: value };
      this.points.set(key, point);
    }
    point.count += 1;
    point.sum += value;
    point.min = Math.min(point.min, value);
    point.max = Math.max(point.max, value);
  }

  observe(name: string, value: number, labels: MetricLabels = {}): void {
    this.increment(name, labels, value);
  }

  snapshot(): readonly MetricSnapshot[] {
    return [...this.points.values()].sort((left, right) => left.name.localeCompare(right.name) || JSON.stringify(left.labels).localeCompare(JSON.stringify(right.labels))).map((point) => ({ ...point, labels: { ...point.labels } }));
  }

  reset(): void {
    this.points.clear();
    this.droppedSeries = 0;
  }
}

/** Compatibility observer that maps lifecycle callbacks to stable bounded series. */
export function createMetricsObservation(metrics: MetricsRegistry): RuntimeObservation {
  return {
    onTurnStarted: () => metrics.increment("turn.started"),
    onTurnFinalized: (data) => {
      metrics.increment("turn.finalized", { status: data.status, stopReason: data.stopReason });
      if (typeof data.usage.totalTokens === "number") metrics.observe("turn.tokens.total", data.usage.totalTokens);
    },
    onTool: (data) => metrics.increment(`tool.${data.event.type.replace("tool.", "")}`, {
      tool: data.event.name,
      status: "status" in data.event ? data.event.status : data.event.type.replace("tool.", ""),
    }),
    onDelivery: (data) => {
      metrics.increment("gateway.stream.delivered", { status: "ok" }, data.delivered);
      metrics.increment("gateway.stream.dropped", { status: "dropped" }, data.dropped);
      if (data.replayed) metrics.increment("gateway.stream.replayed", { status: "replayed" }, data.replayed);
      if (data.duplicates) metrics.increment("gateway.stream.duplicates", { status: "duplicate" }, data.duplicates);
    },
    onBackground: (data) => metrics.increment("cron.background", { status: data.status }),
  };
}
