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
});
