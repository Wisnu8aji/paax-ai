// paax/web — Replay protocol (KONTRAK 7, gateway/relay.py replay).
//
//   client reconnect → {method:"paax.command", command:"replay",
//                        params:{run_id, after_sequence, task_id?}}
//   → gateway kirim ulang `sequence > after_sequence` (frame _replay:true) →
//   live.
//
// Adaptasi events/replay.ts konsol R1 ke v2. State machine konsumen:
//   idle → replaying → live (atau failed → idle).
// after_sequence dihitung dari event yang sudah diterima (per task atau
// seluruh run). Dedup by event_id.

import type { PaaxEventEnvelope } from './event-contract'
import { makeCommandEnvelope } from './event-contract'

export type ReplayPhase = 'idle' | 'replaying' | 'live' | 'failed'

export interface ReplayState {
  phase: ReplayPhase
  runId: string
  taskId?: string
  afterSequence: number
  received: number
  lastError?: string
  disconnected: boolean
  lastEventAt?: string
}

export const INITIAL_REPLAY_STATE: ReplayState = {
  phase: 'idle',
  runId: '',
  afterSequence: -1,
  received: 0,
  disconnected: false,
}

export function buildReplayCommand(params: {
  runId: string
  afterSequence: number
  taskId?: string
}): ReturnType<typeof makeCommandEnvelope> {
  return makeCommandEnvelope({
    command: 'replay',
    run_id: params.runId,
    task_id: params.taskId ?? null,
    payload: { after_sequence: params.afterSequence },
  })
}

/** Hitung after_sequence dari event yang sudah diterima (per task/run). */
export function computeAfterSequence(
  received: readonly PaaxEventEnvelope[],
  taskId?: string,
): number {
  let max = -1
  for (const e of received) {
    if (taskId !== undefined && e.params.task_id !== taskId) {
      continue
    }
    if (e.params.sequence > max) {
      max = e.params.sequence
    }
  }
  return max
}

export class ReplayCoordinator {
  private state: ReplayState = { ...INITIAL_REPLAY_STATE }
  private seenEventIds = new Set<string>()

  constructor(seedEvents: readonly PaaxEventEnvelope[] = []) {
    for (const e of seedEvents) {
      this.seenEventIds.add(e.params.event_id)
    }
  }

  getState(): ReplayState {
    return { ...this.state }
  }

  onDisconnect(reason?: string): ReplayState {
    this.state = {
      ...this.state,
      phase: this.state.phase === 'live' ? 'replaying' : this.state.phase,
      disconnected: true,
      lastError: reason,
    }
    return this.getState()
  }

  startReplay(params: { runId: string; taskId?: string; received?: readonly PaaxEventEnvelope[] }): ReplayState {
    const received = params.received ?? []
    const afterSequence = computeAfterSequence(received, params.taskId)
    for (const e of received) {
      this.seenEventIds.add(e.params.event_id)
    }
    this.state = {
      phase: 'replaying',
      runId: params.runId,
      taskId: params.taskId,
      afterSequence,
      received: 0,
      disconnected: true,
      lastError: undefined,
      lastEventAt: this.state.lastEventAt,
    }
    return this.getState()
  }

  applyBatch(events: readonly PaaxEventEnvelope[]): ReplayState {
    let received = 0
    let lastAt: string | undefined

    for (const e of events) {
      if (this.seenEventIds.has(e.params.event_id)) {
        continue
      }
      this.seenEventIds.add(e.params.event_id)
      received++
      lastAt = e.params.timestamp
      if (e.params.sequence > this.state.afterSequence) {
        this.state.afterSequence = e.params.sequence
      }
    }

    this.state = {
      ...this.state,
      received: this.state.received + received,
      lastEventAt: lastAt ?? this.state.lastEventAt,
      phase: events.length === 0 ? 'live' : 'replaying',
      disconnected: events.length === 0 ? false : this.state.disconnected,
    }

    return this.getState()
  }

  markLive(): ReplayState {
    this.state = {
      ...this.state,
      phase: 'live',
      disconnected: false,
      lastError: undefined,
    }
    return this.getState()
  }

  fail(error: string): ReplayState {
    this.state = {
      ...this.state,
      phase: 'failed',
      lastError: error,
    }
    return this.getState()
  }

  /** Cek gap: urutan event kontigu per task? */
  static hasSequenceGap(events: readonly PaaxEventEnvelope[], taskId?: string): boolean {
    const seqs = events
      .filter(e => taskId === undefined || e.params.task_id === taskId)
      .map(e => e.params.sequence)
      .sort((a, b) => a - b)

    for (let i = 1; i < seqs.length; i++) {
      if (seqs[i]! - seqs[i - 1]! > 1) {
        return true
      }
    }
    return false
  }
}
