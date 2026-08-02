import type { PdfTileRequest } from './pdf-tile-pyramid';

export interface PdfTileWorker {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface PdfPageMetrics {
  width: number;
  height: number;
  rotation: number;
}

export interface OpenPdfTileDocument {
  documentKey: string;
  pageNumber?: number;
  /** Binary ArrayBuffer payload of the original PDF; never a URL. */
  data: ArrayBuffer;
}

export interface PdfTileRenderRequest {
  documentKey: string;
  pageNumber: number;
  tile: PdfTileRequest;
}

export interface PdfTileDelivery {
  readonly width: number;
  readonly height: number;
  /**
   * First synchronous claim returns the bitmap; every subsequent claim returns null.
   * Consumers must call claim() synchronously within their promise resolution handler.
   */
  claim(): ImageBitmap | null;
}

export interface PdfTileRequestHandle {
  promise: Promise<PdfTileDelivery>;
  cancel(): void;
}

export interface PdfTilePoolOptions {
  hardwareConcurrency?: number;
  workerFactory?: () => PdfTileWorker;
  now?: () => number;
  requestTimeoutMs?: number;
}

/** Default bounded deadline for every tile and page-metrics request. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface DocumentState {
  promise: Promise<PdfPageMetrics>;
  resolve: (metrics: PdfPageMetrics) => void;
  reject: (error: Error) => void;
  readyWorkers: Set<number>;
  metrics: PdfPageMetrics | null;
  pageMetricsCache: Map<string, Promise<PdfPageMetrics>>;
  openedAt: number;
  settled: boolean;
}

interface Consumer {
  resolve: (delivery: PdfTileDelivery) => void;
  reject: (error: Error) => void;
}

interface PendingTile {
  requestId: number;
  key: string;
  documentKey: string;
  worker: PdfTileWorker;
  consumers: Map<number, Consumer>;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

interface PendingMetrics {
  requestId: number;
  documentKey: string;
  pageNumber: number;
  resolve: (metrics: PdfPageMetrics) => void;
  /** Settles the promise and evicts the exact cached entry; safe to call once. */
  fail: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

type WorkerMessage =
  | { type: 'document-ready'; documentKey: string; metrics: PdfPageMetrics; numPages?: number }
  | { type: 'document-error'; documentKey: string; message: string }
  | { type: 'page-metrics'; requestId: number; documentKey: string; pageNumber: number; metrics: PdfPageMetrics }
  | { type: 'page-metrics-error'; requestId: number; documentKey: string; message: string }
  | { type: 'tile'; requestId: number; documentKey: string; width: number; height: number; bitmap: ImageBitmap }
  | { type: 'tile-error'; requestId: number; documentKey: string; message: string };

function abortError(): Error {
  const error = new Error('PDF tile request cancelled');
  error.name = 'AbortError';
  return error;
}

function extractRunId(documentKey: string): string {
  const idx = documentKey.indexOf(':');
  return idx !== -1 ? documentKey.substring(0, idx) : documentKey;
}

function metricsCacheKey(documentKey: string, pageNumber: number): string {
  return `${documentKey}:${pageNumber}`;
}

export function workerCountFor(hardwareConcurrency: number | undefined): number {
  const available = Math.floor(hardwareConcurrency ?? 2);
  return Math.max(1, Math.min(3, available - 1));
}

function createPdfTileDelivery(
  width: number,
  height: number,
  bitmap: ImageBitmap,
): { delivery: PdfTileDelivery; closeIfUnclaimed: () => void } {
  let rawBitmap: ImageBitmap | null = bitmap;
  const delivery: PdfTileDelivery = {
    width,
    height,
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

/**
 * Owns worker instances and PDF document lifecycle.
 * PDF documents are loaded once per runId across all workers.
 * Multi-page rendering and metrics retrieval do NOT re-open or re-parse the PDF.
 */
export function createPdfTilePool(options: PdfTilePoolOptions = {}) {
  const workerCount = workerCountFor(options.hardwareConcurrency);
  const workerFactory = options.workerFactory ?? (() => new Worker(
    new URL('./pdf-tile.worker.ts', import.meta.url),
    { type: 'module' },
  ));
  const now = options.now ?? Date.now;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const workers: PdfTileWorker[] = [];
  const documents = new Map<string, DocumentState>();
  const runBuffers = new Map<string, ArrayBuffer>();
  const pendingById = new Map<number, PendingTile>();
  const pendingByKey = new Map<string, PendingTile>();
  const pendingMetricsById = new Map<number, PendingMetrics>();
  let nextRequestId = 1;
  let nextConsumerId = 1;
  let nextWorker = 0;
  let disposed = false;

  const ensureWorkers = () => {
    while (workers.length < workerCount) {
      const index = workers.length;
      const worker = workerFactory();
      worker.onmessage = (event) => onMessage(index, event.data as WorkerMessage);
      worker.onerror = (event) => failWorker(worker, event.message || 'PDF tile worker failed');
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

  const settlePending = (pending: PendingTile, error: Error) => {
    if (pendingById.get(pending.requestId) !== pending) return;
    if (pending.timeoutHandle !== null) {
      clearTimeout(pending.timeoutHandle);
      pending.timeoutHandle = null;
    }
    pendingById.delete(pending.requestId);
    if (pendingByKey.get(pending.key) === pending) {
      pendingByKey.delete(pending.key);
    }
    for (const consumer of pending.consumers.values()) consumer.reject(error);
    pending.consumers.clear();
  };

  const failWorker = (worker: PdfTileWorker, message: string) => {
    const error = new Error(message);
    for (const document of documents.values()) document.reject(error);
    documents.clear();
    runBuffers.clear();
    for (const pending of [...pendingById.values()]) {
      settlePending(pending, error);
    }
    for (const pendingM of pendingMetricsById.values()) {
      pendingM.fail(error);
    }
    for (const current of workers) current.terminate();
    workers.length = 0;
    nextWorker = 0;
  };

  const getDocState = (documentKey: string): DocumentState | undefined => {
    const runId = extractRunId(documentKey);
    return documents.get(documentKey) ?? documents.get(runId);
  };

  const onMessage = (workerIndex: number, message: WorkerMessage) => {
    if (disposed) {
      if (message.type === 'tile') discardBitmap(message.bitmap);
      return;
    }
    if (message.type === 'document-ready') {
      const document = getDocState(message.documentKey);
      if (!document) return;
      if (!document.metrics) document.metrics = message.metrics;
      const expected = document.metrics;
      document.readyWorkers.add(workerIndex);
      if (document.readyWorkers.size === workerCount) {
        document.settled = true;
        document.resolve(expected);
      }
      return;
    }
    if (message.type === 'document-error') {
      const runId = extractRunId(message.documentKey);
      const document = getDocState(message.documentKey);
      if (document) {
        const error = new Error(message.message);
        documents.delete(message.documentKey);
        documents.delete(runId);
        runBuffers.delete(runId);
        document.reject(error);
        for (const pending of [...pendingById.values()]) {
          if (pending.documentKey === message.documentKey || extractRunId(pending.documentKey) === runId) {
            settlePending(pending, error);
          }
        }
        for (const pendingM of [...pendingMetricsById.values()]) {
          if (pendingM.documentKey === message.documentKey || extractRunId(pendingM.documentKey) === runId) {
            pendingM.fail(error);
          }
        }
        for (const worker of workers) worker.postMessage({ type: 'close-document', documentKey: message.documentKey });
      }
      return;
    }
    if (message.type === 'page-metrics') {
      const pendingM = pendingMetricsById.get(message.requestId);
      if (pendingM) {
        if (pendingM.timeoutHandle !== null) {
          clearTimeout(pendingM.timeoutHandle);
          pendingM.timeoutHandle = null;
        }
        pendingMetricsById.delete(message.requestId);
        pendingM.resolve(message.metrics);
      }
      return;
    }
    if (message.type === 'page-metrics-error') {
      const pendingM = pendingMetricsById.get(message.requestId);
      if (pendingM) pendingM.fail(new Error(message.message));
      return;
    }
    if (message.type === 'tile') {
      const pending = pendingById.get(message.requestId);
      if (!pending || !getDocState(message.documentKey)) {
        discardBitmap(message.bitmap);
        return;
      }
      if (pending.timeoutHandle !== null) {
        clearTimeout(pending.timeoutHandle);
        pending.timeoutHandle = null;
      }
      pendingById.delete(pending.requestId);
      if (pendingByKey.get(pending.key) === pending) {
        pendingByKey.delete(pending.key);
      }

      const { delivery, closeIfUnclaimed } = createPdfTileDelivery(message.width, message.height, message.bitmap);

      for (const consumer of pending.consumers.values()) consumer.resolve(delivery);
      pending.consumers.clear();

      queueMicrotask(closeIfUnclaimed);
      return;
    }
    if (message.type === 'tile-error') {
      const pending = pendingById.get(message.requestId);
      if (pending) settlePending(pending, new Error(message.message));
    }
  };

  const open = (document: OpenPdfTileDocument): Promise<PdfPageMetrics> => {
    if (disposed) return Promise.reject(new Error('PDF tile pool disposed'));

    const runId = extractRunId(document.documentKey);
    const existing = getDocState(document.documentKey);
    const pageNum = document.pageNumber ?? 1;

    if (existing) {
      // Reuse the exact cached promise, or chain a page-metrics request from
      // the exact current run open promise so a second page-open never races
      // the document readiness and never re-opens the PDF.
      return getPageMetrics(document.documentKey, pageNum);
    }

    if (!document.data || !(document.data instanceof ArrayBuffer) || document.data.byteLength === 0) {
      return Promise.reject(new Error('PDF tile pool requires a non-empty ArrayBuffer binary payload'));
    }

    ensureWorkers();
    let resolve!: (metrics: PdfPageMetrics) => void;
    let reject!: (error: Error) => void;
    const state: DocumentState = {
      promise: new Promise<PdfPageMetrics>((res, rej) => { resolve = res; reject = rej; }),
      resolve,
      reject,
      readyWorkers: new Set(),
      metrics: null,
      pageMetricsCache: new Map(),
      openedAt: now(),
      settled: false,
    };
    documents.set(document.documentKey, state);
    documents.set(runId, state);

    if (!runBuffers.has(runId)) {
      runBuffers.set(runId, document.data);
    }

    for (const worker of workers) {
      const bufferCopy = document.data.slice(0);
      worker.postMessage(
        {
          type: 'open-document',
          documentKey: document.documentKey,
          pageNumber: pageNum,
          data: bufferCopy,
        },
        [bufferCopy],
      );
    }

    state.pageMetricsCache.set(metricsCacheKey(document.documentKey, pageNum), state.promise);
    return state.promise;
  };

  const postPageMetricsRequest = (documentKey: string, pageNumber: number): Promise<PdfPageMetrics> => {
    const docState = getDocState(documentKey);
    if (!docState) return Promise.reject(new Error('PDF document is not open'));
    const cacheKey = metricsCacheKey(documentKey, pageNumber);
    const requestId = nextRequestId++;
    let resolve!: (metrics: PdfPageMetrics) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<PdfPageMetrics>((res, rej) => { resolve = res; reject = rej; });

    const pendingM: PendingMetrics = {
      requestId,
      documentKey,
      pageNumber,
      resolve,
      fail: (error: Error) => {
        if (pendingMetricsById.get(requestId) !== pendingM) return;
        pendingMetricsById.delete(requestId);
        if (pendingM.timeoutHandle !== null) {
          clearTimeout(pendingM.timeoutHandle);
          pendingM.timeoutHandle = null;
        }
        // Evict only the exact cached promise still current so reopen can retry.
        if (docState.pageMetricsCache.get(cacheKey) === promise) {
          docState.pageMetricsCache.delete(cacheKey);
        }
        reject(error);
      },
      timeoutHandle: null,
    };
    pendingM.timeoutHandle = setTimeout(() => {
      pendingM.timeoutHandle = null;
      pendingM.fail(new Error('PDF page metrics request timed out'));
    }, requestTimeoutMs);
    pendingMetricsById.set(requestId, pendingM);
    docState.pageMetricsCache.set(cacheKey, promise);
    workers[0].postMessage({
      type: 'get-page-metrics',
      requestId,
      documentKey,
      pageNumber,
    });

    return promise;
  };

  const getPageMetrics = (documentKey: string, pageNumber: number): Promise<PdfPageMetrics> => {
    if (disposed) return Promise.reject(new Error('PDF tile pool disposed'));
    const docState = getDocState(documentKey);
    if (!docState) return Promise.reject(new Error('PDF document is not open'));
    const cacheKey = metricsCacheKey(documentKey, pageNumber);
    const cached = docState.pageMetricsCache.get(cacheKey);
    if (cached) return cached;

    if (!docState.settled) {
      // Never request metrics from a worker before the run's document-open
      // promise is ready; chain from the exact current open promise instead.
      const chained = docState.promise.then(
        () => postPageMetricsRequest(documentKey, pageNumber),
        (error: Error) => Promise.reject(error),
      );
      chained.catch(() => {
        if (docState.pageMetricsCache.get(cacheKey) === chained) {
          docState.pageMetricsCache.delete(cacheKey);
        }
      });
      docState.pageMetricsCache.set(cacheKey, chained);
      return chained;
    }

    return postPageMetricsRequest(documentKey, pageNumber);
  };

  const timeoutTile = (pending: PendingTile) => {
    if (pendingById.get(pending.requestId) !== pending) return;
    pending.timeoutHandle = null;
    pendingById.delete(pending.requestId);
    if (pendingByKey.get(pending.key) === pending) {
      pendingByKey.delete(pending.key);
    }
    // Mark the request cancelled on the worker exactly once; the pool maps are
    // already cleared so a late delivery can only be discarded.
    pending.worker.postMessage({ type: 'cancel', requestId: pending.requestId, documentKey: pending.documentKey });
    const error = new Error('PDF tile request timed out');
    for (const consumer of pending.consumers.values()) consumer.reject(error);
    pending.consumers.clear();
  };

  const request = (requestTile: PdfTileRenderRequest): PdfTileRequestHandle => {
    if (disposed) {
      return { promise: Promise.reject(new Error('PDF tile pool disposed')), cancel: () => undefined };
    }
    if (!getDocState(requestTile.documentKey)) {
      return { promise: Promise.reject(new Error('PDF document is not open')), cancel: () => undefined };
    }
    let pending = pendingByKey.get(requestTile.tile.key);
    if (!pending) {
      const worker = workers[nextWorker++ % workers.length];
      const created: PendingTile = {
        requestId: nextRequestId++,
        key: requestTile.tile.key,
        documentKey: requestTile.documentKey,
        worker,
        consumers: new Map(),
        timeoutHandle: null,
      };
      pending = created;
      pendingById.set(created.requestId, created);
      pendingByKey.set(created.key, created);
      created.timeoutHandle = setTimeout(() => timeoutTile(created), requestTimeoutMs);
      worker.postMessage({
        type: 'render-tile',
        requestId: created.requestId,
        documentKey: requestTile.documentKey,
        pageNumber: requestTile.pageNumber,
        tile: requestTile.tile,
      });
    }
    const consumerId = nextConsumerId++;
    let rejectConsumer!: (error: Error) => void;
    const promise = new Promise<PdfTileDelivery>((resolve, reject) => {
      rejectConsumer = reject;
      pending!.consumers.set(consumerId, { resolve, reject });
    });
    const cancel = () => {
      const active = pending?.consumers.get(consumerId);
      if (!active) return;
      pending?.consumers.delete(consumerId);
      rejectConsumer(abortError());
      if (pending && pending.consumers.size === 0) {
        if (pending.timeoutHandle !== null) {
          clearTimeout(pending.timeoutHandle);
          pending.timeoutHandle = null;
        }
        pendingById.delete(pending.requestId);
        if (pendingByKey.get(pending.key) === pending) {
          pendingByKey.delete(pending.key);
        }
        pending.worker.postMessage({ type: 'cancel', requestId: pending.requestId, documentKey: pending.documentKey });
      }
    };
    return { promise, cancel };
  };

  const close = (documentKey: string) => {
    const runId = extractRunId(documentKey);
    for (const pending of [...pendingById.values()]) {
      if (pending.documentKey === documentKey || extractRunId(pending.documentKey) === runId) {
        pending.worker.postMessage({ type: 'cancel', requestId: pending.requestId, documentKey: pending.documentKey });
        settlePending(pending, abortError());
      }
    }
    for (const pendingM of [...pendingMetricsById.values()]) {
      if (pendingM.documentKey === documentKey || extractRunId(pendingM.documentKey) === runId) {
        pendingM.fail(abortError());
      }
    }
    documents.delete(documentKey);
    for (const worker of workers) worker.postMessage({ type: 'close-document', documentKey });
  };

  const closeRun = (runId: string) => {
    const error = abortError();
    for (const pending of [...pendingById.values()]) {
      if (extractRunId(pending.documentKey) === runId) {
        settlePending(pending, error);
      }
    }
    for (const pendingM of [...pendingMetricsById.values()]) {
      if (extractRunId(pendingM.documentKey) === runId) {
        pendingM.fail(error);
      }
    }
    const runStates = new Set<DocumentState>();
    for (const key of [...documents.keys()]) {
      if (key === runId || extractRunId(key) === runId) {
        const state = documents.get(key);
        if (state) runStates.add(state);
        documents.delete(key);
      }
    }
    for (const state of runStates) state.reject(error);
    runBuffers.delete(runId);
    for (const worker of workers) worker.postMessage({ type: 'close-run', runId });
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const error = abortError();
    for (const document of documents.values()) document.reject(error);
    documents.clear();
    runBuffers.clear();
    for (const pending of [...pendingById.values()]) {
      settlePending(pending, error);
    }
    for (const pendingM of pendingMetricsById.values()) {
      pendingM.fail(error);
    }
    for (const worker of workers) worker.terminate();
    workers.length = 0;
  };

  const isDocumentOpen = (documentKey: string): boolean => {
    if (disposed) return false;
    return getDocState(documentKey) !== undefined;
  };

  return { open, getPageMetrics, request, close, closeRun, dispose, isDocumentOpen, workerCount };
}

let globalPoolInstance: ReturnType<typeof createPdfTilePool> | null = null;

export function getGlobalPdfTilePool(): ReturnType<typeof createPdfTilePool> {
  if (!globalPoolInstance) {
    globalPoolInstance = createPdfTilePool();
  }
  return globalPoolInstance;
}

export function resetGlobalPdfTilePool(): void {
  if (globalPoolInstance) {
    globalPoolInstance.dispose();
    globalPoolInstance = null;
  }
}
