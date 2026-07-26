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
    this.onmessage?.({ data: message } as MessageEvent);
  }

  emitError(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const request = {
  documentKey: 'run-1:A-101',
  pageNumber: 1,
  tile: { key: 'run-1:A-101:1:0:0', tx: 0, ty: 0, x: 0, y: 0, width: 512, height: 512, density: 1 },
};

describe('createPdfTilePool', () => {
  it('caps worker creation at three and coalesces duplicate tile requests', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ hardwareConcurrency: 12, workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });

    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=signed' });
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

  it('rejects untrusted source URLs before creating a worker and shares document-open failures', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });

    await expect(pool.open({ documentKey: 'bad', pageNumber: 1, url: 'https://example.test/thumbnail.png' })).rejects.toThrow('authorised artifact URL');
    expect(workers).toHaveLength(0);

    const first = pool.open({ documentKey: request.documentKey, pageNumber: 1, url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=signed' });
    const second = pool.open({ documentKey: request.documentKey, pageNumber: 1, url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=signed' });
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
    const source = { documentKey: request.documentKey, pageNumber: 1, url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=signed' };
    const first = pool.open(source);
    workers[0].emit({ type: 'document-error', documentKey: request.documentKey, message: 'bad pdf' });

    await expect(first).rejects.toThrow('bad pdf');
    expect(workers.every((worker) => worker.messages.some((message: any) => message.type === 'close-document'))).toBe(true);

    const retry = pool.open(source);
    workers.forEach((worker) => worker.emit({ type: 'document-ready', documentKey: request.documentKey }));
    await expect(retry).resolves.toBeUndefined();
    pool.dispose();
  });

  it('rejects document waiters and pending tile work when a worker errors', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=signed' });

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
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=signed' });
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
    const source = { documentKey: request.documentKey, pageNumber: 1, url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=signed' };
    const first = pool.open(source);
    workers[0].emitError('worker crashed');
    await expect(first).rejects.toThrow('worker crashed');
    expect(workers[0].terminate).toHaveBeenCalledOnce();

    const retry = pool.open(source);
    expect(workers).toHaveLength(2);
    workers[1].emit({ type: 'document-ready', documentKey: request.documentKey });
    await expect(retry).resolves.toBeUndefined();
    pool.dispose();
  });

  it('suppresses stale worker results, closes their bitmap, and terminates workers on dispose', async () => {
    const workers: FakeWorker[] = [];
    const pool = createPdfTilePool({ hardwareConcurrency: 2, workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });
    const opening = pool.open({ documentKey: request.documentKey, pageNumber: 1, url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=signed' });
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
