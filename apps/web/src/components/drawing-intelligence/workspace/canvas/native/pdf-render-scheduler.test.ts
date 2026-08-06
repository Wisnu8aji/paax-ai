import { describe, expect, it, vi } from 'vitest';

import { createPdfRenderScheduler } from './pdf-render-scheduler';
import {
  RenderAbortError,
  RenderStaleError,
  type PdfPageMetrics,
  type PdfRenderDelivery,
  type PdfRenderHandle,
  type PdfRenderPool,
  type RenderBaseRequest,
  type RenderCropRequest,
} from './pdf-native-contract';

interface Deferred {
  request: RenderBaseRequest | RenderCropRequest;
  resolve: (delivery: PdfRenderDelivery) => void;
  reject: (error: Error) => void;
  handle: PdfRenderHandle;
}

interface ControlledPool extends PdfRenderPool {
  requests: Array<RenderBaseRequest | RenderCropRequest>;
  deferred: Deferred[];
  /** Simulate a completed render for the i-th submission. */
  resolve(i: number): void;
  /** Simulate a failed render for the i-th submission. */
  reject(i: number, error: Error): void;
  /** Total bitmap.close() calls observed (stale drops must close). */
  closed: number;
}

/** A bitmap whose close() increments the pool's closed counter. */
function trackedBitmap(counter: { value: number }): ImageBitmap {
  return {
    width: 8,
    height: 8,
    close: () => {
      counter.value += 1;
    },
  } as unknown as ImageBitmap;
}

function createControlledPool(): ControlledPool {
  const requests: Array<RenderBaseRequest | RenderCropRequest> = [];
  const deferred: Deferred[] = [];
  const closedCounter = { value: 0 };

  const makeDelivery = (request: RenderBaseRequest | RenderCropRequest): PdfRenderDelivery => {
    const region = 'region' in request
      ? request.region
      : { x: 0, y: 0, width: 100, height: 200 };
    const widthPx = Math.max(1, Math.round(region.width * request.density));
    const heightPx = Math.max(1, Math.round(region.height * request.density));
    const bitmap = trackedBitmap(closedCounter);
    let raw: ImageBitmap | null = bitmap;
    const delivery: PdfRenderDelivery = {
      result: {
        requestId: request.requestId,
        generation: request.generation,
        pageIndex: request.pageIndex,
        region,
        density: request.density,
        widthPx,
        heightPx,
        renderMs: 1,
        estimatedBytes: widthPx * heightPx * 4,
      },
      claim: () => {
        const b = raw;
        raw = null;
        return b;
      },
    };
    const closeIfUnclaimed = () => {
      if (raw) {
        try { raw.close(); } catch { /* noop */ }
        raw = null;
      }
    };
    queueMicrotask(closeIfUnclaimed);
    return delivery;
  };

  const submit = (request: RenderBaseRequest | RenderCropRequest): PdfRenderHandle => {
    requests.push(request);
    const index = requests.length - 1;
    let resolve!: (delivery: PdfRenderDelivery) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<PdfRenderDelivery>((res, rej) => { resolve = res; reject = rej; });
    const handle: PdfRenderHandle = {
      promise,
      cancel: () => reject(new RenderAbortError('pool cancelled')),
    };
    deferred[index] = { request, resolve, reject, handle };
    return handle;
  };

  const pool: ControlledPool = {
    workerCount: 3,
    requests,
    deferred,
    closed: 0,
    open: async () => ({ width: 100, height: 200, numPages: 1 }) as PdfPageMetrics,
    getPageMetrics: async () => ({ width: 100, height: 200, numPages: 1 }) as PdfPageMetrics,
    renderBase: (request: RenderBaseRequest) => submit(request),
    renderCrop: (request: RenderCropRequest) => submit(request),
    closeRun: () => undefined,
    dispose: () => undefined,
    resolve(i: number) {
      const d = deferred[i];
      if (!d) throw new Error(`no deferred ${i}`);
      d.resolve(makeDelivery(d.request));
    },
    reject(i: number, error: Error) {
      const d = deferred[i];
      if (!d) throw new Error(`no deferred ${i}`);
      d.reject(error);
    },
  };
  Object.defineProperty(pool, 'closed', { get: () => closedCounter.value });
  return pool;
}

