/**
 * index-sync.test.ts — ORION-F1 Fase 0: retry policy and UI-safe error
 * mapping for the drawing package index fetch.
 *
 * Acceptance (Execution Instructions F0.5):
 * - 401/403 → definitive access error, never retried, never masked
 * - 404     → run without data, never retried
 * - 503/5xx → transient, retried with exponential backoff 3s → 6s → 12s
 * - network (no status) → transient, retried
 * - messages are UI-safe: no internal details, no upstream response bodies
 */
import { describe, expect, it } from 'vitest';
import {
  INDEX_RETRY_DELAYS_MS,
  indexErrorStatus,
  indexFetchErrorMessage,
  shouldRetryIndexFetch,
} from './index-sync';

describe('index-sync retry policy', () => {
  it('exposes the exponential backoff schedule 3s → 6s → 12s', () => {
    expect(INDEX_RETRY_DELAYS_MS).toEqual([3000, 6000, 12000]);
  });

  it('definitive statuses are never retried: 401, 403, 404', () => {
    expect(shouldRetryIndexFetch(401)).toBe(false);
    expect(shouldRetryIndexFetch(403)).toBe(false);
    expect(shouldRetryIndexFetch(404)).toBe(false);
  });

  it('transient statuses are retried: 503 and any 5xx', () => {
    expect(shouldRetryIndexFetch(503)).toBe(true);
    expect(shouldRetryIndexFetch(500)).toBe(true);
    expect(shouldRetryIndexFetch(502)).toBe(true);
    expect(shouldRetryIndexFetch(504)).toBe(true);
  });

  it('network-level failure (no status) is retried', () => {
    expect(shouldRetryIndexFetch(null)).toBe(true);
  });

  it('any non-5xx unknown status falls back to retryable', () => {
    // e.g. 429 or a non-standard code is safer to retry than to mask.
    expect(shouldRetryIndexFetch(429)).toBe(true);
  });
});

describe('indexErrorStatus extraction', () => {
  it('reads a numeric status from an error-like object', () => {
    expect(indexErrorStatus({ status: 503 })).toBe(503);
  });

  it('returns null when status is not a number', () => {
    expect(indexErrorStatus({ status: 'nope' })).toBeNull();
  });

  it('returns null for plain errors and non-objects', () => {
    expect(indexErrorStatus(new Error('fetch failed'))).toBeNull();
    expect(indexErrorStatus('boom')).toBeNull();
    expect(indexErrorStatus(undefined)).toBeNull();
    expect(indexErrorStatus(null)).toBeNull();
  });
});

describe('indexFetchErrorMessage UI-safe mapping', () => {
  it('401/403 → definitive access message, never retried', () => {
    const outcome = indexFetchErrorMessage(403);
    expect(outcome.retryable).toBe(false);
    expect(outcome.message).toContain('Tidak punya akses');
    expect(outcome.message).not.toContain('upstream');
    expect(outcome.message).not.toContain('traceback');
  });

  it('404 → run-without-data message, never retried', () => {
    const outcome = indexFetchErrorMessage(404);
    expect(outcome.retryable).toBe(false);
    expect(outcome.message).toContain('belum tersedia');
  });

  it('503 → transient service message, retried', () => {
    const outcome = indexFetchErrorMessage(503);
    expect(outcome.retryable).toBe(true);
    expect(outcome.message).toContain('Mencoba lagi');
  });

  it('generic 5xx → transient message, retried', () => {
    const outcome = indexFetchErrorMessage(500);
    expect(outcome.retryable).toBe(true);
    expect(outcome.message).toContain('Mencoba lagi');
  });

  it('network failure → transient message, retried, no internal cause leaked', () => {
    const outcome = indexFetchErrorMessage(null, new Error('ECONNREFUSED 10.0.0.1:8001'));
    expect(outcome.retryable).toBe(true);
    expect(outcome.message).toContain('Gagal menghubungi');
    // The cause (host, port, error text) must never reach the UI.
    expect(outcome.message).not.toContain('ECONNREFUSED');
    expect(outcome.message).not.toContain('10.0.0.1');
  });
});
