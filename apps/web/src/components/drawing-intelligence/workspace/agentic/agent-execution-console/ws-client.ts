// paax/web — Event transport client v2 (F2 #1, ws-client.ts).
//
// Konsumen event dari gateway F1:
//   1. WebSocket bila endpoint tersedia (`/api/paax/events/ws` pola relay v2);
//   2. SSE bila endpoint tersedia (`/api/paax/events/sse`);
//   3. HTTP replay (`/api/paax/events?run_id=...&after_sequence=...`) untuk
//      reconnect/sinkronisasi (gateway EventLog.replay_after_sequence);
//   4. Demo mode EKSPLISIT (berlabel synthetic:true + notProduction:true) —
//      HANYA untuk test/story; TIDAK pernah menjadi jalur produksi default.
//
// Status integrasi JUJUR: bila gateway belum menyediakan relay WS siap pakai,
// klien melaporkan `transport: 'http-replay'` atau `'demo'` — tidak pernah
// mengklaim live WS tanpa koneksi nyata.

import type { PaaxEventEnvelope } from './event-contract'
import { validatePaaxEvent } from './event-contract'
import { scanRealEvents } from './scan'

export type TransportKind = 'websocket' | 'sse' | 'http-replay' | 'demo' | 'none'

export interface TransportStatus {
  kind: TransportKind
  connected: boolean
  detail: string
  lastError?: string
  web_trace: boolean
}

export interface EventTransportOptions {
  runId: string
  /** endpoint WS; default `/api/paax/events/ws` */
  wsUrl?: string
  /** endpoint SSE; default `/api/paax/events/sse` */
  sseUrl?: string
  /** endpoint HTTP replay; default `/api/paax/events` */
  httpUrl?: string
  /**
   * Token session/auth dari konteks aplikasi (F03_WEBSOCKET_CONTRACT §2.3).
   * Browser tidak bisa set header Authorization pada WebSocket upgrade,
   * jadi token dikirim via subprotocol `paax-auth.<token>` (standar WS) dan
   * query param `access_token` untuk SSE; HTTP replay memakai header
   * `Authorization: Bearer <token>`. Tanpa token & gateway butuh auth →
   * server menutup WS 4001 — status jujur (fail-closed, bukan fallback fake).
   */
  authToken?: string
  /**
   * Task scoping opsional (F03_WEBSOCKET_CONTRACT §5.2). Bila diisi, client
   * hanya meneruskan event untuk task tersebut dan command replay membawa
   * task_id.
   */
  taskId?: string | null
  onEvent: (event: PaaxEventEnvelope) => void
  onStatus: (status: TransportStatus) => void
  /** Setelah reconnect, kirim command replay after_sequence (gateway relay). */
  onReplayRequest?: (afterSequence: number) => void
  /** demo mode hanya bila caller eksplisit mengaktifkan (story/test). */
  demoEvents?: PaaxEventEnvelope[]
  /** interval reconnect (ms). */
  reconnectMs?: number
}

export type CommandName = 'stop' | 'pause' | 'resume' | 'approve' | 'replay' | 'clarify.respond'

export interface PaaxCommand {
  command: CommandName
  runId: string
  taskId?: string | null
  payload?: Record<string, unknown>
}

function normalizeUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const root = base.endsWith('/') ? base.slice(0, -1) : base
  return `${root}${path.startsWith('/') ? path : `/${path}`}`
}

export class PaaxEventClient {
  private options: EventTransportOptions
  private ws: WebSocket | null = null
  private es: EventSource | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private lastSequence = -1
  private validLiveEventReceived = false
  private status: TransportStatus = { kind: 'none', connected: false, detail: 'idle', web_trace: false }

  constructor(options: EventTransportOptions) {
    this.options = options
  }

  getStatus(): TransportStatus {
    return { ...this.status }
  }

