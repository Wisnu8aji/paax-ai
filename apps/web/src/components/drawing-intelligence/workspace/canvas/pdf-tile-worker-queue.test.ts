import { describe, expect, it } from 'vitest';

import { PdfTileWorkerQueue } from './pdf-tile-worker-queue';

interface TestMessage {
  requestId: number;
  documentKey: string;
}

const msg = (requestId: number, documentKey = 'A:1'): TestMessage => ({ requestId, documentKey });

describe('PdfTileWorkerQueue', () => {
  it('removes a cancelled queued request when take skips it', () => {
    const queue = new PdfTileWorkerQueue<TestMessage>();
    queue.enqueue(msg(1));
    queue.cancel(1);
    expect(queue.take()).toBeNull();
    expect(queue.pendingCount).toBe(0);
    expect(queue.cancelledCount).toBe(0);
  });

  it('consumes cancelled first/middle/last queue entries and drains cancelledCount to zero', () => {
    const queue = new PdfTileWorkerQueue<TestMessage>();
    queue.enqueue(msg(1));
    queue.enqueue(msg(2));
    queue.enqueue(msg(3));
    queue.cancel(1);
    queue.cancel(2);
    queue.cancel(3);
    expect(queue.take()).toBeNull();
    expect(queue.pendingCount).toBe(0);
    expect(queue.cancelledCount).toBe(0);
  });

  it('keeps FIFO order and only consumes cancellation markers for skipped heads', () => {
    const queue = new PdfTileWorkerQueue<TestMessage>();
    queue.enqueue(msg(1));
    queue.enqueue(msg(2));
    queue.enqueue(msg(3));
    queue.cancel(2);
    expect(queue.take()).toEqual(msg(1));
    expect(queue.take()).toEqual(msg(3));
    expect(queue.take()).toBeNull();
    expect(queue.pendingCount).toBe(0);
    expect(queue.cancelledCount).toBe(0);
  });

  it('complete clears active and cancellation bookkeeping for a request id', () => {
    const queue = new PdfTileWorkerQueue<TestMessage>();
    queue.enqueue(msg(1));
    expect(queue.take()).toEqual(msg(1));
    queue.cancel(1);
    expect(queue.cancelledCount).toBe(1);
    queue.complete(1);
    expect(queue.cancelledCount).toBe(0);
    expect(queue.pendingCount).toBe(0);
  });

  it('cancel and complete for unknown ids never leave bookkeeping behind', () => {
    const queue = new PdfTileWorkerQueue<TestMessage>();
    queue.cancel(99);
    expect(queue.cancelledCount).toBe(1);
    queue.complete(99);
    expect(queue.cancelledCount).toBe(0);
    expect(queue.pendingCount).toBe(0);
  });

  it('removeDocument returns matching entries by exact documentKey and runId and preserves unrelated work', () => {
    const queue = new PdfTileWorkerQueue<TestMessage>();
    queue.enqueue(msg(1, 'A:1'));
    queue.enqueue(msg(2, 'B:1'));
    queue.enqueue(msg(3, 'A:2'));
    queue.enqueue(msg(4, 'C:1'));
    const removed = queue.removeDocument('A:1', 'A');
    expect(removed.map((m) => m.requestId)).toEqual([1, 3]);
    expect(queue.pendingCount).toBe(2);
    expect(queue.take()).toEqual(msg(2, 'B:1'));
    expect(queue.take()).toEqual(msg(4, 'C:1'));
    expect(queue.take()).toBeNull();
    expect(queue.cancelledCount).toBe(0);
  });

  it('removeDocument also matches entries whose documentKey equals the run id itself', () => {
    const queue = new PdfTileWorkerQueue<TestMessage>();
    queue.enqueue(msg(1, 'D'));
    queue.enqueue(msg(2, 'E:1'));
    const removed = queue.removeDocument('D', 'D');
    expect(removed.map((m) => m.requestId)).toEqual([1]);
    expect(queue.pendingCount).toBe(1);
  });

  it('removeDocument purges cancellation markers of the removed entries', () => {
    const queue = new PdfTileWorkerQueue<TestMessage>();
    queue.enqueue(msg(1, 'A:1'));
    queue.enqueue(msg(2, 'B:1'));
    queue.cancel(1);
    const removed = queue.removeDocument('A:1', 'A');
    expect(removed.map((m) => m.requestId)).toEqual([1]);
    expect(queue.cancelledCount).toBe(0);
    expect(queue.take()).toEqual(msg(2, 'B:1'));
    expect(queue.cancelledCount).toBe(0);
  });

  it('stays bounded under churn: enqueue/cancel/take/complete cycles leave zero bookkeeping', () => {
    const queue = new PdfTileWorkerQueue<TestMessage>();
    for (let i = 1; i <= 50; i++) queue.enqueue(msg(i, 'A:1'));
    for (let i = 1; i <= 50; i++) queue.cancel(i);
    while (queue.take() !== null) {
      // drain
    }
    for (let i = 51; i <= 100; i++) {
      queue.enqueue(msg(i, 'A:1'));
      expect(queue.take()).toEqual(msg(i, 'A:1'));
      queue.complete(i);
    }
    expect(queue.pendingCount).toBe(0);
    expect(queue.cancelledCount).toBe(0);
  });

  it('isCancelled reports only ids marked cancelled', () => {
    const queue = new PdfTileWorkerQueue<TestMessage>();
    queue.enqueue(msg(1));
    queue.cancel(1);
    expect(queue.isCancelled(1)).toBe(true);
    queue.take();
    expect(queue.isCancelled(1)).toBe(false);
    queue.enqueue(msg(2));
    expect(queue.take()).toEqual(msg(2));
    expect(queue.isCancelled(2)).toBe(false);
  });
});
