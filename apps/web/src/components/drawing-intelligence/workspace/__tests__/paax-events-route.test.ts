import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../../../../app/api/paax/events/route'

describe('GET /api/paax/events', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('returns 400 when run_id is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/paax/events')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('run_id required')
  })

  it('returns 503 WAITING_DEPENDENCY when GATEWAY_URL is not configured', async () => {
    delete process.env.PAAX_GATEWAY_URL
    delete process.env.PAAX_RUNTIME_URL

    const req = new NextRequest('http://localhost:3000/api/paax/events?run_id=paax:run:test-123')
    const res = await GET(req)
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.detail).toContain('WAITING_DEPENDENCY')
    expect(json.run_id).toBe('paax:run:test-123')
  })

  it('forwards request to gateway and normalizes events to v2 contract with monotonic order and _replay flag', async () => {
    process.env.PAAX_GATEWAY_URL = 'http://gateway.test:8000'

    const mockEvents = [
      {
        jsonrpc: '2.0',
        method: 'paax.event',
        params: {
          event_id: 'paax:evt:test-123:2:12345678',
          run_id: 'paax:run:test-123',
          sequence: 2,
          timestamp: '2026-08-09T00:00:02Z',
          type: 'task.completed',
        },
      },
      {
        jsonrpc: '2.0',
        method: 'paax.event',
        params: {
          event_id: 'paax:evt:test-123:1:12345678',
          run_id: 'paax:run:test-123',
          sequence: 1,
          timestamp: '2026-08-09T00:00:01Z',
          type: 'task.started',
        },
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = input.toString()
      expect(urlStr).toContain('http://gateway.test:8000/events?')
      expect(urlStr).toContain('run_id=paax%3Arun%3Atest-123')
      return new Response(JSON.stringify(mockEvents), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const req = new NextRequest('http://localhost:3000/api/paax/events?run_id=paax:run:test-123&after_sequence=0')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.run_id).toBe('paax:run:test-123')
    expect(json.events.length).toBe(2)
    // Enforced monotonic order: seq 1 before seq 2
    expect(json.events[0].params.sequence).toBe(1)
    expect(json.events[1].params.sequence).toBe(2)
    expect(json.events[0]._replay).toBe(true)
    expect(json.events[1]._replay).toBe(true)
  })
})