  start(): void {
    this.stopped = false
    const { runId, wsUrl, sseUrl, httpUrl } = this.options

    // Demo mode eksplisit (fixture berlabel) — hanya bila caller menyediakan
    // demoEvents dan tidak ada endpoint nyata yang bisa dicoba.
    if (this.options.demoEvents && this.options.demoEvents.length > 0) {
      this.setStatus({ kind: 'demo', connected: true, detail: 'demo fixture (synthetic:true, notProduction:true)' })
      // Replay semua event demo via reducer (deterministik; bukan timer fake).
      for (const ev of this.options.demoEvents) {
        this.deliver(ev)
      }
      return
    }

    // 1) WebSocket bila tersedia.
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    if (wsUrl && typeof WebSocket !== 'undefined') {
      try {
        const url = normalizeUrl(base, wsUrl)
        // Auth via subprotocol WS (F03 §2.3) — browser tidak mengizinkan
        // header Authorization pada upgrade; `paax-auth.<token>` adalah
        // pola standar WebSocket.
        const protocols = this.options.authToken ? [`paax-auth.${this.options.authToken}`] : undefined
        const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url)
        this.ws = ws
        this.setStatus({ kind: 'websocket', connected: false, detail: `connecting ${url}${this.options.authToken ? ' (auth)' : ''}` })
        ws.onopen = () => {
          if (this.stopped) return
          this.setStatus({ kind: 'websocket', connected: true, detail: `live ${url}${this.options.authToken ? ' (auth)' : ''}` })
          // F03 §4.1 — setelah handshake, client meminta replay
          // after_sequence via paax.command replay (bukan hanya callback).
          this.sendCommand({
            command: 'replay',
            runId: this.options.runId,
            taskId: this.options.taskId ?? null,
            payload: { after_sequence: this.lastSequence },
          })
          this.options.onReplayRequest?.(this.lastSequence)
        }
        ws.onmessage = (msg) => {
          try {
            const raw = JSON.parse(String(msg.data)) as unknown
            const env = raw as PaaxEventEnvelope
            if (env?.method === 'paax.event') {
              this.deliver(env)
            }
          } catch {
            this.setStatus({ kind: 'websocket', connected: this.ws?.readyState === WebSocket.OPEN, detail: 'parse error', lastError: 'invalid frame' })
          }
        }
        ws.onclose = (ev) => {
          if (this.stopped) return
          // Kode 4001 = auth ditolak gateway (F03 §2.3) — fail-closed jujur.
          const authDenied = ev.code === 4001
          this.setStatus({
            kind: 'websocket',
            connected: false,
            detail: authDenied ? 'auth ditolak gateway (4001) — token invalid/absent' : 'disconnected — replay after_sequence',
            lastError: authDenied ? 'ws auth denied 4001' : 'ws closed',
          })
          this.scheduleReconnect()
        }
        ws.onerror = () => {
          this.setStatus({ kind: 'websocket', connected: false, detail: 'ws error', lastError: 'ws error' })
        }
        return
      } catch {
        // lanjut SSE/HTTP
      }
    }

    // 2) SSE bila tersedia.
    if (sseUrl && typeof EventSource !== 'undefined') {
      try {
        const authQuery = this.options.authToken ? `&access_token=${encodeURIComponent(this.options.authToken)}` : ''
        const taskQuery = this.options.taskId ? `&task_id=${encodeURIComponent(this.options.taskId)}` : ''
        const url = normalizeUrl(base, `${sseUrl}?run_id=${encodeURIComponent(runId)}${authQuery}${taskQuery}`)
        const es = new EventSource(url)
        this.es = es
        this.setStatus({ kind: 'sse', connected: false, detail: `connecting ${url}` })
        es.onopen = () => {
          if (this.stopped) return
          this.setStatus({ kind: 'sse', connected: true, detail: `live ${url}` })
          this.options.onReplayRequest?.(this.lastSequence)
        }
        es.onmessage = (msg) => {
          try {
            const raw = JSON.parse(String(msg.data)) as unknown
            const env = raw as PaaxEventEnvelope
            if (env?.method === 'paax.event') {
              this.deliver(env)
            }
          } catch {
            // skip frame invalid
          }
        }
        es.onerror = () => {
          if (this.stopped) return
          this.setStatus({ kind: 'sse', connected: false, detail: 'sse error — replay', lastError: 'sse error' })
          this.scheduleReconnect()
        }
        return
      } catch {
        // lanjut HTTP
      }
    }

    // 3) HTTP replay (gateway EventLog).
    if (httpUrl) {
      this.setStatus({ kind: 'http-replay', connected: false, detail: 'http replay (gateway event store)' })
      void this.pollHttp()
      return
    }

