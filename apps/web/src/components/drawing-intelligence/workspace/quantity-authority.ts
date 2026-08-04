export type QuantitySourceAuthority = 'none' | 'measurement_fact' | 'proposal' | 'review' | 'core_engine';
export type HonestWorkspaceState =
  | 'ready'
  | 'extraction-pending'
  | 'synthesis-pending'
  | 'graph-not-ready'
  | 'evidence-incomplete'
  | 'revision-conflict'
  | 'quantity-blocked'
  | 'core-engine-required';

export function canDisplayFinalQuantity(input: { sourceAuthority: QuantitySourceAuthority }): boolean {
  return input.sourceAuthority === 'core_engine';
}

const MESSAGES: Record<HonestWorkspaceState, string> = {
  ready: 'Quantity authority is available.',
  'extraction-pending': 'Extraction is pending; only source references can be shown.',
  'synthesis-pending': 'Synthesis is pending; project facts are not ready.',
  'graph-not-ready': 'Project graph is not ready.',
  'evidence-incomplete': 'Evidence is incomplete; verify the source drawing before quantity work.',
  'revision-conflict': 'Drawing revisions conflict; select the approved revision before quantity work.',
  'quantity-blocked': 'Quantity is blocked: detected references are not physical quantities.',
  'core-engine-required': 'Core Engine calculation is required for a final quantity.',
};

export function honestStateMessage(state: HonestWorkspaceState): string {
  return MESSAGES[state];
}

export function canHandoffQuantity(input: {
  sourceAuthority: QuantitySourceAuthority;
  status: string;
  unit: string;
}): boolean {
  return input.sourceAuthority === 'core_engine' && input.status === 'verified' && input.unit !== 'ref';
}

// ── Area "perlu konfirmasi" (Master Plan §4.5 — safety net) ─────────────────
//
// Item masuk area ini HANYA jika:
//   (a) tidak ada kode elemen terdeteksi;
//   (b) dimensi tidak tersedia / tidak joinable;
//   (c) konflik antar sumber (tabel ≠ denah);
//   (d) AI confidence rendah / abstain.
// BUKAN "perlu konfirmasi": item berkode jelas tapi belum dihitung
// ("belum dihitung") dan item berdimensi lengkap tapi belum ada bridge
// ("belum didukung") — keduanya status eksplisit, tidak disamakan dengan
// area konfirmasi. UI ini hanya mengklasifikasikan view-model yang sudah
// diproyeksikan backend — TIDAK menghitung angka teknik apa pun.

export interface ConfirmationInput {
  status: string;
  sourceAuthority?: QuantitySourceAuthority;
  technicalCode?: string | null;
  dimensionsDisplay?: string | null;
  /** Sinyal eksplisit dari backend (mis. field needs_confirmation). */
  needsConfirmation?: boolean;
  /** Alasan eksplisit dari backend (mis. field confirmation_reason/blockers). */
  confirmationReason?: string | null;
}

const DIMENSION_PLACEHOLDERS = new Set(['-', 'Belum tersedia', 'belum tersedia', '']);

function hasUsableCode(technicalCode: string | null | undefined): boolean {
  return Boolean(technicalCode && technicalCode.trim().length > 0);
}

function hasUsableDimensions(dimensionsDisplay: string | null | undefined): boolean {
  if (!dimensionsDisplay) return false;
  const value = dimensionsDisplay.trim();
  return value.length > 0 && !DIMENSION_PLACEHOLDERS.has(value);
}

/** True when the item genuinely belongs in the "perlu konfirmasi" area. */
export function isNeedsConfirmation(input: ConfirmationInput): boolean {
  if (input.needsConfirmation === true) return true;
  // Final engine numbers are never confirmation material.
  if (input.sourceAuthority === 'core_engine') return false;
  // Only needs-review/conflict rows can be confirmation material.
  if (input.status !== 'needs-review' && input.status !== 'conflict') return false;
  // Criterion (c): source conflict.
  if (input.status === 'conflict') return true;
  // Criteria (a)+(b): no code or no joinable dimensions.
  if (!hasUsableCode(input.technicalCode) || !hasUsableDimensions(input.dimensionsDisplay)) return true;
  return false;
}

/** Explicit, human-readable reason for every "perlu konfirmasi" item. */
export function confirmationReasonFor(input: ConfirmationInput): string | null {
  if (!isNeedsConfirmation(input)) return null;
  // Backend-provided reason wins — it is the authoritative documented reason.
  if (input.confirmationReason && input.confirmationReason.trim()) {
    return input.confirmationReason;
  }
  const parts: string[] = [];
  if (input.status === 'conflict') {
    parts.push('konflik antar sumber (tabel ≠ denah)');
  }
  if (!hasUsableCode(input.technicalCode)) {
    parts.push('tidak ada kode elemen terdeteksi');
  }
  if (!hasUsableDimensions(input.dimensionsDisplay)) {
    parts.push('dimensi tidak tersedia / tidak joinable');
  }
  if (parts.length === 0) {
    parts.push('AI abstain / confidence rendah');
  }
  return parts.join('; ');
}
