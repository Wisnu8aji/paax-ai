/*
 * PAAX PDF viewer native — adaptive memory budget (pure).
 *
 * ORION-F3 ownership (Master Plan PAAX-2026-08-06-review-pdf-viewer-native §5):
 * byte-based LRU with an ADAPTIVE byte budget — never an entry-count cap.
 *
 * Budget classes (Master Plan §5 ORION-F3 task 4):
 *   - device ≤ 4 GB  → 48–64 MB crop cache
 *   - device ~8 GB   → 96–128 MB
 *   - device ≥ 16 GB → 192–256 MB
 *
 * `estimatedBytes = widthPx × heightPx × 4` (RGBA, conservative baseline) is
 * provided here as the cache's byte meter (geometry also re-exports the pixel
 * estimate for callers that have pixel dims directly).
 *
 * PURE module: no DOM access at import time. `deviceMemoryGB` is the only
 * function that touches `navigator`, and it degrades gracefully (returns
 * undefined) in node/jsdom so tests can inject explicit classes.
 */

export interface MemoryBudget {
  /** Device memory class this budget was derived from (GB), if known. */
  readonly deviceMemoryGB?: number;
  /** Hard byte ceiling for the crop cache. */
  readonly maxBytes: number;
  /** Human label for diagnostics ("low" | "mid" | "high" | "unknown"). */
  readonly class: 'low' | 'mid' | 'high' | 'unknown';
}

const MB = 1024 * 1024;

/** Conservative fallback when device memory is unknown: 8 GB class lower bound. */
const UNKNOWN_MEMORY_BUDGET_BYTES = 96 * MB;

/** Device classes as specified by the Master Plan. */
export type MemoryClass = 'low' | 'mid' | 'high';

/** Classify a device memory value (GB) into the Master Plan budget class. */
export function memoryClassFor(deviceMemoryGB: number | undefined): MemoryClass | 'unknown' {
  if (!Number.isFinite(deviceMemoryGB) || deviceMemoryGB === undefined || deviceMemoryGB <= 0) {
    return 'unknown';
  }
  if (deviceMemoryGB <= 4) return 'low';
  if (deviceMemoryGB < 16) return 'mid';
  return 'high';
}

/**
 * Adaptive crop-cache budget in bytes for a device memory class:
 *   low   (≤4 GB)  → 48–64 MB
 *   mid   (~8 GB)  → 96–128 MB
 *   high  (≥16 GB) → 192–256 MB
 *
 * Within each class the budget scales linearly with memory so a 2 GB phone
 * gets a smaller cache than a 4 GB laptop, while never leaving the class band.
 * Unknown memory falls back to the conservative 8 GB lower bound (96 MB).
 */
export function cropCacheBudgetBytes(deviceMemoryGB: number | undefined): number {
  if (!Number.isFinite(deviceMemoryGB) || deviceMemoryGB === undefined || deviceMemoryGB <= 0) {
    return UNKNOWN_MEMORY_BUDGET_BYTES;
  }
  const gb = Math.max(0, deviceMemoryGB);

  // low: ≤4 GB → 48..64 MB (linear in [0,4])
  if (gb <= 4) {
    return Math.round((48 + (gb / 4) * 16) * MB);
  }

  // mid: (4,16) GB → 96..128 MB, linear across the band
  //   at 4 GB  → 96 MB  (band floor)
  //   at 8 GB  → ~107 MB (band center)
  //   at 16 GB → 128 MB (band ceiling)
  if (gb < 16) {
    return Math.round((96 + ((gb - 4) / 12) * 32) * MB);
  }

  // high: ≥16 GB → 192..256 MB (linear in [16, 48], plateau 256 after 48 GB)
  const highGain = Math.min(1, (gb - 16) / 32);
  return Math.round((192 + highGain * 64) * MB);
}

/** Read device memory from the browser, if available. Pure-safe in tests. */
export function deviceMemoryGB(): number | undefined {
  if (typeof navigator === 'undefined' || typeof navigator !== 'object') return undefined;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  return typeof memory === 'number' && Number.isFinite(memory) && memory > 0 ? memory : undefined;
}

/** Convenience: build a MemoryBudget descriptor for a given device memory. */
export function memoryBudgetFor(deviceMemoryGBValue: number | undefined): MemoryBudget {
  const deviceClass = memoryClassFor(deviceMemoryGBValue);
  return {
    deviceMemoryGB: Number.isFinite(deviceMemoryGBValue) && deviceMemoryGBValue !== undefined ? deviceMemoryGBValue : undefined,
    maxBytes: cropCacheBudgetBytes(deviceMemoryGBValue),
    class: deviceClass,
  };
}

/**
 * Byte meter for a cached crop (RGBA baseline): widthPx × heightPx × 4.
 * Used by the cache to account every entry — the byte budget is the ONLY cap.
 */
export function estimatedBytes(widthPx: number, heightPx: number): number {
  if (!(widthPx > 0) || !(heightPx > 0)) return 0;
  return Math.round(widthPx) * Math.round(heightPx) * 4;
}

/** MB → bytes helper for tests and diagnostics. */
export function mbToBytes(mb: number): number {
  return Math.round(mb * MB);
}

export const BUDGET_LOW_MIN_MB = 48;
export const BUDGET_LOW_MAX_MB = 64;
export const BUDGET_MID_MIN_MB = 96;
export const BUDGET_MID_MAX_MB = 128;
export const BUDGET_HIGH_MIN_MB = 192;
export const BUDGET_HIGH_MAX_MB = 256;
