// @vitest-environment node
// paax/web — ANTI-FAKE GATE (MP3-P3, G2.3 / Owner §0.15).
//
// Gate produksi: build/CI WAJIB GAGAL bila fixture demo/synthetic di-wire
// ke jalur live. Tiga lapis:
//   1. STATIC import-graph — modul produksi (runtime-bridge, ws-client,
//      event-store, event-contract, scan, index, mode-view, replay) TIDAK
//      boleh mengimpor `demo-events`; `demo-events` hanya boleh dirujuk
//      file test (*.test.ts(x)). Bila ada yang menyambungkan demo ke jalur
//      live → test ini gagal → vitest gagal → production build gate gagal.
//   2. SCAN gate — scanRealEvents (default produksi) MENOLAK seluruh
//      fixture demo (SYNTHETIC_IN_PRODUCTION); assertDemoEvents lolos di
//      jalur demo (allowSynthetic) — kontras membuktikan label jujur.
//   3. LIVE-WIRE simulation — PaaxEventClient tanpa demoEvents (mode live)
//      menolak frame synthetic via deliver() (lastError SCAN_REJECT:...),
//      sedangkan event nyata (synthetic:false) diteruskan ke onEvent.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDemoEvents } from '../agentic/agent-execution-console/demo-events'
import { makeEventEnvelope, type PaaxEventEnvelope } from '../agentic/agent-execution-console/event-contract'
import { assertDemoEvents, assertProductionEvents, scanRealEvents } from '../agentic/agent-execution-console/scan'
import { PaaxEventClient } from '../agentic/agent-execution-console/ws-client'

// ── Lokasi ───────────────────────────────────────────────────────────────────

const CONSOLE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../agentic/agent-execution-console')
const SRC_DIR = resolve(CONSOLE_DIR, '../../..') // .../workspace/drawing-intelligence/... → src root
const WEB_ROOT = resolve(SRC_DIR, '../..') // apps/web

/** Modul jalur PRODUKSI — dilarang mengimpor demo-events. */
const LIVE_MODULES = [
  'runtime-bridge.ts',
  'ws-client.ts',
  'event-store.ts',
  'event-contract.ts',
  'scan.ts',
  'index.tsx',
  'mode-view.ts',
  'replay.ts',
]

function listTsFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'e2e') continue
        walk(full)
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(full)
      }
    }
  }
  walk(root)
  return out
}

// ── 1. STATIC import-graph gate ──────────────────────────────────────────────

describe('anti-fake gate: static import graph (demo/synthetic TIDAK boleh masuk jalur live)', () => {
  it('modul produksi tidak mengimpor demo-events', () => {
    const offenders: string[] = []
    for (const mod of LIVE_MODULES) {
      const src = readFileSync(join(CONSOLE_DIR, mod), 'utf-8')
      // Hanya pernyataan import/require NYATA — komentar/string pesan error
      // yang menyebut "demo-events" (mis. pesan assertDemoEvents) bukan impor.
      const demoImport = src.match(
        /from\s+['"][^'"]*demo-events['"]|require\(\s*['"][^'"]*demo-events['"]\)|import\(\s*['"][^'"]*demo-events['"]\)/,
      )
      if (demoImport) offenders.push(`${mod}: ${demoImport[0]}`)
    }
    expect(offenders, `jalur live mengimpor fixture demo → produksi tercemar:\n${offenders.join('\n')}`)
      .toEqual([])
  })

  it('demo-events hanya dirujuk oleh file test (tidak ada referensi produksi di src/)', () => {
    const files = listTsFiles(SRC_DIR)
    const nonTestRefs: string[] = []
    const testRefs: string[] = []
    for (const file of files) {
      if (relative(file, join(CONSOLE_DIR, 'demo-events.ts')) === '') continue
      const src = readFileSync(file, 'utf-8')
      if (!src.match(/from\s+['"][^'"]*demo-events['"]|require\(\s*['"][^'"]*demo-events['"]\)/)) continue
      const rel = relative(WEB_ROOT, file).replace(/\\/g, '/')
      if (/\.test\.(ts|tsx)$/.test(file)) testRefs.push(rel)
      else nonTestRefs.push(rel)
    }
    expect(testRefs.length, 'tidak ada file test yang memakai demo-events (regresi fixture?)').toBeGreaterThan(0)
    expect(nonTestRefs, `referensi demo-events di luar test → produksi tercemar:\n${nonTestRefs.join('\n')}`)
      .toEqual([])
  })
})

