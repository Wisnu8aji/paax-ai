// paax/web — PaaxWorkerTree (F2 #3, subagent tree).
//
// Adaptasi delegate-model.ts + subagents store konsol R1 ke event v2.
// Subagent tree dibangun HANYA dari event subagent.started/completed/failed
// (plus agent.*) — deterministik, di-unit-test.

import type { SubagentNode } from '../agent-execution-console/event-store'
import type { PaaxEventEnvelope } from '../agent-execution-console/event-contract'

export interface WorkerNodeLite {
  id: string
  parentId: string | null
  taskId: string | null
  status: 'queued' | 'running' | 'completed' | 'failed'
  model: string | null
  provider: string | null
  startedAt?: string
  completedAt?: string
  toolActivity: string[]
  artifacts: string[]
  children: WorkerNodeLite[]
}

function findNode(nodes: WorkerNodeLite[], id: string): WorkerNodeLite | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const f = findNode(n.children, id)
    if (f) return f
  }
  return null
}

/**
 * Bangun worker/subagent tree dari event log v2. Hanya subagent.* / agent.*
 * yang menciptakan node; tool.* / artifact.created dilampirkan ke node task.
 * Deterministik.
 */
export function buildWorkerTreeV2(events: readonly PaaxEventEnvelope[]): WorkerNodeLite[] {
  const roots: WorkerNodeLite[] = []
  const byTask = new Map<string, WorkerNodeLite>()

  const sorted = [...events].sort((a, b) => {
    const ta = a.params.task_id ?? ''
    const tb = b.params.task_id ?? ''
    if (ta !== tb) return ta < tb ? -1 : 1
    return a.params.sequence - b.params.sequence
  })

  for (const ev of sorted) {
    const p = ev.params
    const type = p.type
    const taskId = p.task_id

    if (type === 'subagent.started' || type === 'agent.started') {
      const id = p.agent_id ?? p.session_id ?? `${type}:${p.sequence}`
      const parentId = (p.payload_summary?.['parent_agent_id'] as string | undefined) ?? null
      const node: WorkerNodeLite = {
        id,
        parentId,
        taskId,
        status: 'running',
        model: p.model,
        provider: p.provider,
        startedAt: p.timestamp,
        toolActivity: [],
        artifacts: [],
        children: [],
      }
      if (parentId) {
        const parent = findNode(roots, parentId)
        if (parent) {
          parent.children.push(node)
        } else {
          roots.push(node)
        }
      } else {
        roots.push(node)
      }
      byTask.set(taskId ?? id, node)
      continue
    }

    if (type === 'subagent.completed' || type === 'agent.completed') {
      const id = p.agent_id ?? p.session_id ?? ''
      const node = findNode(roots, id)
      if (node) {
        node.status = 'completed'
        node.completedAt = p.timestamp
      }
      continue
    }

    if (type === 'subagent.failed' || type === 'agent.failed') {
      const id = p.agent_id ?? p.session_id ?? ''
      const node = findNode(roots, id)
      if (node) {
        node.status = 'failed'
        node.completedAt = p.timestamp
      }
      continue
    }

    // Lampirkan tool activity + artifact ke node task terkait.
    const node = byTask.get(taskId ?? '')
    if (node) {
      if (type === 'tool.started' || type === 'tool.completed' || type === 'command.started' || type === 'command.completed') {
        const tool = (p.payload_summary?.['tool'] as string | undefined) ?? (p.payload_summary?.['command'] as string | undefined)
        if (tool) node.toolActivity.push(`${type}:${tool}`)
      }
      if (type === 'artifact.created') {
        const artifactId = (p.payload_summary?.['artifact_id'] as string | undefined) ?? p.event_id
        node.artifacts.push(artifactId)
      }
    }
  }

  return roots
}

export function subagentCounts(nodes: WorkerNodeLite[]): { total: number; running: number; completed: number; failed: number } {
  let total = 0
  let running = 0
  let completed = 0
  let failed = 0
  const walk = (list: WorkerNodeLite[]) => {
    for (const n of list) {
      total++
      if (n.status === 'running') running++
      if (n.status === 'completed') completed++
      if (n.status === 'failed') failed++
      walk(n.children)
    }
  }
  walk(nodes)
  return { total, running, completed, failed }
}
