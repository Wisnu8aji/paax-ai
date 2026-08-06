/*
 * PAAX native PDF render pool — pdf-render-pool.ts
 *
 * Owns worker instances and the document lifecycle for the native render
 * engine. Responsibilities:
 *   - PDF ArrayBuffer single-flight via the existing fetchPdfBinary cache
 *     (task 10): a run's binary is downloaded at most once and shared;
 *   - routes render-base / render-crop to workers round-robin;
 *   - per-request timeout → worker reset → retry once (task 8);
 *   - worker crash detection → reset worker → retry once (DoD 14);
 *   - single-claim bitmap delivery (DoD 17: unused bitmaps always closed).
 *
 * The pool is deliberately transport-only: priority, latest-wins and the
 * commit rule live in pdf-render-scheduler.ts.
 */
import { fetchPdfBinary } from '../pdf-binary-cache';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  RenderAbortError,
  RenderTimeoutError,
  type PdfPageMetrics,
  type PdfRenderDelivery,
  type PdfRenderHandle,
  type PdfRenderPool,
  type PdfRenderPoolOptions,
  type PdfRenderWorker,
  type RenderBaseRequest,
  type RenderCropRequest,
  type RenderResult,
  type RenderWorkerInboundMessage,
  type RenderWorkerOutboundMessage,
} from './pdf-native-contract';

/** Worker count heuristic: prefer hardware-1, clamped 1..3 (mirrors legacy
 *  workerCountFor). Three workers bound memory while keeping base + crop
 *  lanes concurrently serviced. */
export function workerCountFor(hardwareConcurrency: number | undefined): number {
  const available = Math.floor(hardwareConcurrency ?? 2);
  return Math.max(1, Math.min(3, available - 1));
}

function abortError(message = 'PDF render request cancelled'): RenderAbortError {
  return new RenderAbortError(message);
}

/** Single-claim delivery factory (same semantics as PdfTileDelivery). */
function createRenderDelivery(
  result: Omit<RenderResult, 'bitmap'>,
  bitmap: ImageBitmap,
): { delivery: PdfRenderDelivery; closeIfUnclaimed: () => void } {
  let rawBitmap: ImageBitmap | null = bitmap;
  const delivery: PdfRenderDelivery = {
    result,
    claim: () => {
      const b = rawBitmap;
      rawBitmap = null;
      return b;
    },
  };
  const closeIfUnclaimed = () => {
    if (rawBitmap) {
      try {
        rawBitmap.close();
      } catch {
        // Stale or already closed
      }
      rawBitmap = null;
    }
  };
  return { delivery, closeIfUnclaimed };
}

interface DocumentState {
  promise: Promise<PdfPageMetrics>;
  resolve: (metrics: PdfPageMetrics) => void;
  reject: (error: Error) => void;
  runId: string;
  buffer: ArrayBuffer | null;
  metrics: PdfPageMetrics | null;
  readyWorkers: Set<number>;
  pageMetricsCache: Map<string, Promise<PdfPageMetrics>>;
  settled: boolean;
  openedAt: number;
}

interface PendingRender {
  requestId: string;
  runId: string;
  workerIndex: number;
  attempts: number;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  resolve: (delivery: PdfRenderDelivery) => void;
  reject: (error: Error) => void;
  wire: RenderWorkerInboundMessage;
}

interface PendingMetrics {
  requestId: string;
  runId: string;
  pageIndex: number;
  resolve: (metrics: PdfPageMetrics) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  fail: (error: Error) => void;
}

