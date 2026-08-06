import { describe, expect, it, vi } from 'vitest';

import { createPdfRenderPool, workerCountFor } from './pdf-render-pool';
import type { PdfRenderWorker } from './pdf-native-contract';

class FakeWorker implements PdfRenderWorker {
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

const mockPdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]).buffer;
const pdfFetcher = vi.fn(async () => mockPdfBuffer.slice(0));

const baseRequest = {
  requestId: 'base-1',
  generation: 1,
  runId: 'run-1',
  pageIndex: 0,
  density: 2,
  darkMode: false,
  priority: 'base-first' as const,
};

const cropRequest = {
  requestId: 'crop-1',
  generation: 1,
  runId: 'run-1',
  pageIndex: 0,
  region: { x: 10, y: 20, width: 100, height: 200 },
  density: 4,
  darkMode: false,
  priority: 'foreground' as const,
};

function mockBitmap(): ImageBitmap {
  return { width: 8, height: 8, close: vi.fn() } as unknown as ImageBitmap;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function openPool(options: { fetcher?: typeof pdfFetcher; timeoutMs?: number } = {}) {
  const workers: FakeWorker[] = [];
  const pool = createPdfRenderPool({
    hardwareConcurrency: 8,
    workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    pdfFetcher: options.fetcher ?? pdfFetcher,
    requestTimeoutMs: options.timeoutMs ?? 50,
  });
  return { pool, workers };
}

/** Open a run: emit document-ready on every worker, let the pool post the
 *  page-metrics request, answer it, and resolve the open promise. */
async function openRun(pool: ReturnType<typeof createPdfRenderPool>, workers: FakeWorker[], runId = 'run-1', pageIndex = 0) {
  const opening = pool.open(runId, pageIndex);
  for (const worker of workers) {
    worker.emit({ type: 'document-ready', runId, numPages: 1, width: 100, height: 200 });
  }
  await tick();
  for (const worker of workers) {
    const metricsMessage = worker.messages.find(
      (m: any) => m.type === 'get-page-metrics' && m.runId === runId,
    ) as { requestId: string } | undefined;
    if (metricsMessage) {
      worker.emit({
        type: 'page-metrics',
        requestId: metricsMessage.requestId,
        runId,
        pageIndex,
        width: 100,
        height: 200,
      });
    }
  }
  return opening;
}

/** Emit a render-result for requestId on the worker holding its wire msg. */
function emitResult(workers: FakeWorker[], message: Record<string, unknown>) {
  const target = workers.find((w) => w.messages.some(
    (m: any) => (m.type === 'render-base' || m.type === 'render-crop') && m.requestId === message.requestId,
  ));
  (target ?? workers[0]).emit(message);
}

describe('createPdfRenderPool', () => {
  it('caps worker creation at three and keeps the PDF fetch single-flight', async () => {
    const { pool, workers } = openPool();
    await openRun(pool, workers);
    expect(workers).toHaveLength(3);
    expect(pdfFetcher).toHaveBeenCalledTimes(1);

    // Second open of the same run must not re-fetch.
    await openRun(pool, workers);
    expect(pdfFetcher).toHaveBeenCalledTimes(1);
    pool.dispose();
  });

  it('delivers a committed render with a single-claim bitmap', async () => {
    const { pool, workers } = openPool();
    await openRun(pool, workers);
    const bitmap = mockBitmap();
    const handle = pool.renderBase(baseRequest);
    const wire = workers.flatMap((w) => w.messages).find((m: any) => m.type === 'render-base');
    expect(wire).toMatchObject({ requestId: 'base-1', runId: 'run-1', pageIndex: 0, density: 2, darkMode: false });

    let claimed: ImageBitmap | null = null;
    handle.promise.then((d) => { claimed = d.claim(); });
    emitResult(workers, {
      type: 'render-result',
      requestId: 'base-1',
      runId: 'run-1',
      pageIndex: 0,
      region: { x: 0, y: 0, width: 100, height: 200 },
      density: 2,
      widthPx: 200,
      heightPx: 400,
      renderMs: 5,
      estimatedBytes: 200 * 400 * 4,
      bitmap,
    });
    await handle.promise;
    expect(claimed).toBe(bitmap);
    pool.dispose();
  });

  it('discards a late bitmap when the pending request is gone', async () => {
    const { pool, workers } = openPool();
    await openRun(pool, workers);
    const bitmap = mockBitmap();
    const handle = pool.renderBase(baseRequest);
    handle.cancel();
    await handle.promise.catch(() => undefined);
    emitResult(workers, {
      type: 'render-result',
      requestId: 'base-1',
      runId: 'run-1',
      pageIndex: 0,
      region: { x: 0, y: 0, width: 100, height: 200 },
      density: 2,
      widthPx: 200,
      heightPx: 400,
      renderMs: 5,
      estimatedBytes: 200 * 400 * 4,
      bitmap,
    });
    expect(bitmap.close).toHaveBeenCalled();
    pool.dispose();
  });

  it('retries once after a timeout, then rejects', async () => {
    const { pool, workers } = openPool();
    await openRun(pool, workers);
    const handle = pool.renderBase(baseRequest);
    await expect(handle.promise).rejects.toMatchObject({ name: 'RenderTimeoutError' });
    // The request was issued twice: original + one retry.
    const renderMessages = workers.flatMap((w) => w.messages).filter((m: any) => m.type === 'render-base');
    expect(renderMessages.length).toBeGreaterThanOrEqual(2);
    pool.dispose();
  });

  it('recovers from a worker crash and retries the in-flight request once', async () => {
    const { pool, workers } = openPool();
    await openRun(pool, workers);
    const handle = pool.renderCrop(cropRequest);
    await tick();

    const crashedIndex = workers.findIndex((w) => w.messages.some((m: any) => m.type === 'render-crop'));
    expect(crashedIndex).toBeGreaterThanOrEqual(0);
    workers[crashedIndex].emitError('boom');
    await tick();

    // The replacement worker (same index) got an open-document for the run.
    const replacement = workers[crashedIndex];
    expect(replacement.messages.some((m: any) => m.type === 'open-document')).toBe(true);

    // Find the worker that received the RETRIED crop (may be the replacement
    // or another ready worker) and complete the reopen + result there.
    let retryWorker: FakeWorker | undefined;
    for (const worker of workers) {
      const crops = worker.messages.filter((m: any) => m.type === 'render-crop');
      if (crops.length > 0) retryWorker = worker;
    }
    expect(retryWorker).toBeDefined();
    retryWorker!.emit({ type: 'document-ready', runId: 'run-1', numPages: 1, width: 100, height: 200 });
    await tick();

    const bitmap = mockBitmap();
    let claimed: ImageBitmap | null = null;
    handle.promise.then((d) => { claimed = d.claim(); });
    retryWorker!.emit({
      type: 'render-result',
      requestId: 'crop-1',
      runId: 'run-1',
      pageIndex: 0,
      region: cropRequest.region,
      density: 4,
      widthPx: 400,
      heightPx: 800,
      renderMs: 5,
      estimatedBytes: 400 * 800 * 4,
      bitmap,
    });
    await handle.promise;
    expect(claimed).toBe(bitmap);
    pool.dispose();
  });

  it('closeRun cancels pending renders and releases the run', async () => {
    const { pool, workers } = openPool();
    await openRun(pool, workers);
    const handle = pool.renderBase(baseRequest);
    const before = handle.promise.catch((e) => e);
    pool.closeRun('run-1');
    const error = await before;
    expect(error).toMatchObject({ name: 'RenderAbortError' });
    // close-run posted to every worker
    const closeMessages = workers.flatMap((w) => w.messages).filter((m: any) => m.type === 'close-run');
    expect(closeMessages.length).toBe(3);
    pool.dispose();
  });
});

describe('workerCountFor', () => {
  it('clamps to 1..3', () => {
    expect(workerCountFor(1)).toBe(1);
    expect(workerCountFor(2)).toBe(1);
    expect(workerCountFor(3)).toBe(2);
    expect(workerCountFor(8)).toBe(3);
    expect(workerCountFor(undefined)).toBe(1);
  });
});
