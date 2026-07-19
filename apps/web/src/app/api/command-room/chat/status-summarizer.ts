export interface StatusSummaryScheduler {
  schedule(runId: string, reasoningSnippet: string, onSummary: (summary: string) => void): void;
}

export function createStatusSummaryScheduler(input: {
  enabled: boolean;
  minIntervalMs?: number;
  executor: (reasoningSnippet: string) => Promise<string | null>;
  now?: () => number;
}): StatusSummaryScheduler {
  const lastRunAt = new Map<string, number>();
  const now = input.now ?? Date.now;
  const minIntervalMs = input.minIntervalMs ?? 15_000;
  return {
    schedule(runId, reasoningSnippet, onSummary) {
      if (!input.enabled || !runId || now() - (lastRunAt.get(runId) ?? -Infinity) < minIntervalMs) return;
      lastRunAt.set(runId, now());
      void input.executor(reasoningSnippet).then((summary) => {
        if (summary) onSummary(summary);
      }).catch(() => undefined);
    },
  };
}
