export type ObservabilityBucket = { bucket: string; event_count: number; error_count: number; tokens_in: number; tokens_out: number; cost_microunits: number; latency_ms_total: number };
export type ObservabilitySummary = { project_id: string; buckets: ObservabilityBucket[] };
export async function fetchProjectObservability(projectId: string, fetchImpl: typeof fetch = fetch): Promise<ObservabilitySummary> {
  const response = await fetchImpl(`/api/db-projects/projects/${encodeURIComponent(projectId)}/observability`);
  if (response.status === 401 || response.status === 403) throw new Error("unauthorized");
  if (!response.ok) throw new Error("unavailable");
  return response.json();
}
export function summarizeObservability(buckets: ObservabilityBucket[]) { return buckets.reduce((total, item) => ({ events: total.events + item.event_count, errors: total.errors + item.error_count, tokens: total.tokens + item.tokens_in + item.tokens_out, cost: total.cost + item.cost_microunits, latency: total.latency + item.latency_ms_total }), { events: 0, errors: 0, tokens: 0, cost: 0, latency: 0 }); }