    // 4) Tidak ada transport — status jujur.
    this.setStatus({
      kind: 'none',
      connected: false,
      detail: 'gateway event transport belum tersedia — konsol menunggu relay v2 F1',
    })
  }

  private async pollHttp(): Promise<void> {
    if (this.stopped) return
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const { runId, httpUrl } = this.options
    if (!httpUrl) return
    const taskQuery = this.options.taskId ? `&task_id=${encodeURIComponent(this.options.taskId)}` : ''
    const url = normalizeUrl(base, `${httpUrl}?run_id=${encodeURIComponent(runId)}&after_sequence=${this.lastSequence}${taskQuery}`)
    try {
      const headers: Record<string, string> = { 'cache-control': 'no-store' }
      if (this.options.authToken) {
        headers['authorization'] = `Bearer ${this.options.authToken}`
      }
      const res = await fetch(url, { cache: 'no-store', headers })
      if (!res.ok) {
        // 401/403 = auth ditolak gateway — fail-closed jujur, bukan fallback fake.
        if (res.status === 401 || res.status === 403) {
          this.setStatus({
            kind: 'http-replay',
            connected: false,
            detail: 'http replay auth ditolak gateway',
            lastError: `HTTP ${res.status}`,
          })
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const raw = (await res.json()) as unknown
      const list = Array.isArray(raw) ? raw : (raw as { events?: unknown[] }).events ?? []
      let delivered = 0
      for (const item of list) {
        const env = item as PaaxEventEnvelope
        if (env?.method === 'paax.event' && validatePaaxEvent(env).valid) {
          this.deliver(env)
          delivered++
        }
      }
      this.setStatus({
        kind: 'http-replay',
        connected: true,
        detail: delivered > 0 ? `http replay +${delivered} events` : 'http replay (up to date)',
      })
    } catch (e) {
      this.setStatus({
        kind: 'http-replay',
        connected: false,
        detail: 'http replay unavailable',
        lastError: e instanceof Error ? e.message : String(e),
      })
    }
  }

  private deliver(event: PaaxEventEnvelope): void {
    // R1: scanRealEvents di jalur deliver produksi (anti-fake gate).
    // scan.ts hanya diimpor di test sebelumnya; sekarang di-wire ke
    // production path. Demo events berlabel synthetic:true lolos lewat
    // scan(jalur demo); produksi menolak synthetic — G2.3.
    if (this.status.kind !== 'demo') {
      const scanResult = scanRealEvents([event])
      if (!scanResult.ok) {
        const detail = scanResult.findings.map(f => `${f.code}:${f.detail ?? f.eventId}`).join('; ')
        console.warn(`[ws-client] scanRealEvents production gate REJECTED event ${event.params.event_id}: ${detail}`)
        this.setStatus({
          kind: this.status.kind,
          connected: this.status.connected,
          web_trace: false,
          detail: `scanRealEvents rejected frame: ${detail}`,
          lastError: `SCAN_REJECT:${event.params.event_id}`,
        })
        return
      }
      this.validLiveEventReceived = true
      this.setStatus({
        kind: this.status.kind,
        connected: true,
        web_trace: true,
        detail: this.status.detail,
      })
    }
    // Task scoping (F03 §5.2): bila client di-bind ke task tertentu, event
    // task lain tidak diteruskan (tetap dihitung sequence agar replay
    // after_sequence konsisten).
    if (this.options.taskId && event.params.task_id !== this.options.taskId) {
      return
    }
    if (event.params.sequence > this.lastSequence) {
      this.lastSequence = event.params.sequence
    }
    this.options.onEvent(event)
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return
    const ms = this.options.reconnectMs ?? 2000
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.stopped) {
        this.start()
      }
    }, ms)
  }

  /** Kirim command (paax.command) via WS bila terhubung. */
  sendCommand(command: PaaxCommand): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'paax.command',
        params: {
          command: command.command,
          run_id: command.runId,
          task_id: command.taskId ?? null,
          payload: command.payload,
        },
      }))
      return true
    }
    return false
  }

  /** F03 §6 — pause runtime task engine. */
  pause(): boolean {
    return this.sendCommand({ command: 'pause', runId: this.options.runId, taskId: this.options.taskId ?? null })
  }

  /** F03 §6 — resume runtime task engine. */
  resume(): boolean {
    return this.sendCommand({ command: 'resume', runId: this.options.runId, taskId: this.options.taskId ?? null })
  }

  /** F03 §6 — graceful shutdown run. */
  stopRun(reason = 'user stop from web console'): boolean {
    return this.sendCommand({
      command: 'stop',
      runId: this.options.runId,
      taskId: this.options.taskId ?? null,
      payload: { reason },
    })
  }

  /** F03 §7 — kirim approval decision (approval_id, decision, rationale). */
  respondApproval(input: {
    approvalId: string
    decision: 'approved' | 'rejected'
    rationale: string
    taskId?: string | null
  }): boolean {
    return this.sendCommand({
      command: 'approve',
      runId: this.options.runId,
      taskId: input.taskId ?? this.options.taskId ?? null,
      payload: {
        approval_id: input.approvalId,
        decision: input.decision,
        rationale: input.rationale,
      },
    })
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.ws) {
      try { this.ws.close() } catch { /* noop */ }
      this.ws = null
    }
    if (this.es) {
      try { this.es.close() } catch { /* noop */ }
      this.es = null
    }
  }

  private setStatus(status: Omit<TransportStatus, 'web_trace'> & { web_trace?: boolean }): void {
    const web_trace = status.web_trace ?? (status.kind !== 'demo' && status.kind !== 'none' && status.connected && this.validLiveEventReceived)
    this.status = { ...status, web_trace }
    this.options.onStatus(this.status)
  }
}
