// paax/web — Runtime bridge (MP3-P2): shared event store + live gateway client.
//
// Menghubungkan web console DAN workspace (Quantities mode) ke SATU instance
// PaaxEventClient (gateway F1 relay v2 — F03_WEBSOCKET_CONTRACT) dengan SATU
// shared PaaxRuntimeStore. Bridge adalah singleton per session:
//   - startRuntimeBridge({runId, ...}) — idempotent per runId; ganti run →
//     stop client lama, start baru; runId kosong → stop (fail-closed idle).
//   - getRuntimeStore() — store bersama (dipakai AgentExecutionConsole live
//     path dan QuantitiesMode / QUANTA panel).
//   - sendRuntimeCommand() — command pause/resume/stop/approve via client
//     aktif; false bila tidak ada koneksi (status jujur disconnected).
//
// Anti-fake (G2.3): semua event produksi melewati scanRealEvents di
// deliver() ws-client; store hanya menerima event yang lolos gate. Jalur demo
// (demoEvents) tetap eksplisit milik konsol — TIDAK lewat bridge ini.

import { useSyncExternalStore } from 'react'
import { PaaxRuntimeStore, resolveRunId, type PaaxRuntimeState } from './event-store'
import { PaaxEventClient, type CommandName, type TransportStatus } from './ws-client'

export interface RuntimeBridgeOptions {
  runId: string | null | undefined
  /** token session/auth (F03 §2.3). */
  authToken?: string
  /** task scoping opsional (F03 §5.2). */
  taskId?: string | null
  wsUrl?: string
  sseUrl?: string
  httpUrl?: string
  reconnectMs?: number
}

interface BridgeState {
  runId: string | null
  transport: TransportStatus
  client: PaaxEventClient | null
  startedAt: number | null
}

const store = new PaaxRuntimeStore()

const bridgeState: BridgeState = {
  runId: null,
  transport: { kind: 'none', connected: false, detail: 'idle', web_trace: false },
  client: null,
  startedAt: null,
}

const statusListeners = new Set<() => void>()

function setTransport(status: TransportStatus): void {
  bridgeState.transport = status
  if (status.kind === 'demo' || status.connected) {
    store.setConnection('connected')
  } else if (status.kind === 'none') {
    store.setConnection('idle')
  } else {
    store.setConnection('disconnected')
  }
  for (const listener of [...statusListeners]) listener()
}

/** Store bersama session — subscribe via useSyncExternalStore. */
export function getRuntimeStore(): PaaxRuntimeStore {
  return store
}

export function getRuntimeState(): PaaxRuntimeState {
  return store.getState()
}

export function getRuntimeTransport(): TransportStatus {
  // NB: return the STABLE reference — useSyncExternalStore getSnapshot must
  // keep identity until setTransport() assigns a new object before notify().
  // A spread here ({...bridgeState.transport}) changes identity every render
  // → infinite re-render loop ("Maximum update depth exceeded").
  return bridgeState.transport
}

export function subscribeRuntimeStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

/** React hook: transport status bridge (useSyncExternalStore). */
export function useRuntimeTransport(): TransportStatus {
  return useSyncExternalStore(subscribeRuntimeStatus, getRuntimeTransport)
}

/**
 * Mulai (atau pertahankan) koneksi gateway untuk satu run. Idempotent:
 * runId sama → no-op; runId berbeda → restart; runId kosong → stop.
 * Endpoint default mengikuti F03_WEBSOCKET_CONTRACT:
 *   WS  /api/paax/events/ws · SSE /api/paax/events/sse · HTTP /api/paax/events
 */
export function startRuntimeBridge(options: RuntimeBridgeOptions): void {
  const runId = options.runId || null
  if (bridgeState.runId && runId && resolveRunId(bridgeState.runId) === resolveRunId(runId) && bridgeState.client) {
    return // sudah ter-bind ke run yang sama
  }
  const previousRunId = bridgeState.runId ?? store.getState().runId
  stopRuntimeBridge()

  if (!runId) {
    store.resetForRun(null)
    setTransport({ kind: 'none', connected: false, detail: 'idle — menunggu run id', web_trace: false })
    return
  }

  if (!previousRunId || resolveRunId(previousRunId) !== resolveRunId(runId)) {
    // Never let a new task/run inherit the previous transcript or task rail.
    store.resetForRun(runId)
  }

  const client = new PaaxEventClient({
    runId,
    wsUrl: options.wsUrl ?? '/api/paax/events/ws',
    sseUrl: options.sseUrl ?? '/api/paax/events/sse',
    httpUrl: options.httpUrl ?? '/api/paax/events',
    authToken: options.authToken,
    taskId: options.taskId ?? null,
    reconnectMs: options.reconnectMs,
    onEvent: (event) => store.ingest(event),
    onStatus: setTransport,
    onReplayRequest: () => store.setConnection('replaying'),
  })

  bridgeState.runId = runId
  bridgeState.client = client
  bridgeState.startedAt = Date.now()
  client.start()
}

/** Hentikan client gateway; the next run binds a fresh session transcript. */
export function stopRuntimeBridge(): void {
  if (bridgeState.client) {
    bridgeState.client.stop()
    bridgeState.client = null
  }
  bridgeState.runId = null
  bridgeState.startedAt = null
  setTransport({ kind: 'none', connected: false, detail: 'idle — bridge stopped', web_trace: false })
}

/** Command ke gateway via client aktif. False → tidak ada koneksi (jujur). */
export function sendRuntimeCommand(command: CommandName, payload?: Record<string, unknown>): boolean {
  const client = bridgeState.client
  const runId = bridgeState.runId
  if (!client || !runId) return false
  return client.sendCommand({ command, runId, payload })
}

/** Approval response via gateway (F03 §7 / APPROVAL_UI_CONTRACT §4.2). */
export function respondRuntimeApproval(input: {
  approvalId: string
  decision: 'approved' | 'rejected'
  rationale: string
  taskId?: string | null
}): boolean {
  const client = bridgeState.client
  const runId = bridgeState.runId
  if (!client || !runId) return false
  return client.respondApproval({ ...input, taskId: input.taskId ?? null })
}

export function isRuntimeBridgeConnected(): boolean {
  return bridgeState.client !== null && bridgeState.transport.connected
}
