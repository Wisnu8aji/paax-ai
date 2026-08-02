import { describe, expect, it, vi } from 'vitest';

import { createPdfTilePool, type PdfTileWorker } from './pdf-tile-pool';

class FakeWorker implements PdfTileWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: unknown[] = [];
  readonly terminate = vi.fn();

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  emit(message: unknown): void {
    if ((message as { type?: string }).type === 'document-ready' && !(message as { metrics?: unknown }).metrics) {
      message = { ...(message as object), metrics: { width: 100, height: 200, rotation: 0 } };
    }
    this.onmessage?.({ data: message } as MessageEvent);
  }

  emitError(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const mockPdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]).buffer;

const request = {
  documentKey: 'run-1:A-101',
  pageNumber: 1,
  tile: { key: 'run-1:A-101:1:0:0', tx: 0, ty: 0, x: 0, y: 0, width: 512, height: 512, density: 1 },
};

describe('createPdfTilePool', () => {
  it('returns verified pdf.js page metrics only when every worker agrees', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ hardwareConcurrency: 3, workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    workers.forEach((worker) => worker.emit({ type: 'document-ready', documentKey: request.documentKey, metrics: { width: 841.89, height: 595.28, rotation: 0 } }));

    await expect(opening).resolves.toEqual({ width: 841.89, height: 595.28, rotation: 0 });
    pool.dispose();
  });

  it('caps worker creation at three and coalesces duplicate tile requests', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ hardwareConcurrency: 12, workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });

    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    expect(workers).toHaveLength(3);
    workers.forEach((worker) => worker.emit({ type: 'document-ready', documentKey: request.documentKey }));
    await opening;

    const first = pool.request(request);
    const second = pool.request(request);
    const another = pool.request({ ...request, tile: { ...request.tile, key: 'run-1:A-101:1:1:0', tx: 1, x: 512 } });

    expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'render-tile')).toHaveLength(2);
    expect(workers[0].messages.some((message: any) => message.type === 'render-tile')).toBe(true);
    expect(workers[1].messages.some((message: any) => message.type === 'render-tile')).toBe(true);
    first.cancel();
    expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'cancel')).toHaveLength(0);
    second.cancel();
    another.cancel();
    expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'cancel')).toHaveLength(2);
    await expect(first.promise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second.promise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(another.promise).rejects.toMatchObject({ name: 'AbortError' });

    pool.dispose();
  });

  it('two coalesced consumers, first claim gets bitmap and second returns null', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    workers.forEach((w) => w.emit({ type: 'document-ready', documentKey: request.documentKey }));
    await opening;

    const first = pool.request(request);
    const second = pool.request(request);
    const mockBitmap = { close: vi.fn() } as unknown as ImageBitmap;

    let claimed1: ImageBitmap | null = null;
    let claimed2: ImageBitmap | null = null;
    // Promise reaction microtasks are queued when consumers resolve, executing before pool closeIfUnclaimed microtask.
    first.promise.then((d) => { claimed1 = d.claim(); });
    second.promise.then((d) => { claimed2 = d.claim(); });

    workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap: mockBitmap });

    const delivery1 = await first.promise;
    const delivery2 = await second.promise;

    expect(delivery1).toBe(delivery2);
    expect(claimed1).toBe(mockBitmap);
    expect(claimed2).toBeNull();
    expect([claimed1, claimed2].filter((claimed) => claimed !== null)).toHaveLength(1);
    expect(mockBitmap.close).not.toHaveBeenCalled();

    pool.dispose();
  });

  it('all consumers do not claim => deferred pool close exactly once', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    workers.forEach((w) => w.emit({ type: 'document-ready', documentKey: request.documentKey }));
    await opening;

    const handle = pool.request(request);
    const mockBitmap = { close: vi.fn() } as unknown as ImageBitmap;

    workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap: mockBitmap });

    const delivery = await handle.promise;
    expect(delivery.width).toBe(512);
    // Do not call claim()
    await new Promise<void>((r) => queueMicrotask(() => r()));

    expect(mockBitmap.close).toHaveBeenCalledOnce();
    pool.dispose();
  });

  it('one stale/no-claim + one active claim => pool does not close', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    workers.forEach((w) => w.emit({ type: 'document-ready', documentKey: request.documentKey }));
    await opening;

    const consumerStale = pool.request(request);
    const consumerActive = pool.request(request);
    const mockBitmap = { close: vi.fn() } as unknown as ImageBitmap;

    let activeClaimed: ImageBitmap | null = null;
    consumerStale.promise.then(() => {
      // Stale consumer does not call claim()
    });
    consumerActive.promise.then((delivery) => {
      activeClaimed = delivery.claim();
    });

    workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap: mockBitmap });

    await Promise.all([consumerStale.promise, consumerActive.promise]);
    await new Promise<void>((r) => queueMicrotask(() => r()));

    expect(activeClaimed).toBe(mockBitmap);
    expect(mockBitmap.close).not.toHaveBeenCalled();
    pool.dispose();
  });

  it('cancelled-last then late worker result => discard closes once', async () => {
    // Covers synchronous discardBitmap when a late tile arrives for a cancelled request, distinct from deferred unclaimed close.
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    workers.forEach((w) => w.emit({ type: 'document-ready', documentKey: request.documentKey }));
    await opening;

    const pending = pool.request(request);
    const mockBitmap = { close: vi.fn() } as unknown as ImageBitmap;

    pending.cancel();
    await expect(pending.promise).rejects.toMatchObject({ name: 'AbortError' });

    workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap: mockBitmap });

    expect(mockBitmap.close).toHaveBeenCalledOnce();
    pool.dispose();
  });

  it('rejects invalid or empty ArrayBuffer data before creating a worker and shares document-open failures', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });

    await expect(pool.open({ documentKey: 'bad', pageNumber: 1, data: new ArrayBuffer(0) })).rejects.toThrow('non-empty ArrayBuffer');
    expect(workers).toHaveLength(0);

    const first = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    const second = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    workers.forEach((worker) => worker.emit({ type: 'document-error', documentKey: request.documentKey, message: 'bad pdf' }));

    await expect(first).rejects.toThrow('bad pdf');
    await expect(second).rejects.toThrow('bad pdf');
    pool.dispose();
  });

  it('closes a failed document on every worker and allows a retry to open it', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ hardwareConcurrency: 3, workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const source = { documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer };
    const first = pool.open(source);
    workers[0].emit({ type: 'document-error', documentKey: request.documentKey, message: 'bad pdf' });

    await expect(first).rejects.toThrow('bad pdf');
    expect(workers.every((worker) => worker.messages.some((message: any) => message.type === 'close-document'))).toBe(true);

    const retry = pool.open(source);
    workers.forEach((worker) => worker.emit({ type: 'document-ready', documentKey: request.documentKey }));
    await expect(retry).resolves.toMatchObject({ width: 100, height: 200, rotation: 0 });
    pool.dispose();
  });

  it('rejects document waiters and pending tile work when a worker errors', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });

    workers[0].emitError('worker crashed');

    await expect(opening).rejects.toThrow('worker crashed');
    pool.dispose();
  });

  it('invalidates every in-flight tile for a document when any pool worker fails', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ hardwareConcurrency: 3, workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    workers.forEach((worker) => worker.emit({ type: 'document-ready', documentKey: request.documentKey }));
    await opening;
    const first = pool.request(request);
    const second = pool.request({ ...request, tile: { ...request.tile, key: 'run-1:A-101:1:1:0', tx: 1, x: 512 } });

    workers[0].emitError('worker crashed');

    await expect(first.promise).rejects.toThrow('worker crashed');
    await expect(second.promise).rejects.toThrow('worker crashed');
    pool.dispose();
  });

  it('recreates failed workers so the same document can be opened deterministically', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ hardwareConcurrency: 2, workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const source = { documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer };
    const first = pool.open(source);
    workers[0].emitError('worker crashed');
    await expect(first).rejects.toThrow('worker crashed');
    expect(workers[0].terminate).toHaveBeenCalledOnce();

    const retry = pool.open(source);
    expect(workers).toHaveLength(2);
    workers[1].emit({ type: 'document-ready', documentKey: request.documentKey });
    await expect(retry).resolves.toMatchObject({ width: 100, height: 200, rotation: 0 });
    pool.dispose();
  });

  it('suppresses stale worker results, closes their bitmap, and terminates workers on dispose', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ hardwareConcurrency: 2, workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    workers.forEach((worker) => worker.emit({ type: 'document-ready', documentKey: request.documentKey }));
    await opening;
    const pending = pool.request(request);
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;

    pool.close(request.documentKey);
    workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap });
    await expect(pending.promise).rejects.toMatchObject({ name: 'AbortError' });

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(workers.every((worker) => worker.messages.some((message: any) => message.type === 'close-document'))).toBe(true);
    pool.dispose();
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  });

  it('waits for initial document readiness before requesting another page metrics', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const pageOne = pool.open({ documentKey: 'run:0', pageNumber: 1, data: mockPdfBuffer });
    const pageTwo = pool.open({ documentKey: 'run:1', pageNumber: 2, data: mockPdfBuffer });

    expect(messagesOfType(workers[0], 'get-page-metrics')).toHaveLength(0);

    readyAllWorkers(workers, 'run:0');
    await pageOne;

    const metricsMessages = messagesOfType(workers[0], 'get-page-metrics');
    expect(metricsMessages).toHaveLength(1);
    workers[0].emit({
      type: 'page-metrics',
      requestId: (metricsMessages[0] as any).requestId,
      documentKey: 'run:1',
      pageNumber: 2,
      metrics: { width: 300, height: 400, rotation: 0 },
    });
    await expect(pageTwo).resolves.toEqual({ width: 300, height: 400, rotation: 0 });
    pool.dispose();
  });

  it('removes a rejected page metrics cache entry so the page can be reopened', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const pageOne = pool.open({ documentKey: 'run:0', pageNumber: 1, data: mockPdfBuffer });
    readyAllWorkers(workers, 'run:0');
    await pageOne;

    const firstAttempt = pool.open({ documentKey: 'run:1', pageNumber: 2, data: mockPdfBuffer });
    const metricsMessage = messagesOfType(workers[0], 'get-page-metrics')[0] as any;
    workers[0].emit({ type: 'page-metrics-error', requestId: metricsMessage.requestId, documentKey: 'run:1', message: 'page exploded' });
    await expect(firstAttempt).rejects.toThrow('page exploded');

    const retry = pool.open({ documentKey: 'run:1', pageNumber: 2, data: mockPdfBuffer });
    const retryMessage = messagesOfType(workers[0], 'get-page-metrics')[1] as any;
    expect(retryMessage).toBeDefined();
    workers[0].emit({
      type: 'page-metrics',
      requestId: retryMessage.requestId,
      documentKey: 'run:1',
      pageNumber: 2,
      metrics: { width: 500, height: 600, rotation: 0 },
    });
    await expect(retry).resolves.toEqual({ width: 500, height: 600, rotation: 0 });
    pool.dispose();
  });

  it('close aborts in-flight page metrics and evicts the exact cache entry so reopen retries', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const pageOne = pool.open({ documentKey: 'run:0', pageNumber: 1, data: mockPdfBuffer });
    readyAllWorkers(workers, 'run:0');
    await pageOne;

    const attempt = pool.open({ documentKey: 'run:1', pageNumber: 2, data: mockPdfBuffer });
    expect(messagesOfType(workers[0], 'get-page-metrics')).toHaveLength(1);
    pool.close('run:1');
    await expect(attempt).rejects.toMatchObject({ name: 'AbortError' });

    const reopened = pool.open({ documentKey: 'run:1', pageNumber: 2, data: mockPdfBuffer });
    const retryMessage = messagesOfType(workers[0], 'get-page-metrics')[1] as any;
    expect(retryMessage).toBeDefined();
    workers[0].emit({
      type: 'page-metrics',
      requestId: retryMessage.requestId,
      documentKey: 'run:1',
      pageNumber: 2,
      metrics: { width: 700, height: 800, rotation: 0 },
    });
    await expect(reopened).resolves.toEqual({ width: 700, height: 800, rotation: 0 });
    pool.dispose();
  });

  it('times out a pending page metrics request, evicts the cache entry, and allows retry', async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const pool = createPdfTilePool({ requestTimeoutMs: 1000, workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      } });
      const pageOne = pool.open({ documentKey: 'run:0', pageNumber: 1, data: mockPdfBuffer });
      readyAllWorkers(workers, 'run:0');
      await pageOne;

      const attempt = pool.open({ documentKey: 'run:1', pageNumber: 2, data: mockPdfBuffer });
      attempt.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(1001);
      await expect(attempt).rejects.toThrow('timed out');

      // late metrics for the timed-out request id are harmless
      workers[0].emit({
        type: 'page-metrics',
        requestId: (messagesOfType(workers[0], 'get-page-metrics')[0] as any).requestId,
        documentKey: 'run:1',
        pageNumber: 2,
        metrics: { width: 1, height: 1, rotation: 0 },
      });

      const retry = pool.open({ documentKey: 'run:1', pageNumber: 2, data: mockPdfBuffer });
      const retryMessage = messagesOfType(workers[0], 'get-page-metrics')[1] as any;
      expect(retryMessage).toBeDefined();
      workers[0].emit({
        type: 'page-metrics',
        requestId: retryMessage.requestId,
        documentKey: 'run:1',
        pageNumber: 2,
        metrics: { width: 900, height: 1000, rotation: 0 },
      });
      await expect(retry).resolves.toEqual({ width: 900, height: 1000, rotation: 0 });
      pool.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out a tile request, posts cancellation once, and clears pending state', async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const pool = createPdfTilePool({ requestTimeoutMs: 1000, workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      } });
      const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
      readyAllWorkers(workers, request.documentKey);
      await opening;

      const handle = pool.request(request);
      handle.promise.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(1001);
      await expect(handle.promise).rejects.toThrow('timed out');

      const cancels = workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'cancel') as any[];
      expect(cancels).toHaveLength(1);
      expect(cancels[0].requestId).toBe(1);

      const lateBitmap = { close: vi.fn() } as unknown as ImageBitmap;
      workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap: lateBitmap });
      expect(lateBitmap.close).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(5000);
      expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'cancel')).toHaveLength(1);
      pool.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves delivery before the timeout boundary and never settles twice', async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const pool = createPdfTilePool({ requestTimeoutMs: 1000, workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      } });
      const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
      readyAllWorkers(workers, request.documentKey);
      await opening;

      const handle = pool.request(request);
      await vi.advanceTimersByTimeAsync(999);
      const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
      let claimed: ImageBitmap | null = null;
      handle.promise.then((delivery) => {
        claimed = delivery.claim();
      });
      workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap });
      const delivery = await handle.promise;
      expect(delivery.width).toBe(512);
      expect(claimed).toBe(bitmap);
      expect(bitmap.close).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000);
      expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'cancel')).toHaveLength(0);
      handle.cancel();
      pool.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancelling one consumer of a shared tile keeps the other consumer and worker work alive', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    readyAllWorkers(workers, request.documentKey);
    await opening;

    const first = pool.request(request);
    const second = pool.request(request);
    first.cancel();
    await expect(first.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'cancel')).toHaveLength(0);

    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    let claimed: ImageBitmap | null = null;
    second.promise.then((delivery) => {
      claimed = delivery.claim();
    });
    workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap });
    const delivery = await second.promise;
    expect(delivery.width).toBe(512);
    expect(claimed).toBe(bitmap);
    expect(bitmap.close).not.toHaveBeenCalled();

    const third = pool.request(request);
    third.cancel();
    expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'cancel')).toHaveLength(1);
    await expect(third.promise).rejects.toMatchObject({ name: 'AbortError' });
    pool.dispose();
  });

  it('ignores late tile/metrics messages after close and dispose without double-closing bitmaps', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
    readyAllWorkers(workers, request.documentKey);
    await opening;

    const pending = pool.request(request);
    pool.close(request.documentKey);
    await expect(pending.promise).rejects.toMatchObject({ name: 'AbortError' });

    const lateBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap: lateBitmap });
    expect(lateBitmap.close).toHaveBeenCalledOnce();

    workers[0].emit({
      type: 'page-metrics',
      requestId: 4242,
      documentKey: request.documentKey,
      pageNumber: 5,
      metrics: { width: 1, height: 1, rotation: 0 },
    });

    pool.dispose();
    const afterDisposeBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].emit({ type: 'tile', requestId: 4242, documentKey: request.documentKey, width: 10, height: 10, bitmap: afterDisposeBitmap });
    expect(afterDisposeBitmap.close).toHaveBeenCalledOnce();
    workers[0].emit({ type: 'document-ready', documentKey: request.documentKey });
  });

  it('close page does not destroy same-run document state; closeRun releases the run destructively', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const pageOne = pool.open({ documentKey: 'run:0', pageNumber: 1, data: mockPdfBuffer });
    readyAllWorkers(workers, 'run:0');
    await pageOne;

    pool.close('run:0');
    expect(workers.every((worker) => worker.messages.some((message: any) => message.type === 'close-document'))).toBe(true);
    expect(workers.some((worker) => worker.messages.some((message: any) => message.type === 'close-run'))).toBe(false);

    const pageTwo = pool.open({ documentKey: 'run:1', pageNumber: 2, data: mockPdfBuffer });
    const metricsMessage = messagesOfType(workers[0], 'get-page-metrics')[0] as any;
    workers[0].emit({
      type: 'page-metrics',
      requestId: metricsMessage.requestId,
      documentKey: 'run:1',
      pageNumber: 2,
      metrics: { width: 300, height: 400, rotation: 0 },
    });
    await expect(pageTwo).resolves.toEqual({ width: 300, height: 400, rotation: 0 });

    const handle = pool.request({ ...request, documentKey: 'run:0', tile: { ...request.tile, key: 'run:0:1:0:0' } });
    const tileBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].emit({ type: 'tile', requestId: 2, documentKey: 'run:0', width: 512, height: 512, bitmap: tileBitmap });
    const delivery = await handle.promise;
    expect(delivery.width).toBe(512);

    pool.closeRun('run');
    expect(workers.every((worker) => worker.messages.some((message: any) => message.type === 'close-run'))).toBe(true);
    expect(pool.isDocumentOpen('run:0')).toBe(false);
    expect(pool.isDocumentOpen('run:1')).toBe(false);

    const reopened = pool.open({ documentKey: 'run:0', pageNumber: 1, data: mockPdfBuffer });
    expect(workers[0].messages.filter((message: any) => message.type === 'open-document').length).toBeGreaterThan(0);
    readyAllWorkers(workers, 'run:0');
    await expect(reopened).resolves.toMatchObject({ width: 100, height: 200 });
    pool.dispose();
  });

  it('clears pending timers and work when a worker crashes', async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const pool = createPdfTilePool({ requestTimeoutMs: 1000, workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      } });
      const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
      readyAllWorkers(workers, request.documentKey);
      await opening;

      const handle = pool.request(request);
      const metricsAttempt = pool.open({ documentKey: 'run:1', pageNumber: 2, data: mockPdfBuffer });
      workers[0].emitError('worker crashed');

      await expect(handle.promise).rejects.toThrow('worker crashed');
      await expect(metricsAttempt).rejects.toThrow('worker crashed');
      await vi.advanceTimersByTimeAsync(5000);

      const lateBitmap = { close: vi.fn() } as unknown as ImageBitmap;
      workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap: lateBitmap });
      expect(lateBitmap.close).toHaveBeenCalledOnce();
      pool.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('dispose rejects pending work, clears timers, and is idempotent', async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const pool = createPdfTilePool({ requestTimeoutMs: 1000, workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      } });
      const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, data: mockPdfBuffer });
      readyAllWorkers(workers, request.documentKey);
      await opening;

      const handle = pool.request(request);
      pool.dispose();
      await expect(handle.promise).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(5000);
      expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'cancel')).toHaveLength(0);

      const afterDispose = pool.request(request);
      await expect(afterDispose.promise).rejects.toThrow('disposed');

      const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
      workers[0].emit({ type: 'tile', requestId: 1, documentKey: request.documentKey, width: 512, height: 512, bitmap });
      expect(bitmap.close).toHaveBeenCalledOnce();
      pool.dispose();
      expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps request ids and pending counts bounded under open/close/cancel churn', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    for (let i = 0; i < 10; i++) {
      const documentKey = `run${i}:1`;
      const opening = pool.open({ documentKey, pageNumber: 1, data: mockPdfBuffer });
      readyAllWorkers(workers, documentKey);
      await opening;
      const handle = pool.request({ ...request, documentKey, tile: { ...request.tile, key: `${documentKey}:1:0:0` } });
      handle.cancel();
      await expect(handle.promise).rejects.toMatchObject({ name: 'AbortError' });
      pool.close(documentKey);
      pool.closeRun(`run${i}`);
    }
    expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'render-tile')).toHaveLength(10);
    expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'cancel')).toHaveLength(10);
    expect(workers.flatMap((worker) => worker.messages).filter((message: any) => message.type === 'close-run')).toHaveLength(10);
    pool.dispose();
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  });
});

function messagesOfType(worker: FakeWorker, type: string): unknown[] {
  return worker.messages.filter((message: any) => message.type === type);
}

function readyAllWorkers(workers: FakeWorker[], documentKey: string): void {
  workers.forEach((worker) => worker.emit({ type: 'document-ready', documentKey }));
}
