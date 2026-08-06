import { describe, expect, it } from 'vitest';

import { createPdfRenderMockAdapter } from './pdf-render-mock-adapter';
import { RenderAbortError, RenderStaleError } from './pdf-native-contract';

const foreground = {
  requestId: 'f1',
  generation: 1,
  runId: 'run-1',
  pageIndex: 0,
  region: { x: 0, y: 0, width: 50, height: 50 },
  density: 2,
  darkMode: false,
  priority: 'foreground' as const,
};

const prefetch = {
  requestId: 'p2',
  generation: 1,
  runId: 'run-1',
  pageIndex: 0,
  region: { x: 60, y: 0, width: 50, height: 50 },
  density: 2,
  darkMode: false,
  priority: 'neighbor-prefetch' as const,
};

const baseFirst = {
  requestId: 'b1',
  generation: 1,
  runId: 'run-1',
  pageIndex: 0,
  density: 1,
  darkMode: false,
  priority: 'base-first' as const,
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createPdfRenderMockAdapter (F4 integration surface)', () => {
  it('opens a run and returns page metrics', async () => {
    const adapter = createPdfRenderMockAdapter();
    const metrics = await adapter.open('run-1', 0);
    expect(metrics).toMatchObject({ width: 100, height: 200, numPages: 1 });
    adapter.dispose();
  });

  it('commits a single request into a claimable mock bitmap', async () => {
    const adapter = createPdfRenderMockAdapter();
    await adapter.open('run-1', 0);
    const handle = adapter.submitCrop(foreground);
    const delivery = await handle.promise;
    expect(delivery.result).toMatchObject({ requestId: 'f1', widthPx: 100, heightPx: 100 });
    const bitmap = delivery.claim();
    expect(bitmap).toBeTruthy();
    expect((bitmap as unknown as { __mock: boolean }).__mock).toBe(true);
    // Second claim is null (single-claim).
    expect(delivery.claim()).toBeNull();
    adapter.dispose();
  });

  it('records every request in submit order', async () => {
    const adapter = createPdfRenderMockAdapter();
    await adapter.open('run-1', 0);
    adapter.submitCrop(prefetch);
    adapter.submitBase(baseFirst);
    adapter.submitCrop(foreground);
    await flush();
    // With default concurrency (3 slots) all requests dispatch immediately in
    // submit order; priority ordering is observable under contention.
    expect(adapter.requests.map((r) => r.requestId)).toEqual(['p2', 'b1', 'f1']);
    adapter.dispose();
  });

  it('applies the same priority ordering as the real scheduler', async () => {
    const adapter = createPdfRenderMockAdapter({ maxConcurrent: 1 });
    await adapter.open('run-1', 0);
    adapter.submitBase(baseFirst); // P1 dispatches first (slot free)
    adapter.submitCrop(prefetch); // queued
    adapter.submitCrop(foreground); // P0 queued; beats prefetch when slot frees
    await flush();
    // b1 committed → f1 (P0) dispatched before p2 (P2).
    expect(adapter.requests.map((r) => r.requestId)).toEqual(['b1', 'f1', 'p2']);
    adapter.dispose();
  });

  it('drops a stale-generation result and closes the mock bitmap', async () => {
    const adapter = createPdfRenderMockAdapter();
    await adapter.open('run-1', 0);
    const fg1 = adapter.submitCrop({ ...foreground, requestId: 'fg-1', generation: 1 });
    // fg-1 will be dropped as stale; keep its rejection handled.
    const fg1Outcome = fg1.promise.then(
      () => 'committed',
      (e: Error) => (e instanceof RenderStaleError ? 'stale' : `ERR:${e.message}`),
    );
    adapter.submitCrop({ ...prefetch, requestId: 'pf-new', generation: 2 });
    await flush();
    // fg-1's late result cannot commit; the adapter rejects it as stale and
    // the mock bitmap is closed (no leak).
    expect(adapter.requests.some((r) => r.requestId === 'fg-1')).toBe(true);
    await expect(fg1Outcome).resolves.toBe('stale');
    await flush();
    expect(adapter.closedBitmaps()).toBeGreaterThan(0);
    adapter.dispose();
  });

  it('cancels a request with RenderAbortError', async () => {
    const adapter = createPdfRenderMockAdapter({ autoCommit: false });
    await adapter.open('run-1', 0);
    const handle = adapter.submitCrop(foreground);
    const outcome = handle.promise.then(
      () => 'committed',
      (e: Error) => (e instanceof RenderAbortError ? 'aborted' : `ERR:${e.message}`),
    );
    handle.cancel();
    await expect(outcome).resolves.toBe('aborted');
    adapter.dispose();
  });

  it('rejects stale requests with RenderStaleError', async () => {
    const adapter = createPdfRenderMockAdapter();
    await adapter.open('run-1', 0);
    adapter.submitCrop({ ...foreground, requestId: 'fg-new', generation: 5 });
    await flush();
    const outcome = adapter.submitCrop({ ...foreground, requestId: 'fg-old', generation: 3 }).promise.then(
      () => 'committed',
      (e: Error) => (e instanceof RenderStaleError ? 'stale' : `ERR:${e.message}`),
    );
    await expect(outcome).resolves.toBe('stale');
    adapter.dispose();
  });

  it('flushPending forces completion when autoCommit is off', async () => {
    const adapter = createPdfRenderMockAdapter({ autoCommit: false });
    await adapter.open('run-1', 0);
    const handle = adapter.submitCrop(foreground);
    let settled = false;
    handle.promise.then(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);
    await adapter.flushPending();
    expect(settled).toBe(true);
    adapter.dispose();
  });

  it('injects failures for the configured number of submissions', async () => {
    const adapter = createPdfRenderMockAdapter({ failNext: 1, failWith: new Error('kaboom') });
    await adapter.open('run-1', 0);
    const first = adapter.submitCrop(foreground).promise.then(
      () => 'committed',
      (e: Error) => `ERR:${e.message}`,
    );
    await expect(first).resolves.toBe('ERR:kaboom');
    const second = adapter.submitCrop({ ...prefetch, requestId: 'p-ok' }).promise.then(
      () => 'committed',
      (e: Error) => `ERR:${e.message}`,
    );
    await expect(second).resolves.toBe('committed');
    adapter.dispose();
  });
});
