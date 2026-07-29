/**
 * index-state.ts — Phase 06 Drawing Package Index state selectors and validators.
 *
 * This module contains pure functions for:
 * - Selecting the current run's index (guards against stale run_id mismatch)
 * - Detecting stale responses
 * - Validating incoming payload with DrawingPackageIndexSchema before committing
 *
 * NO calculations. NO dummy data. NO auto-commit.
 */

import { DrawingPackageIndexSchema } from '@paax/schemas';
import type { DrawingPackageIndex } from '@paax/schemas';

export interface IndexState {
  activeRunId: string | null;
  index: DrawingPackageIndex | null;
  indexError: string | null;
}

/**
 * Returns the stored index only when its run_id matches the activeRunId.
 * A mismatch means the index belongs to a previous run and must not be shown.
 */
export function selectActiveRunIndex(state: IndexState): DrawingPackageIndex | null {
  if (!state.index || !state.activeRunId) return null;
  if (state.index.run_id !== state.activeRunId) return null;
  return state.index;
}

/**
 * Returns true when the incoming run_id does not match the currently active run_id.
 * Stale responses must be discarded without touching the current index.
 */
export function isIndexStale(activeRunId: string, incomingRunId: string): boolean {
  return activeRunId !== incomingRunId;
}

export interface MergeResult {
  index: DrawingPackageIndex | null;
  error: string | null;
}

/**
 * Validates an incoming payload with DrawingPackageIndexSchema, guards against
 * stale run_id, and returns either the new index or the previous one.
 *
 * Rules:
 * - If incoming run_id !== activeRunId → reject as stale, keep prev.
 * - If Zod parse fails → reject as malformed, keep prev.
 * - Otherwise → accept incoming, clear error.
 */
export function validateAndMergeIndex({
  activeRunId,
  prev,
  incoming,
}: {
  activeRunId: string;
  prev: DrawingPackageIndex | null;
  incoming: unknown;
}): MergeResult {
  // Type-narrowing: incoming must be an object with run_id
  const runId =
    incoming !== null &&
    typeof incoming === 'object' &&
    'run_id' in (incoming as object)
      ? (incoming as Record<string, unknown>)['run_id']
      : undefined;

  const cleanRunId = typeof runId === 'string' ? runId.replace(/^run-/, '') : undefined;
  const cleanActiveId = activeRunId.replace(/^run-/, '');

  if (cleanRunId && cleanRunId !== cleanActiveId) {
    return {
      index: prev,
      error: `stale: incoming run_id "${runId}" does not match active run "${activeRunId}"`,
    };
  }

  const result = DrawingPackageIndexSchema.safeParse(incoming);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join('; ');
    return {
      index: prev,
      error: `malformed index: ${msg}`,
    };
  }

  return { index: result.data, error: null };
}