export function createPdfRenderPool(options: PdfRenderPoolOptions = {}): PdfRenderPool {
  const workerCount = workerCountFor(options.hardwareConcurrency);
  const workerFactory = options.workerFactory ?? (() => new Worker(
    new URL('./pdf-render.worker.ts', import.meta.url),
    { type: 'module' },
  ));
  const pdfFetcher = options.pdfFetcher ?? fetchPdfBinary;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const now = options.now ?? Date.now;

  const workers: PdfRenderWorker[] = [];
  const documents = new Map<string, DocumentState>(); // by runId
  const pendingById = new Map<string, PendingRender>();
  const pendingMetricsById = new Map<string, PendingMetrics>();
  let nextRequestId = 1;
  let nextWorker = 0;
  let disposed = false;

  const ensureWorkers = () => {
    while (workers.length < workerCount) {
      const index = workers.length;
      const worker = workerFactory();
      worker.onmessage = (event) => onMessage(index, event.data as RenderWorkerOutboundMessage);
      worker.onerror = (event) => failWorker(index, event.message || 'PDF render worker failed');
      workers.push(worker);
    }
  };

  const discardBitmap = (bitmap: ImageBitmap) => {
    try {
      bitmap.close();
    } catch {
      // Stale results may already have been released by the sender.
    }
  };

  const wireMetricsRequestId = () => {
    const id = `metrics-${nextRequestId}`;
    nextRequestId += 1;
    return id;
  };

  const settlePending = (pending: PendingRender, error: Error) => {
    if (pendingById.get(pending.requestId) !== pending) return;
    if (pending.timeoutHandle !== null) {
      clearTimeout(pending.timeoutHandle);
      pending.timeoutHandle = null;
    }
    pendingById.delete(pending.requestId);
    pending.reject(error);
  };

  const failMetrics = (pendingM: PendingMetrics, error: Error) => {
    if (pendingMetricsById.get(pendingM.requestId) !== pendingM) return;
    pendingMetricsById.delete(pendingM.requestId);
    if (pendingM.timeoutHandle !== null) {
      clearTimeout(pendingM.timeoutHandle);
      pendingM.timeoutHandle = null;
    }
    pendingM.reject(error);
  };

  function pickReadyWorker(doc: DocumentState): number {
    const ready = [...doc.readyWorkers];
    if (ready.length === 0) return nextWorker++ % workers.length;
    return ready[nextWorker++ % ready.length];
  }

  const reissueOnce = (pending: PendingRender, cause: Error) => {
    if (pendingById.get(pending.requestId) !== pending) return;
    if (pending.timeoutHandle !== null) {
      clearTimeout(pending.timeoutHandle);
      pending.timeoutHandle = null;
    }
    if (pending.attempts >= 1) {
      pendingById.delete(pending.requestId);
      pending.reject(cause);
      return;
    }
    pending.attempts += 1;
    const doc = documents.get(pending.runId);
    const targetIndex = doc && doc.readyWorkers.size > 0
      ? pickReadyWorker(doc)
      : nextWorker++ % workers.length;
    if (!workers[targetIndex]) {
      pendingById.delete(pending.requestId);
      pending.reject(cause);
      return;
    }
    pending.workerIndex = targetIndex;
    pending.timeoutHandle = setTimeout(() => timeoutRender(pending), requestTimeoutMs);
    workers[targetIndex].postMessage(pending.wire);
  };

  const timeoutRender = (pending: PendingRender) => {
    if (pendingById.get(pending.requestId) !== pending) return;
    // Cancel on the worker, then reset the worker so a wedged pdf.js task
    // cannot poison subsequent renders, then retry once (task 8).
    try {
      workers[pending.workerIndex]?.postMessage({ type: 'cancel', requestId: pending.requestId } satisfies RenderWorkerInboundMessage);
    } catch {
      // worker may be gone
    }
    resetWorker(pending.workerIndex);
    reissueOnce(pending, new RenderTimeoutError());
  };

  const failWorker = (workerIndex: number, message: string) => {
    if (disposed) return;
    const error = new Error(message);
    const affected = [...pendingById.values()].filter((p) => p.workerIndex === workerIndex);
    for (const doc of documents.values()) {
      doc.readyWorkers.delete(workerIndex);
    }
    resetWorker(workerIndex);
    for (const pending of affected) {
      reissueOnce(pending, error);
    }
  };

  const resetWorker = (workerIndex: number) => {
    const old = workers[workerIndex];
    if (!old) return;
    try {
      old.terminate();
    } catch {
      // already terminated
    }
    // Recreate the worker and re-open every open run on it so it can serve
    // renders again (DoD 14: crash recovery without full reload).
    const worker = workerFactory();
    worker.onmessage = (event) => onMessage(workerIndex, event.data as RenderWorkerOutboundMessage);
    worker.onerror = (event) => failWorker(workerIndex, event.message || 'PDF render worker failed');
    workers[workerIndex] = worker;
    for (const doc of documents.values()) {
      if (doc.buffer) {
        const bufferCopy = doc.buffer.slice(0);
        worker.postMessage(
          { type: 'open-document', runId: doc.runId, data: bufferCopy } satisfies RenderWorkerInboundMessage,
          [bufferCopy],
        );
      }
    }
  };

  const onMessage = (workerIndex: number, message: RenderWorkerOutboundMessage) => {
    if (disposed) {
      if (message.type === 'render-result') discardBitmap(message.bitmap);
      return;
    }
    if (message.type === 'document-ready') {
      const doc = documents.get(message.runId);
      if (!doc) return;
      if (!doc.metrics) {
        doc.metrics = { width: message.width, height: message.height, numPages: message.numPages };
      }
      doc.readyWorkers.add(workerIndex);
      if (!doc.settled && doc.readyWorkers.size === workerCount) {
        doc.settled = true;
        doc.resolve(doc.metrics);
      }
      return;
    }
    if (message.type === 'document-error') {
      const doc = documents.get(message.runId);
      if (doc) {
        documents.delete(message.runId);
        if (!doc.settled) doc.reject(new Error(message.message));
        for (const pending of [...pendingById.values()]) {
          if (pending.runId === message.runId) settlePending(pending, new Error(message.message));
        }
      }
      return;
    }
    if (message.type === 'page-metrics') {
      const pendingM = pendingMetricsById.get(message.requestId);
      if (!pendingM) return;
      pendingMetricsById.delete(pendingM.requestId);
      if (pendingM.timeoutHandle !== null) {
        clearTimeout(pendingM.timeoutHandle);
        pendingM.timeoutHandle = null;
      }
      const doc = documents.get(message.runId);
      pendingM.resolve({
        width: message.width,
        height: message.height,
        numPages: doc?.metrics?.numPages ?? 1,
      });
      return;
    }
    if (message.type === 'page-metrics-error') {
      const pendingM = pendingMetricsById.get(message.requestId);
      if (pendingM) failMetrics(pendingM, new Error(message.message));
      return;
    }
    if (message.type === 'render-result') {
      const pending = pendingById.get(message.requestId);
      if (!pending || pending.runId !== message.runId) {
        discardBitmap(message.bitmap);
        return;
      }
      if (pending.timeoutHandle !== null) {
        clearTimeout(pending.timeoutHandle);
        pending.timeoutHandle = null;
      }
      pendingById.delete(pending.requestId);
      const { delivery, closeIfUnclaimed } = createRenderDelivery(
        {
          requestId: message.requestId,
          generation: 0, // pool is generation-agnostic; the scheduler stamps it
          pageIndex: message.pageIndex,
          region: message.region,
          density: message.density,
          widthPx: message.widthPx,
          heightPx: message.heightPx,
          renderMs: message.renderMs,
          estimatedBytes: message.estimatedBytes,
        },
        message.bitmap,
      );
      pending.resolve(delivery);
      // Close the bitmap only if the consumer never claims it. Must be a
      // MACROTASK (setTimeout 0), not a microtask: with the scheduler in the
      // chain, consumer claim handlers resolve one microtask hop later, and a
      // microtask close would fire before the consumer can claim (DoD 17).
      setTimeout(closeIfUnclaimed, 0);
      return;
    }
    if (message.type === 'render-error') {
      const pending = pendingById.get(message.requestId);
      if (!pending) return;
      if (message.code === 'timeout') {
        // Worker watchdog fired; reset the worker and retry once.
        resetWorker(pending.workerIndex);
        reissueOnce(pending, new RenderTimeoutError(message.message));
        return;
      }
      reissueOnce(pending, new Error(message.message));
      return;
    }
  };

  const postPageMetricsRequest = (
    runId: string,
    pageIndex: number,
    doc: DocumentState,
  ): Promise<PdfPageMetrics> => {
    const cacheKey = `${runId}:${pageIndex}`;
    const cached = doc.pageMetricsCache.get(cacheKey);
    if (cached) return cached;

    const requestId = wireMetricsRequestId();
    let resolve!: (metrics: PdfPageMetrics) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<PdfPageMetrics>((res, rej) => { resolve = res; reject = rej; });
    const pendingM: PendingMetrics = {
      requestId,
      runId,
      pageIndex,
      resolve,
      reject,
      timeoutHandle: null,
      fail: (error: Error) => {
        if (doc.pageMetricsCache.get(cacheKey) === promise) {
          doc.pageMetricsCache.delete(cacheKey);
        }
        failMetrics(pendingM, error);
      },
    };
    pendingM.timeoutHandle = setTimeout(() => {
      pendingM.fail(new RenderTimeoutError('PDF page metrics request timed out'));
    }, requestTimeoutMs);
    pendingMetricsById.set(requestId, pendingM);
    doc.pageMetricsCache.set(cacheKey, promise);
    const target = doc.readyWorkers.size > 0 ? pickReadyWorker(doc) : 0;
    workers[target].postMessage({
      type: 'get-page-metrics',
      requestId,
      runId,
      pageIndex,
    } satisfies RenderWorkerInboundMessage);
    return promise;
  };

  const open = (runId: string, pageIndex: number): Promise<PdfPageMetrics> => {
    if (disposed) return Promise.reject(new Error('PDF render pool disposed'));
    const existing = documents.get(runId);
    if (existing) {
      if (existing.settled) return getPageMetrics(runId, pageIndex);
      return existing.promise.then(() => getPageMetrics(runId, pageIndex));
    }

    ensureWorkers();
    let resolve!: (metrics: PdfPageMetrics) => void;
    let reject!: (error: Error) => void;
    const state: DocumentState = {
      promise: new Promise<PdfPageMetrics>((res, rej) => { resolve = res; reject = rej; }),
      resolve,
      reject,
      runId,
      buffer: null,
      metrics: null,
      readyWorkers: new Set(),
      pageMetricsCache: new Map(),
      settled: false,
      openedAt: now(),
    };
    documents.set(runId, state);

    const promise = (async () => {
      const buffer = await pdfFetcher(runId);
      if (documents.get(runId) !== state) throw abortError('PDF run closed while loading');
      state.buffer = buffer;
      for (const worker of workers) {
        const bufferCopy = buffer.slice(0);
        worker.postMessage(
          { type: 'open-document', runId, data: bufferCopy } satisfies RenderWorkerInboundMessage,
          [bufferCopy],
        );
      }
      // Wait for every worker to confirm the document is ready (metrics
      // agreement) before serving renders.
      await state.promise;
      return getPageMetrics(runId, pageIndex);
    })();

    promise.catch((error: Error) => {
      if (documents.get(runId) === state) {
        documents.delete(runId);
        if (!state.settled) state.reject(error);
      }
    });

    return promise;
  };

  const getPageMetrics = (runId: string, pageIndex: number): Promise<PdfPageMetrics> => {
    if (disposed) return Promise.reject(new Error('PDF render pool disposed'));
    const doc = documents.get(runId);
    if (!doc) return Promise.reject(new Error('PDF document is not open'));
    return postPageMetricsRequest(runId, pageIndex, doc);
  };

  const dispatch = (request: RenderBaseRequest | RenderCropRequest): PdfRenderHandle => {
    if (disposed) {
      return { promise: Promise.reject(new Error('PDF render pool disposed')), cancel: () => undefined };
    }
    const doc = documents.get(request.runId);
    if (!doc || !doc.settled) {
      return { promise: Promise.reject(new Error('PDF document is not open')), cancel: () => undefined };
    }
    // The contract requestId flows onto the wire unchanged: cancellation and
    // the scheduler's commit rule match on it, and the delivery carries the
    // caller's requestId back. Callers must issue unique requestIds.
    const requestId = request.requestId;
    const workerIndex = pickReadyWorker(doc);
    const wire: RenderWorkerInboundMessage =
      request.priority === 'foreground' || request.priority === 'neighbor-prefetch'
        ? {
            type: 'render-crop',
            requestId,
            runId: request.runId,
            pageIndex: request.pageIndex,
            region: (request as RenderCropRequest).region,
            density: request.density,
            darkMode: request.darkMode,
          }
        : {
            type: 'render-base',
            requestId,
            runId: request.runId,
            pageIndex: request.pageIndex,
            density: request.density,
            darkMode: request.darkMode,
          };

    let resolve!: (delivery: PdfRenderDelivery) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<PdfRenderDelivery>((res, rej) => { resolve = res; reject = rej; });
    const pending: PendingRender = {
      requestId,
      runId: request.runId,
      workerIndex,
      attempts: 0,
      timeoutHandle: null,
      resolve,
      reject,
      wire,
    };
    pending.timeoutHandle = setTimeout(() => timeoutRender(pending), requestTimeoutMs);
    pendingById.set(requestId, pending);
    workers[workerIndex].postMessage(wire);

    const cancel = () => {
      if (pendingById.get(requestId) !== pending) return;
      if (pending.timeoutHandle !== null) {
        clearTimeout(pending.timeoutHandle);
        pending.timeoutHandle = null;
      }
      pendingById.delete(requestId);
      try {
        workers[pending.workerIndex]?.postMessage({ type: 'cancel', requestId } satisfies RenderWorkerInboundMessage);
      } catch {
        // worker may be gone
      }
      pending.reject(abortError());
    };
    return { promise, cancel };
  };

  const closeRun = (runId: string) => {
    const error = abortError('PDF run closed');
    for (const pending of [...pendingById.values()]) {
      if (pending.runId === runId) settlePending(pending, error);
    }
    for (const pendingM of [...pendingMetricsById.values()]) {
      if (pendingM.runId === runId) failMetrics(pendingM, error);
    }
    const doc = documents.get(runId);
    if (doc) {
      documents.delete(runId);
      if (!doc.settled) doc.reject(error);
    }
    for (const worker of workers) {
      worker.postMessage({ type: 'close-run', runId } satisfies RenderWorkerInboundMessage);
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const error = abortError('PDF render pool disposed');
    for (const doc of documents.values()) {
      if (!doc.settled) doc.reject(error);
    }
    documents.clear();
    for (const pending of [...pendingById.values()]) {
      settlePending(pending, error);
    }
    for (const pendingM of [...pendingMetricsById.values()]) {
      failMetrics(pendingM, error);
    }
    for (const worker of workers) worker.terminate();
    workers.length = 0;
  };

  return {
    open,
    getPageMetrics,
    renderBase: (request: RenderBaseRequest) => dispatch(request),
    renderCrop: (request: RenderCropRequest) => dispatch(request),
    closeRun,
    dispose,
    workerCount,
  };
}
