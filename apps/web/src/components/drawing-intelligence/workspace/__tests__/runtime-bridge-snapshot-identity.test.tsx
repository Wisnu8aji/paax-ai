// @vitest-environment jsdom
//
// paax/web — runtime-bridge snapshot identity regression (P1-1, MP3-P2 rev1).
//
// SIRIUS P1-1: getRuntimeTransport() returned a fresh spread object
// ({...bridgeState.transport}) as useSyncExternalStore getSnapshot → snapshot
// identity changed every render → infinite re-render loop ("Maximum update
// depth exceeded") → console (demo AND live) and Quantities dock could not
// render. Fix: return the stable bridgeState.transport reference.
//
// These tests lock the fix at both levels:
//   1. unit — getSnapshot returns a stable reference between notifies;
//   2. integration — the live path (no demoEvents) renders the console shell.

import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  getRuntimeTransport,
  startRuntimeBridge,
  stopRuntimeBridge,
} from '../agentic/agent-execution-console/runtime-bridge'
import { AgentExecutionConsole } from '../agentic/agent-execution-console'

afterEach(() => {
  stopRuntimeBridge()
})

describe('runtime-bridge snapshot identity (P1-1 regression)', () => {
  it('getRuntimeTransport returns a stable reference across calls', () => {
    const a = getRuntimeTransport()
    const b = getRuntimeTransport()
    expect(b).toBe(a) // identity stable → useSyncExternalStore sees no change
    expect(a.kind).toBe('none')
    expect(a.connected).toBe(false)
  })

  it('live path (no demoEvents) renders without infinite render loop', () => {
    expect(() =>
      render(<AgentExecutionConsole runId="paax:run:live-probe" />),
    ).not.toThrow()
    expect(screen.getByTestId('agent-execution-console')).toBeTruthy()
    expect(screen.getByTestId('transport-badge')).toBeTruthy()
  })

  it('bridge start replaces transport identity only when status changes', () => {
    const idle = getRuntimeTransport()
    startRuntimeBridge({ runId: 'paax:run:probe-2' })
    const afterStart = getRuntimeTransport()
    expect(afterStart).not.toBe(idle) // new status object after notify
    expect(afterStart).toBe(getRuntimeTransport()) // …then stable again
  })
})
