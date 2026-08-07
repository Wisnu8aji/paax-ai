// paax/web — Trace mode store (F2 #4) — mode Product/Technical/Evidence.
//
// Adaptasi store/tool-view.ts konsol R1 (mode product|technical) → PAAX
// menambah mode Evidence. Permission gate Technical: hanya role
// owner/auditor atau technicalPermission granted. Reducer murni — di-unit-test.

export type PaaxTraceMode = 'product' | 'technical' | 'evidence'

export interface ModeGateState {
  mode: PaaxTraceMode
  allowedRoles: string[]
  currentRole: string | null
  technicalPermission: 'granted' | 'denied'
  lastDeniedAt?: string
}

export interface ToolViewState {
  mode: PaaxTraceMode
  gate: ModeGateState
  disclosures: Record<string, boolean>
}

export function createToolViewState(): ToolViewState {
  return {
    mode: 'product',
    gate: {
      mode: 'product',
      allowedRoles: ['owner', 'auditor'],
      currentRole: null,
      technicalPermission: 'denied',
    },
    disclosures: {},
  }
}

export function setToolViewMode(state: ToolViewState, mode: PaaxTraceMode): ToolViewState {
  const gate = applyModeToGate(state.gate, mode)
  return { ...state, mode: gate.mode, gate }
}

export function applyModeToGate(gate: ModeGateState, mode: PaaxTraceMode): ModeGateState {
  if (mode === 'technical') {
    const allowed =
      gate.technicalPermission === 'granted' ||
      (gate.currentRole !== null && gate.allowedRoles.includes(gate.currentRole))
    if (!allowed) {
      return { ...gate, mode: 'product', lastDeniedAt: new Date().toISOString() }
    }
  }
  return { ...gate, mode }
}

export function setToolDisclosure(state: ToolViewState, id: string, open: boolean): ToolViewState {
  if (!id) return state
  if (state.disclosures[id] === open) return state
  return { ...state, disclosures: { ...state.disclosures, [id]: open } }
}

export function anyDisclosureOpen(state: ToolViewState, ids: readonly string[]): boolean {
  return ids.some(id => Boolean(state.disclosures[id]))
}
