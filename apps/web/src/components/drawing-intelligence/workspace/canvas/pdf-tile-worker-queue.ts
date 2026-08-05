/**
 * Single queue and cancellation authority for a PDF tile worker run.
 *
 * The queue is payload-agnostic: the extended render-tile message (optional
 * `scale` / `dark` fields) flows through with unchanged FIFO, cancellation and
 * removeDocument semantics. Only `requestId` and `documentKey` participate in
 * queue bookkeeping.
 *
 * Ownership rules:
 * - `enqueue` appends FIFO work; `take` pops the head and consumes (deletes)
 *   any cancelled head so cancelled request IDs never accumulate.
 * - `cancel` marks an id cancelled; the marker is consumed by `take` when the
 *   queued entry is reached, or purged by `complete` when the work finishes.
 * - `removeDocument` removes and returns entries for a closed page/run and
 *   purges their cancellation markers without corrupting unrelated work.
 * - `complete` deletes all active/cancellation bookkeeping for a finished id.
 *
 * `isCancelled` is a worker-internal extension used to suppress late posts
 * after a render task was cancelled.
 */
export class PdfTileWorkerQueue<T extends { requestId: number; documentKey: string }> {
  private items: T[] = [];
  private queuedIds = new Set<number>();
  private cancelledIds = new Set<number>();
  private activeIds = new Set<number>();

  enqueue(message: T): void {
    this.items.push(message);
    this.queuedIds.add(message.requestId);
  }

  cancel(requestId: number): void {
    // A late cancel may arrive after the render completed and its bookkeeping
    // was removed. Never retain such out-of-band IDs forever.
    if (!this.queuedIds.has(requestId) && !this.activeIds.has(requestId)) return;
    this.cancelledIds.add(requestId);
  }

  take(): T | null {
    while (this.items.length > 0) {
      const message = this.items.shift()!;
      this.queuedIds.delete(message.requestId);
      if (this.cancelledIds.delete(message.requestId)) {
        continue;
      }
      this.activeIds.add(message.requestId);
      return message;
    }
    return null;
  }

  removeDocument(documentKey: string, runId: string): T[] {
    const removed: T[] = [];
    const kept: T[] = [];
    for (const message of this.items) {
      if (message.documentKey === documentKey || extractRunId(message.documentKey) === runId) {
        removed.push(message);
      } else {
        kept.push(message);
      }
    }
    this.items = kept;
    for (const message of removed) {
      this.queuedIds.delete(message.requestId);
      this.cancelledIds.delete(message.requestId);
    }
    return removed;
  }

  complete(requestId: number): void {
    this.queuedIds.delete(requestId);
    this.activeIds.delete(requestId);
    this.cancelledIds.delete(requestId);
  }

  isCancelled(requestId: number): boolean {
    return this.cancelledIds.has(requestId);
  }

  get pendingCount(): number {
    return this.items.length;
  }

  get cancelledCount(): number {
    return this.cancelledIds.size;
  }
}

function extractRunId(documentKey: string): string {
  const idx = documentKey.indexOf(':');
  return idx !== -1 ? documentKey.substring(0, idx) : documentKey;
}
