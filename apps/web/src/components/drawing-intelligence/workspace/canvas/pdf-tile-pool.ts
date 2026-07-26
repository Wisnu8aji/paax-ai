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
  pageNumber: number;
  /** Signed browser-proxy URL for the original PDF; never a thumbnail URL. */
  url: string;
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
}

interface DocumentState {
  promise: Promise<PdfPageMetrics>;
  resolve: (metrics: PdfPageMetrics) => void;
  reject: (error: Error) => void;
  readyWorkers: Set<number>;
  metrics: PdfPageMetrics | null;
  openedAt: number;
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
}

type WorkerMessage =
  | { type: 'document-ready'; documentKey: string; metrics: PdfPageMetrics }
  | { type: 'document-error'; documentKey: string; message: string }
  | { type: 'tile'; requestId: number; documentKey: string; width: number; height: number; bitmap: ImageBitmap }
  | { type: 'tile-error'; requestId: number; documentKey: string; message: string };

function abortError(): Error {
  const error = new Error('PDF tile request cancelled');
  error.name = 'AbortError';
  return error;
}

function isAuthorisedArtifactUrl(url: string): boolean {
  if (!url.startsWith('/')) return false;
  const parsed = new URL(url, 'https://paax.invalid');
  return /^\/api\/document-intelligence\/drawings\/dem\/[^/]+\/artifact$/.test(parsed.pathname)
    && parsed.searchParams.has('token');
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
 * Owns the worker protocol, not tile memory. Consumers should store successful
 * claimed bitmaps in TileLru, which in turn owns their close() lifecycle.
 */
export function createPdfTilePool(options: PdfTilePoolOptions = {}) {
  const workerCount = workerCountFor(options.hardwareConcurrency);
  const workerFactory = options.workerFactory ?? (() => new Worker(
    new URL('./pdf-tile.worker.ts', import.meta.url),
    { type: 'module' },
  ));
  const now = options.now ?? Date.now;
  const workers: PdfTileWorker[] = [];
  const documents = new Map<string, DocumentState>();
  const pendingById = new Map<number, PendingTile>();
  const pendingByKey = new Map<string, PendingTile>();
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
    pendingById.delete(pending.requestId);
    pendingByKey.delete(pending.key);
    for (const consumer of pending.consumers.values()) consumer.reject(error);
    pending.consumers.clear();
  };

  const failWorker = (worker: PdfTileWorker, message: string) => {
    const error = new Error(message);
    for (const document of documents.values()) document.reject(error);
    documents.clear();
    for (const pending of [...pendingById.values()]) {
      settlePending(pending, error);
    }
    for (const current of workers) current.terminate();
    workers.length = 0;
    nextWorker = 0;
  };

  const onMessage = (workerIndex: number, message: WorkerMessage) => {
    if (message.type === 'document-ready') {
      const document = documents.get(message.documentKey);
      if (!document) return;
      if (!document.metrics) document.metrics = message.metrics;
      const expected = document.metrics;
      if (expected.width !== message.metrics.width || expected.height !== message.metrics.height || expected.rotation !== message.metrics.rotation) {
        documents.delete(message.documentKey);
        document.reject(new Error('PDF workers disagree about page metrics'));
        for (const worker of workers) worker.postMessage({ type: 'close-document', documentKey: message.documentKey });
        return;
      }
      document.readyWorkers.add(workerIndex);
      if (document.readyWorkers.size === workerCount) document.resolve(expected);
      return;
    }
    if (message.type === 'document-error') {
      const document = documents.get(message.documentKey);
      if (document) {
        const error = new Error(message.message);
        documents.delete(message.documentKey);
        document.reject(error);
        for (const pending of [...pendingById.values()]) {
          if (pending.documentKey === message.documentKey) settlePending(pending, error);
        }
        for (const worker of workers) worker.postMessage({ type: 'close-document', documentKey: message.documentKey });
      }
      return;
    }
    if (message.type === 'tile') {
      const pending = pendingById.get(message.requestId);
      if (!pending || pending.documentKey !== message.documentKey || !documents.has(message.documentKey)) {
        discardBitmap(message.bitmap);
        return;
      }
      pendingById.delete(pending.requestId);
      pendingByKey.delete(pending.key);

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
    if (!isAuthorisedArtifactUrl(document.url)) {
      return Promise.reject(new Error('PDF tile pool requires an authorised artifact URL'));
    }
    const existing = documents.get(document.documentKey);
    if (existing) return existing.promise;
    ensureWorkers();
    let resolve!: (metrics: PdfPageMetrics) => void;
    let reject!: (error: Error) => void;
    const state: DocumentState = {
      promise: new Promise<PdfPageMetrics>((res, rej) => { resolve = res; reject = rej; }),
      resolve,
      reject,
      readyWorkers: new Set(),
      metrics: null,
      openedAt: now(),
    };
    documents.set(document.documentKey, state);
    for (const worker of workers) {
      worker.postMessage({ type: 'open-document', ...document, rangeChunkSize: 64 * 1024 });
    }
    return state.promise;
  };

  const request = (requestTile: PdfTileRenderRequest): PdfTileRequestHandle => {
    if (disposed || !documents.has(requestTile.documentKey)) {
      return { promise: Promise.reject(new Error('PDF document is not open')), cancel: () => undefined };
    }
    let pending = pendingByKey.get(requestTile.tile.key);
    if (!pending) {
      const worker = workers[nextWorker++ % workers.length];
      pending = {
        requestId: nextRequestId++,
        key: requestTile.tile.key,
        documentKey: requestTile.documentKey,
        worker,
        consumers: new Map(),
      };
      pendingById.set(pending.requestId, pending);
      pendingByKey.set(pending.key, pending);
      worker.postMessage({
        type: 'render-tile',
        requestId: pending.requestId,
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
        pendingById.delete(pending.requestId);
        pendingByKey.delete(pending.key);
        pending.worker.postMessage({ type: 'cancel', requestId: pending.requestId });
      }
    };
    return { promise, cancel };
  };

  const close = (documentKey: string) => {
    for (const pending of [...pendingById.values()]) {
      if (pending.documentKey === documentKey) {
        pending.worker.postMessage({ type: 'cancel', requestId: pending.requestId });
        settlePending(pending, abortError());
      }
    }
    documents.delete(documentKey);
    for (const worker of workers) worker.postMessage({ type: 'close-document', documentKey });
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const key of [...documents.keys()]) close(key);
    for (const worker of workers) worker.terminate();
    workers.length = 0;
  };

  return { open, request, close, dispose, workerCount };
}
