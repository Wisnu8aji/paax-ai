/**
 * index-sync.ts — pure helpers for drawing package index synchronization.
 *
 * Kept free of React/hook dependencies so the retry policy and the UI-safe
 * error mapping can be unit-tested directly. The hook (use-backend-sync) is
 * responsible for single-flight per sync cycle; this module only decides
 * message text and whether a retry is worthwhile.
 */

/** Exponential backoff (ms) between index fetch attempts: 3s → 6s → 12s. */
export const INDEX_RETRY_DELAYS_MS = [3000, 6000, 12000] as const;

export interface IndexFetchOutcome {
  /** UI-safe message (no internal details, no upstream bodies). */
  message: string;
  /** True when the failure is transient (503/5xx/network) and retry is worthwhile. */
  retryable: boolean;
}

/** Status codes that are definitive and must never be retried or masked. */
const DEFINITIVE_STATUSES = new Set([401, 403, 404]);

/** Extract the HTTP status attached by fetchDrawingPackageIndex, or null for network-level failures. */
export function indexErrorStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return null;
}

/**
 * Map a failed index fetch to a UI-safe message and a retry decision.
 *
 * - 401/403 → definitive access error, never retried, never masked.
 * - 404     → run without data (or not yet materialized), never retried.
 * - 503/5xx → transient service failure, retried with backoff.
 * - null    → network-level failure (fetch rejected), retried with backoff.
 */
export function indexFetchErrorMessage(status: number | null, cause?: unknown): IndexFetchOutcome {
  void cause; // intentionally not surfaced to the UI
  if (status !== null) {
    if (status === 401 || status === 403) {
      return { message: 'Tidak punya akses ke drawing index.', retryable: false };
    }
    if (status === 404) {
      return { message: 'Drawing index belum tersedia untuk run ini.', retryable: false };
    }
    if (status === 503) {
      return { message: 'Layanan drawing index sedang tidak tersedia. Mencoba lagi...', retryable: true };
    }
    if (status >= 500) {
      return { message: 'Layanan drawing index sedang bermasalah. Mencoba lagi...', retryable: true };
    }
  }
  return { message: 'Gagal menghubungi layanan drawing index. Mencoba lagi...', retryable: true };
}

/** True only for transient failures that deserve a backoff retry. */
export function shouldRetryIndexFetch(status: number | null): boolean {
  return status === null || !DEFINITIVE_STATUSES.has(status);
}
