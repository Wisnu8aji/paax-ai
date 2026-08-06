/*
 * PAAX native PDF render mock adapter — pdf-render-mock-adapter.ts
 *
 * ORION-F2 deliverable so ORION-F4 can build and test the viewer against the
 * real scheduler API before the final worker/pool path is exercised. The mock
 * adapter is the REAL createPdfRenderScheduler backed by a deterministic fake
 * pool: same priority ordering, same generation guard, same commit rule, same
 * cancellation semantics — only the pixels are fake.
 *
 * F4 integration contract (identical to the real engine):
 *   - scheduler.open(runId, pageIndex) → PdfPageMetrics
 *   - scheduler.submitBase / submitCrop → PdfRenderHandle (resolve = commit,
 *     reject = RenderAbortError | RenderStaleError | injected failure)
 *   - scheduler.setActivePage / closeRun / dispose
 *
 * The mock bitmap is a plain object { width, height, close() } cast to
 * ImageBitmap so component tests can assert commit/close behavior without a
 * real GPU raster. Recorded requests are exposed for test assertions.
 */
import {
  PRIORITY_FOREGROUND,
  RenderStaleError,
  type PdfPageMetrics,
  type PdfRenderDelivery,
  type PdfRenderHandle,
  type PdfRenderPool,
  type PdfRenderScheduler,
  type RenderBaseRequest,
  type RenderCropRequest,
} from './pdf-native-contract';
import { createPdfRenderScheduler } from './pdf-render-scheduler';

export interface MockBitmap {
  width: number;
  height: number;
  close(): void;
  readonly closed: boolean;
  /** Marker so tests can distinguish mock pixels from real ones. */
  readonly __mock: true;
}

export interface PdfRenderMockAdapterOptions {
  /** Simulated render latency for every request (default 0). */
  delayMs?: number;
  /** Simulated page metrics (width/height in PDF points, default 100×200). */
  metrics?: { width: number; height: number; numPages: number };
  /** Auto-commit on submit (default true). When false, F4 drives completion
   *  through `flushPending()` for deterministic ordering tests. */
  autoCommit?: boolean;
  /** Max concurrent renders (defaults to the scheduler default = 3). */
  maxConcurrent?: number;
  /** Fail the next N render submissions (reject with the given error). */
  failNext?: number;
  failWith?: Error;
}

export interface PdfRenderMockAdapter extends PdfRenderScheduler {
  /** Every request the adapter has received, in submit order. */
  readonly requests: ReadonlyArray<RenderBaseRequest | RenderCropRequest>;
  /** Force-complete all pending renders (used with autoCommit: false). */
  flushPending(): Promise<void>;
  /** Latest committed deliveries (claimable bitmaps), in commit order. */
  readonly committed: ReadonlyArray<PdfRenderDelivery>;
  /** Count of bitmaps closed by the mock (stale drops must close). */
  readonly closedBitmaps: () => number;
}

function createMockBitmap(width: number, height: number): MockBitmap {
  let closed = false;
  return {
    width,
    height,
    close() {
      closed = true;
    },
    get closed() {
      return closed;
    },
    __mock: true,
  } as MockBitmap;
}

/**
 * Deterministic fake pool: resolves render requests with fake bitmaps and
 * records everything the scheduler sends. It intentionally bypasses the real
 * worker — F4 can swap the mock adapter for the real scheduler without
 * touching its own integration code.
 */
function createFakePool(options: PdfRenderMockAdapterOptions): {
  pool: PdfRenderPool;
  requests: Array<RenderBaseRequest | RenderCropRequest>;
  committed: PdfRenderDelivery[];
  closedBitmaps: () => number;
  flush: () => Promise<void>;
} {
  const metrics: PdfPageMetrics = options.metrics ?? { width: 100, height: 200, numPages: 1 };
  const delayMs = options.delayMs ?? 0;
  const autoCommit = options.autoCommit ?? true;
  const requests: Array<RenderBaseRequest | RenderCropRequest> = [];
  const committed: PdfRenderDelivery[] = [];
  let failRemaining = options.failNext ?? 0;
  const failWith = options.failWith ?? new Error('mock render failure');
  let closedCount = 0;
  const pendingResolvers: Array<() => void> = [];

  const delay = () => new Promise<void>((resolve) => {
    if (delayMs <= 0) {
      resolve();
      return;
    }
    setTimeout(resolve, delayMs);
  });

  const fakeDeliveryFor = (request: RenderBaseRequest | RenderCropRequest): {
    delivery: PdfRenderDelivery;
    closeIfUnclaimed: () => void;
  } => {
    const region = 'region' in request
      ? request.region
      : { x: 0, y: 0, width: metrics.width, height: metrics.height };
    const widthPx = Math.max(1, Math.round(region.width * request.density));
    const heightPx = Math.max(1, Math.round(region.height * request.density));
    const bitmap = createMockBitmap(widthPx, heightPx) as unknown as ImageBitmap;
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
        try {
          raw.close();
        } catch {
          // already closed
        }
        raw = null;
        closedCount += 1;
      }
    };
    return { delivery, closeIfUnclaimed };
  };

  const render = (request: RenderBaseRequest | RenderCropRequest): PdfRenderHandle => {
    requests.push(request);
    if (failRemaining > 0) {
      failRemaining -= 1;
      return { promise: Promise.reject(failWith), cancel: () => undefined };
    }
    let resolve!: (delivery: PdfRenderDelivery) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<PdfRenderDelivery>((res, rej) => { resolve = res; reject = rej; });
    const finish = async () => {
      await delay();
      const { delivery, closeIfUnclaimed } = fakeDeliveryFor(request);
      committed.push(delivery);
      resolve(delivery);
      // Consumer claim handlers are queued by resolve(); close only if the
      // consumer never claims. MACROTASK, not microtask: with the scheduler
      // in the chain the consumer's claim runs one microtask hop later.
      setTimeout(closeIfUnclaimed, 0);
    };
    if (autoCommit) {
      void finish();
    } else {
      pendingResolvers.push(() => void finish());
    }
    return {
      promise,
      cancel: () => {
        reject(new RenderStaleError('mock render cancelled'));
      },
    };
  };

  const pool: PdfRenderPool = {
    workerCount: 3,
    open: async () => metrics,
    getPageMetrics: async () => metrics,
    renderBase: (request: RenderBaseRequest) => render(request),
    renderCrop: (request: RenderCropRequest) => render(request),
    closeRun: () => undefined,
    dispose: () => undefined,
  };

  const flush = async () => {
    const resolvers = pendingResolvers.splice(0);
    for (const r of resolvers) r();
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs + 1));
  };

  return {
    pool,
    requests,
    committed,
    closedBitmaps: () => closedCount,
    flush,
  };
}

export function createPdfRenderMockAdapter(options: PdfRenderMockAdapterOptions = {}): PdfRenderMockAdapter {
  const fake = createFakePool(options);
  const scheduler = createPdfRenderScheduler({
    pool: fake.pool,
    maxConcurrent: options.maxConcurrent,
  });
  return Object.assign(scheduler, {
    requests: fake.requests,
    committed: fake.committed,
    closedBitmaps: () => fake.closedBitmaps(),
    flushPending: fake.flush,
  }) as unknown as PdfRenderMockAdapter;
}

/** Convenience re-export so F4's mock-only imports share one module. */
export { PRIORITY_FOREGROUND, RenderStaleError };
