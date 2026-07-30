function meteringConfig(): { dbApiUrl: string; internalKey: string } {
    const dbApiUrl = process.env.DB_API_URL?.trim().replace(/\/$/, '');
    const internalKey = process.env.INTERNAL_SERVICE_KEY?.trim();
    if (!dbApiUrl || !internalKey) {
        throw new Error('Usage metering requires DB_API_URL and INTERNAL_SERVICE_KEY');
    }
    return { dbApiUrl, internalKey };
}

export type UsageEvent = {
    tenantId: string; operation: string; success: boolean; tokensIn?: number; tokensOut?: number;
    latencyMs?: number; cacheHit?: boolean; correlationId?: string; projectId?: string;
    snapshotId?: string; runId?: string; costMicrounits?: number; metadata?: Record<string, number | boolean>;
};

export async function checkQuota(tenantId: string): Promise<{ quota_exceeded: boolean; remaining: number; reset_at?: string | null }> {
    if (process.env.METERING_ENABLED === '0') {
        return { quota_exceeded: false, remaining: 999999 };
    }
    
    try {
        const { dbApiUrl, internalKey } = meteringConfig();
        const res = await fetch(`${dbApiUrl}/usage/quota/check?tenant_id=${tenantId}`, {
            headers: {
                'X-Internal-Key': internalKey,
                'X-User-Id': tenantId
            }
        });
        
        if (res.ok) {
            const data = await res.json();
            return {
                quota_exceeded: data.quota_exceeded,
                remaining: data.remaining
            };
        }
    } catch (e) {
        // Fallback: don't break if db is down
    }
    
    return { quota_exceeded: true, remaining: 0 };
}

export async function logUsage(
    tenantId: string, 
    operation: string, 
    success: boolean, 
    tokensIn?: number, 
    tokensOut?: number, 
    latencyMs?: number, 
    cacheHit: boolean = false
): Promise<void> {
    if (process.env.METERING_ENABLED === '0') {
        return;
    }
    
    try {
        const { dbApiUrl, internalKey } = meteringConfig();
        await fetch(`${dbApiUrl}/usage/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Key': internalKey,
                'X-User-Id': tenantId
            },
            body: JSON.stringify({
                tenant_id: tenantId,
                service: 'ai-orchestrator',
                operation,
                success,
                tokens_in: tokensIn,
                tokens_out: tokensOut,
                latency_ms: latencyMs,
                cache_hit: cacheHit
            })
        });
    } catch (e) {
        // Fire and forget, don't crash
    }
}

/** Contract-aligned, bounded telemetry; never accepts prompt/content/secret text. */
export async function logUsageEvent(event: UsageEvent, fetchImpl: typeof fetch = fetch): Promise<void> {
    if (process.env.METERING_ENABLED === '0') return;
    try {
        const { dbApiUrl, internalKey } = meteringConfig();
        await fetchImpl(`${dbApiUrl}/usage/log`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Key': internalKey, 'X-User-Id': event.tenantId },
            body: JSON.stringify({
                tenant_id: event.tenantId, service: 'ai-orchestrator', operation: event.operation, success: event.success,
                tokens_in: event.tokensIn, tokens_out: event.tokensOut, latency_ms: event.latencyMs,
                cache_hit: event.cacheHit ?? false, correlation_id: event.correlationId, project_id: event.projectId,
                snapshot_id: event.snapshotId, run_id: event.runId, cost_microunits: event.costMicrounits,
                event_type: 'usage', status: event.success ? 'completed' : 'failed', metadata: event.metadata ?? {},
            }),
        });
    } catch { /* telemetry is non-critical */ }
}
