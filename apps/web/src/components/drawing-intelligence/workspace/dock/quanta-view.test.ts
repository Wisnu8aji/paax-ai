import { describe, expect, it } from 'vitest'
import { makeEventEnvelope } from '../agentic/agent-execution-console/event-contract'
import { selectQuantaFromEvents } from './quanta-view'

function event(sequence: number, type: string) {
  return makeEventEnvelope({
    event_id: `paax:evt:test-quanta:${sequence}:a1b2c3d4`,
    run_id: 'paax:run:test-quanta',
    sequence,
    timestamp: `2026-08-12T00:00:0${sequence}.000Z`,
    type,
  })
}

describe('quanta-view terminal state', () => {
  it('does not report waiting after a completed run produced no rows', () => {
    const selection = selectQuantaFromEvents([
      event(0, 'run.started'),
      event(1, 'task.started'),
      event(2, 'task.completed'),
      event(3, 'run.completed'),
    ])

    expect(selection.ok).toBe(true)
    expect(selection.rows).toHaveLength(0)
    expect(selection.runCompleted).toBe(true)
  })
})
