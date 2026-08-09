// In-memory store for PAAX event gateway local transport.

import type { PaaxEventEnvelope, PaaxCommandEnvelope } from '../../../../components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract'
import { validatePaaxEvent } from '../../../../components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract'
import { scanRealEvents } from '../../../../components/drawing-intelligence/workspace/agentic/agent-execution-console/scan'

const eventStoreMap = new Map<string, PaaxEventEnvelope[]>()
const commandStoreLog: PaaxCommandEnvelope[] = []

export function addGatewayEvent(rawEvent: unknown, options: { allowSynthetic?: boolean } = {}): { ok: boolean; error?: string } {
  const val = validatePaaxEvent(rawEvent)
  if (!val.valid) {
    return { ok: false, error: `Invalid envelope: ${val.issues.map(i => i.code).join(', ')}` }
  }
  const event = rawEvent as PaaxEventEnvelope
  const scan = scanRealEvents([event], options)
  if (!scan.ok) {
    return { ok: false, error: `Scan rejected: ${scan.findings.map(f => f.code).join(', ')}` }
  }
  const runId = event.params.run_id
  const list = eventStoreMap.get(runId) ?? []
  if (list.some(e => e.params.event_id === event.params.event_id)) {
    return { ok: true } // deduplicate
  }
  list.push(event)
  list.sort((a, b) => a.params.sequence - b.params.sequence)
  eventStoreMap.set(runId, list)
  return { ok: true }
}

export function getGatewayEvents(runId: string, afterSequence = -1, taskId?: string | null): PaaxEventEnvelope[] {
  const list = eventStoreMap.get(runId) ?? []
  return list.filter(e => e.params.sequence > afterSequence && (!taskId || e.params.task_id === taskId))
}

export function recordGatewayCommand(cmd: PaaxCommandEnvelope): void {
  commandStoreLog.push(cmd)
}

export function getGatewayCommands(runId?: string): PaaxCommandEnvelope[] {
  if (!runId) return [...commandStoreLog]
  return commandStoreLog.filter(c => c.params.run_id === runId)
}

export function clearGatewayStore(runId?: string): void {
  if (runId) {
    eventStoreMap.delete(runId)
  } else {
    eventStoreMap.clear()
    commandStoreLog.length = 0
  }
}
