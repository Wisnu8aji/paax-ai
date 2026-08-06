/**
 * Document-keyed fit and coverage decisions for the drawing viewer.
 *
 * Every aspect-fit and underlay-coverage decision is a pure function of the
 * active document key (`runId:pageIndex`) and the last accepted records, so a
 * stale callback from a previous sheet can never reinterpret itself as the
 * active document (Task 4 invariants 1–4).
 */

export type FitAspectSource = 'pdf-cache' | 'pdf-metrics' | 'sheet-dimensions';

export interface FitRecord {
  documentKey: string;
  aspect: number;
  source: FitAspectSource;
}

export interface CoverageEvent {
  documentKey: string;
  generation: number;
  ready: boolean;
}

export interface CoverageState {
  documentKey: string;
  generation: number;
  ready: boolean;
}

/** Default tolerance below which two aspects are considered equivalent. */
export const FIT_ASPECT_EPSILON = 0.005;

/** Exact PDF aspects. `sheet-dimensions` is the only provisional source. */
const EXACT_SOURCES: ReadonlySet<FitAspectSource> = new Set(['pdf-cache', 'pdf-metrics']);

export function documentKeyFor(runId: string, pageIndex: number): string {
  return `${runId}:${pageIndex}`;
}

/**
 * Render-time aspect formula (Task 4 C1). The page surface height is computed
 * during render, before any effect can reset `pdfMetrics`. Previous-document
 * metrics must never control even one committed frame of the new document, so
 * PDF metrics are used only when their recorded document key equals the active
 * document key; otherwise the provisional sheet fallback applies.
 */
export function aspectForRender(
  pdfMetrics: { width: number; height: number } | null,
  metricsDocumentKey: string | null,
  activeDocumentKey: string | null,
  fallbackAspect: number,
): number {
  if (pdfMetrics && metricsDocumentKey !== null && metricsDocumentKey === activeDocumentKey) {
    return pdfMetrics.height / pdfMetrics.width;
  }
  return fallbackAspect;
}

/**
 * Render-time underlay formula (Task 4 C2). The thumbnail underlay must be
 * visible in the same commit that activates a document: coverage belonging to
 * any other document (or no document) can never hide it, even when that
 * coverage is `ready:true`.
 */
export function underlayVisibility(coverage: CoverageState | null, activeDocumentKey: string | null): 'hidden' | 'visible' {
  if (!coverage) return 'visible';
  if (activeDocumentKey === null) return 'visible';
  if (coverage.documentKey !== activeDocumentKey) return 'visible';
  return coverage.ready ? 'hidden' : 'visible';
}

/**
 * True when a new fit decision is required for `next`, given the record of the
 * last fit actually applied (`previous`).
 *
 * - A new document always gets its own fit decision.
 * - Equivalent exact metrics for the same document do not refit.
 * - Exact metrics may replace the sheet fallback for the same document.
 * - Exact metrics are never downgraded back to the provisional fallback.
 */
export function shouldApplyFit(previous: FitRecord | null, next: FitRecord, epsilon: number = FIT_ASPECT_EPSILON): boolean {
  if (!previous) return true;
  if (previous.documentKey !== next.documentKey) return true;
  const previousExact = EXACT_SOURCES.has(previous.source);
  const nextExact = EXACT_SOURCES.has(next.source);
  if (nextExact) {
    if (previousExact) {
      const difference = Math.abs(previous.aspect - next.aspect);
      if (!Number.isFinite(difference)) return false;
      return difference > epsilon;
    }
    return true;
  }
  return false;
}

/**
 * Monotonic coverage acceptance keyed by document and generation:
 * - the first event for a document is accepted;
 * - events from a different document are ignored;
 * - older generations of the same document are ignored;
 * - `ready:false` for the current/latest generation reveals the underlay;
 * - matching or newer `ready:true` hides it.
 */
export function nextCoverageState(current: CoverageState | null, event: CoverageEvent): CoverageState | null {
  if (!current) {
    return { documentKey: event.documentKey, generation: event.generation, ready: event.ready };
  }
  if (event.documentKey !== current.documentKey) return current;
  if (event.generation < current.generation) return current;
  return { documentKey: event.documentKey, generation: event.generation, ready: event.ready };
}