// ── 2. SCAN gate ─────────────────────────────────────────────────────────────

describe('anti-fake gate: scanRealEvents produksi vs jalur demo', () => {
  const demo = buildDemoEvents()

  it('fixture demo DITOLAK jalur produksi (SYNTHETIC_IN_PRODUCTION)', () => {
    const result = scanRealEvents(demo)
    expect(result.ok).toBe(false)
    const codes = new Set(result.findings.map(f => f.code))
    expect(codes.has('SYNTHETIC_IN_PRODUCTION')).toBe(true)
    expect(() => assertProductionEvents(demo, 'demo fixture di jalur produksi')).toThrow(/FAILED/)
  })

  it('fixture demo LOLOS jalur demo (label synthetic+notProduction jujur)', () => {
    expect(() => assertDemoEvents(demo, 'demo fixture jalur demo')).not.toThrow()
  })

  it('event produksi valid (synthetic:false) lolos jalur produksi', () => {
    const real = makeEventEnvelope({
      event_id: 'paax:evt:gate-test:1:00000001',
      run_id: 'paax:run:gate-test',
      sequence: 1,
      timestamp: '2026-08-08T00:00:00.000Z',
      type: 'task.progress',
      task_id: 't1',
      payload_summary: { progress: 0.5, source_authority: 'core_engine' },
    })
    expect(() => assertProductionEvents([real], 'event nyata')).not.toThrow()
  })
})

// ── 3. LIVE-WIRE simulation (behavioral) ─────────────────────────────────────

describe('anti-fake gate: PaaxEventClient live menolak frame synthetic (SCAN_REJECT)', () => {
  const realEvent: PaaxEventEnvelope = makeEventEnvelope({
    event_id: 'paax:evt:gate-test:1:00000002',
    run_id: 'paax:run:gate-test',
    sequence: 1,
    timestamp: '2026-08-08T00:00:01.000Z',
    type: 'task.started',
    task_id: 't1',
    payload_summary: { status: 'running' },
  })
  const demo = buildDemoEvents()
  const demoFrame = demo[0] // synthetic:true + notProduction:true

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mode live (tanpa demoEvents): frame synthetic DITOLAK dengan SCAN_REJECT', () => {
    const onEvent = vi.fn()
    const onStatus = vi.fn()
    const client = new PaaxEventClient({
      // Keep the frame in the same session so this test exercises the
      // synthetic-frame gate rather than the run-isolation filter.
      runId: demoFrame.params.run_id,
      onEvent,
      onStatus,
      httpUrl: '/api/paax/events', // endpoint nyata tidak perlu dijangkau — deliver() langsung
    })
    // White-box: deliver() adalah jalur produksi frame masuk (WS/SSE/HTTP).
    const deliver = (client as unknown as { deliver(ev: PaaxEventEnvelope): void }).deliver
    deliver.call(client, demoFrame)
    expect(onEvent).not.toHaveBeenCalled()
    const status = client.getStatus()
    expect(status.lastError ?? '').toMatch(/^SCAN_REJECT:/)
    expect(status.detail).toMatch(/scanRealEvents rejected frame/)
  })

  it('mode live: event nyata (synthetic:false) diteruskan ke onEvent', () => {
    const onEvent = vi.fn()
    const client = new PaaxEventClient({
      runId: 'paax:run:gate-test',
      onEvent,
      onStatus: vi.fn(),
    })
    const deliver = (client as unknown as { deliver(ev: PaaxEventEnvelope): void }).deliver
    deliver.call(client, realEvent)
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent.mock.calls[0][0].params.event_id).toBe(realEvent.params.event_id)
  })

  it('mode demo (demoEvents eksplisit) tetap berjalan — jalur TEST berlabel', () => {
    const onEvent = vi.fn()
    const client = new PaaxEventClient({
      runId: demoFrame.params.run_id,
      demoEvents: demo,
      onEvent,
      onStatus: vi.fn(),
    })
    client.start()
    const status = client.getStatus()
    expect(status.kind).toBe('demo')
    expect(onEvent).toHaveBeenCalled() // demo replay berjalan di jalur demo saja
  })
})