const baseFirst: RenderBaseRequest = {
  requestId: 'b1', generation: 1, runId: 'run-1', pageIndex: 0,
  density: 2, darkMode: false, priority: 'base-first',
};
const baseUpgrade: RenderBaseRequest = {
  requestId: 'b3', generation: 1, runId: 'run-1', pageIndex: 0,
  density: 4, darkMode: false, priority: 'base-upgrade',
};
const foreground: RenderCropRequest = {
  requestId: 'f1', generation: 1, runId: 'run-1', pageIndex: 0,
  region: { x: 0, y: 0, width: 50, height: 50 }, density: 4, darkMode: false, priority: 'foreground',
};
const prefetch: RenderCropRequest = {
  requestId: 'p2', generation: 1, runId: 'run-1', pageIndex: 0,
  region: { x: 60, y: 0, width: 50, height: 50 }, density: 4, darkMode: false, priority: 'neighbor-prefetch',
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Attach a no-op catch so vitest never sees an unhandled rejection for a
 *  handle the test intentionally leaves pending until dispose. */
const silence = (handle: PdfRenderHandle) => {
  handle.promise.catch(() => undefined);
};

describe('createPdfRenderScheduler', () => {
  it('dispatches strictly by priority: foreground crop beats prefetch even when submitted later', async () => {
    const pool = createControlledPool();
    const scheduler = createPdfRenderScheduler({ pool, maxConcurrent: 1 });
    await scheduler.open('run-1', 0);

    // Background prefetch dispatches first while the slot is free.
    const hP2 = scheduler.submitCrop(prefetch);
    const p2Outcome = hP2.promise.then((d) => d.result.requestId, (e) => `ERR:${e.message}`);
    await flush();
    expect(pool.requests.map((r) => r.requestId)).toEqual(['p2']);

    // More background work queues behind it.
    const hB3 = scheduler.submitBase(baseUpgrade);
    const b3Outcome = hB3.promise.then((d) => d.result.requestId, (e) => `ERR:${e.message}`);
    const hB1 = scheduler.submitBase(baseFirst);
    const b1Outcome = hB1.promise.then((d) => d.result.requestId, (e) => `ERR:${e.message}`);
    await flush();
    expect(pool.requests.map((r) => r.requestId)).toEqual(['p2']);

    // A foreground crop arrives: it preempts the running P2 prefetch and
    // dispatches immediately (latest-wins, P0 > P2).
    const hF1 = scheduler.submitCrop(foreground);
    const f1Outcome = hF1.promise.then((d) => d.result.requestId, (e) => `ERR:${e.message}`);
    await flush();
    expect(pool.requests.map((r) => r.requestId)).toEqual(['p2', 'f1']);

    // Completing the foreground frees the slot → P1 base-first next, then
    // P3 base-upgrade (P2 prefetch was preempted/cancelled).
    pool.resolve(1);
    await flush();
    expect(pool.requests.map((r) => r.requestId)).toEqual(['p2', 'f1', 'b1']);
    pool.resolve(2);
    await flush();
    expect(pool.requests.map((r) => r.requestId)).toEqual(['p2', 'f1', 'b1', 'b3']);
    pool.resolve(3);

    // p2 was preempted by the foreground crop → rejected stale, not committed.
    await expect(Promise.all([p2Outcome, f1Outcome, b1Outcome, b3Outcome])).resolves.toEqual([
      'ERR:Preempted by a higher-priority foreground crop',
      'f1',
      'b1',
      'b3',
    ]);
    scheduler.dispose();
  });

  it('does not let a long FIFO hold the active crop behind background work', async () => {
    const pool = createControlledPool();
    const scheduler = createPdfRenderScheduler({ pool, maxConcurrent: 1 });
    await scheduler.open('run-1', 0);

    // A burst of low-priority background work.
    const burst: PdfRenderHandle[] = [];
    for (let i = 0; i < 8; i += 1) {
      burst.push(scheduler.submitCrop({ ...prefetch, requestId: `p${i}` }));
    }
    burst.forEach(silence);
    const fgLate = scheduler.submitCrop({ ...foreground, requestId: 'fg-late' });
    await flush();

    // The foreground crop submitted last dispatches FIRST.
    expect(pool.requests[0].requestId).toBe('fg-late');
    // Complete the first slot so dispose has no active work; the burst stays
    // queued and is cancelled at dispose.
    pool.resolve(0);
    await fgLate.promise.then(() => undefined, () => undefined);
    scheduler.dispose();
  });

  it('preempts an active P3 base-upgrade when a P0 foreground crop needs the slot', async () => {
    const pool = createControlledPool();
    const scheduler = createPdfRenderScheduler({ pool, maxConcurrent: 1 });
    await scheduler.open('run-1', 0);

    const hUpgrade = scheduler.submitBase(baseUpgrade); // P3 occupies the only slot
    await flush();
    expect(pool.requests.map((r) => r.requestId)).toEqual(['b3']);

    const upgradeOutcome = hUpgrade.promise.then(
      () => 'committed',
      (e: Error) => (e instanceof RenderStaleError ? 'stale' : `ERR:${e.message}`),
    );

    const hForeground = scheduler.submitCrop(foreground); // P0 arrives → preempts P3
    await flush();
    await expect(upgradeOutcome).resolves.toBe('stale');
    expect(pool.requests.map((r) => r.requestId)).toEqual(['b3', 'f1']);
    pool.resolve(1);
    await hForeground.promise.then(() => undefined, () => undefined);
    scheduler.dispose();
  });

  it('keeps at most one foreground crop active per page (newest supersedes)', async () => {
    const pool = createControlledPool();
    const scheduler = createPdfRenderScheduler({ pool, maxConcurrent: 1 });
    await scheduler.open('run-1', 0);

    const hFg1 = scheduler.submitCrop({ ...foreground, requestId: 'fg-1', generation: 1 });
    await flush();
    expect(pool.requests.map((r) => r.requestId)).toEqual(['fg-1']);

    const firstOutcome = hFg1.promise.then(
      () => 'committed',
      (e: Error) => (e instanceof RenderStaleError ? 'stale' : `ERR:${e.message}`),
    );
    // New foreground crop for the SAME page, next generation.
    const hFg2 = scheduler.submitCrop({ ...foreground, requestId: 'fg-2', generation: 2 });
    await flush();
    await expect(firstOutcome).resolves.toBe('stale');
    expect(pool.requests.map((r) => r.requestId)).toEqual(['fg-1', 'fg-2']);
    pool.resolve(1);
    await hFg2.promise.then(() => undefined, () => undefined);
    scheduler.dispose();
  });

  it('drops a stale-generation result and closes its bitmap', async () => {
    const pool = createControlledPool();
    const scheduler = createPdfRenderScheduler({ pool, maxConcurrent: 1 });
    await scheduler.open('run-1', 0);

    const hFg1 = scheduler.submitCrop({ ...foreground, requestId: 'fg-1', generation: 1 });
    await flush();
    const staleOutcome = hFg1.promise.then(
      () => 'committed',
      (e: Error) => (e instanceof RenderStaleError ? 'stale' : `ERR:${e.message}`),
    );
    // A NEWER GENERATION arrives for the same page while fg-1 renders. A
    // prefetch at gen 2 does NOT cancel the active foreground crop, but it
    // bumps the active generation so fg-1's late result cannot commit.
    const hNew = scheduler.submitCrop({ ...prefetch, requestId: 'pf-new', generation: 2 });
    await flush();
    // Resolve the OLD request late: the scheduler must drop it and close its bitmap.
    pool.resolve(0);
    await expect(staleOutcome).resolves.toBe('stale');
    await flush();
    expect(pool.closed).toBeGreaterThan(0);
    // The newer prefetch then dispatches into the freed slot and commits.
    expect(pool.requests.map((r) => r.requestId)).toEqual(['fg-1', 'pf-new']);
    pool.resolve(1);
    await hNew.promise.then(() => undefined, () => undefined);
    scheduler.dispose();
  });

  it('cancels a queued request and rejects its handle', async () => {
    const pool = createControlledPool();
    const scheduler = createPdfRenderScheduler({ pool, maxConcurrent: 1 });
    await scheduler.open('run-1', 0);

    const hUpgrade = scheduler.submitBase(baseUpgrade); // occupies the slot
    const queued = scheduler.submitCrop({ ...prefetch, requestId: 'pq' });
    await flush();
    const outcome = queued.promise.then(
      () => 'committed',
      (e: Error) => (e instanceof RenderAbortError ? 'aborted' : `ERR:${e.message}`),
    );
    queued.cancel();
    await expect(outcome).resolves.toBe('aborted');
    // The cancelled request never reaches the pool.
    expect(pool.requests.some((r) => r.requestId === 'pq')).toBe(false);
    pool.resolve(0);
    await hUpgrade.promise.then(() => undefined, () => undefined);
    scheduler.dispose();
  });

  it('closeRun cancels everything for the run and rejects handles', async () => {
    const pool = createControlledPool();
    const scheduler = createPdfRenderScheduler({ pool, maxConcurrent: 2 });
    await scheduler.open('run-1', 0);

    const h1 = scheduler.submitBase(baseFirst); // dispatches (P1)
    const h2 = scheduler.submitCrop(prefetch); // dispatches (P2)
    const h3 = scheduler.submitBase(baseUpgrade); // queued (P3)
    await flush();
    expect(pool.requests).toHaveLength(2);

    const outcomes = [h1, h2, h3].map((h) =>
      h.promise.then(() => 'committed', (e: Error) => (e instanceof RenderAbortError ? 'aborted' : `ERR:${e.message}`)),
    );
    scheduler.closeRun('run-1');
    const results = await Promise.all(outcomes);
    expect(results).toEqual(['aborted', 'aborted', 'aborted']);
    expect(pool.closed).toBe(0); // no bitmaps produced
    scheduler.dispose();
  });

  it('rejects a request older than the active generation immediately', async () => {
    const pool = createControlledPool();
    const scheduler = createPdfRenderScheduler({ pool, maxConcurrent: 1 });
    await scheduler.open('run-1', 0);

    const hNew = scheduler.submitCrop({ ...foreground, requestId: 'fg-new', generation: 5 });
    await flush();
    const outcome = scheduler.submitCrop({ ...foreground, requestId: 'fg-old', generation: 3 }).promise.then(
      () => 'committed',
      (e: Error) => (e instanceof RenderStaleError ? 'stale' : `ERR:${e.message}`),
    );
    await expect(outcome).resolves.toBe('stale');
    expect(pool.requests.some((r) => r.requestId === 'fg-old')).toBe(false);
    pool.resolve(0);
    await hNew.promise.then(() => undefined, () => undefined);
    scheduler.dispose();
  });

  it('setActivePage drops queued work for non-active pages', async () => {
    const pool = createControlledPool();
    const scheduler = createPdfRenderScheduler({ pool, maxConcurrent: 1 });
    await scheduler.open('run-1', 0);

    const hPg0 = scheduler.submitCrop({ ...prefetch, requestId: 'pg0', pageIndex: 0 });
    const page1 = scheduler.submitCrop({ ...prefetch, requestId: 'pg1', pageIndex: 1, generation: 1 });
    await flush();
    // pg0 occupies the slot; pg1 is queued on page 1.
    const outcome = page1.promise.then(
      () => 'committed',
      (e: Error) => (e instanceof RenderStaleError ? 'stale' : `ERR:${e.message}`),
    );
    scheduler.setActivePage('run-1', 0); // page 0 active → pg1 (page 1) dropped
    await expect(outcome).resolves.toBe('stale');
    pool.resolve(0);
    await hPg0.promise.then(() => undefined, () => undefined);
    scheduler.dispose();
  });
});
