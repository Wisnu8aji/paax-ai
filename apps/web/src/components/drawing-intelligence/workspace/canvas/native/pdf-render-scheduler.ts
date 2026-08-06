/*
 * PAAX native PDF render scheduler — pdf-render-scheduler.ts
 *
 * Latest-wins priority scheduler for the native render engine.
 *
 * Priorities (lower number wins):
 *   P0 foreground crop        (viewport detail, highest)
 *   P1 base-first             (first useful paint)
 *   P2 neighbor-prefetch      (directional overscan)
 *   P3 base-upgrade           (background density upgrade, lowest)
 *
 * Guarantees:
 *   - FIFO within a priority level, strict priority ACROSS levels: a P0
 *     arriving after many P2/P3 requests dispatches before them (no long FIFO
 *     can hold the active crop behind background work);
 *   - at most ONE foreground crop active per page (a newer foreground crop
 *     supersedes the previous one — latest-wins);
 *   - a P0 preempts active P2/P3 background work when all slots are busy
 *     (P1 base-first is never preempted so first useful paint is not delayed);
 *   - generation guard: only the latest generation per page may commit
 *     (result.generation === activeGeneration AND requestId masih terdaftar
 *     AND pageIndex masih aktif — Master Plan §4 commit rule);
 *   - stale requests are dropped and their bitmaps closed (DoD 17).
 */
import {
  PRIORITY_FOREGROUND,
  RenderAbortError,
  RenderStaleError,
  canCommit,
  isCropRequest,
  pageKeyOf,
  priorityLevelOf,
  type PdfPageMetrics,
  type PdfRenderDelivery,
  type PdfRenderHandle,
  type PdfRenderPool,
  type PdfRenderScheduler,
  type PdfRenderSchedulerOptions,
  type PdfSchedulerStats,
  type RenderBaseRequest,
  type RenderCropRequest,
  type RenderRequest,
} from './pdf-native-contract';
import { createPdfRenderPool } from './pdf-render-pool';

const PRIORITY_LEVELS = 4;

/** A submitted request. Lives in exactly one place: the priority queue while
 *  waiting, the active map while dispatched. resolve/reject settle the
 *  consumer handle exactly once. */
interface SchedulerEntry {
  request: RenderRequest;
  poolHandle: PdfRenderHandle | null;
  resolve: (delivery: PdfRenderDelivery) => void;
  reject: (error: Error) => void;
  settled: boolean;
}

export function createPdfRenderScheduler(options: PdfRenderSchedulerOptions = {}): PdfRenderScheduler {
  const pool = options.pool ?? createPdfRenderPool(options.poolOptions);
  const maxConcurrent = Math.max(1, Math.floor(options.maxConcurrent ?? pool.workerCount));
  const now = options.now ?? Date.now;

  /** One FIFO bucket per priority level (0 = P0 foreground … 3 = P3). */
  const queues: SchedulerEntry[][] = Array.from({ length: PRIORITY_LEVELS }, () => []);
  const active = new Map<string, SchedulerEntry>();
  const registered = new Set<string>();
  /** Latest generation seen per page (commit-rule activeGeneration). */
  const latestGenerationByPage = new Map<string, number>();
  /** Active page per run (commit-rule "pageIndex masih aktif"). */
  const activePageByRun = new Map<string, number>();
  /** Current foreground crop (queued or active) per page. */
  const foregroundByPage = new Map<string, string>();
  /** Run open promises so submits dispatch only after the doc is ready. */
  const openPromises = new Map<string, Promise<PdfPageMetrics>>();

  let disposed = false;

  const stats: PdfSchedulerStats = { queued: 0, active: 0, activeForeground: 0, dropped: 0, committed: 0 };

  const pageKey = (runId: string, pageIndex: number) => pageKeyOf(runId, pageIndex);

  const refreshStats = () => {
    stats.queued = queues.reduce((sum, q) => sum + q.length, 0);
    stats.active = active.size;
    stats.activeForeground = [...active.values()].filter(
      (e) => isCropRequest(e.request) && e.request.priority === 'foreground',
    ).length;
  };

  const clearForegroundRef = (request: RenderRequest) => {
    const key = pageKey(request.runId, request.pageIndex);
    if (foregroundByPage.get(key) === request.requestId) foregroundByPage.delete(key);
  };

  /** Remove a queued entry from its bucket (by identity). */
  const removeFromQueue = (entry: SchedulerEntry) => {
    const level = priorityLevelOf(entry.request);
    const bucket = queues[level];
    const index = bucket.indexOf(entry);
    if (index !== -1) bucket.splice(index, 1);
  };

  /** Drop a queued entry: unregister, reject the consumer, never dispatch. */
  const dropQueued = (entry: SchedulerEntry, error: Error) => {
    if (entry.settled) return;
    removeFromQueue(entry);
    registered.delete(entry.request.requestId);
    stats.dropped += 1;
    clearForegroundRef(entry.request);
    entry.settled = true;
    entry.reject(error);
  };

  /** Cancel an active entry: cancel the pool job, unregister, reject. */
  const cancelActive = (entry: SchedulerEntry, error: Error) => {
    if (entry.settled) return;
    entry.settled = true;
    active.delete(entry.request.requestId);
    registered.delete(entry.request.requestId);
    stats.dropped += 1;
    clearForegroundRef(entry.request);
    entry.poolHandle?.cancel();
    entry.reject(error);
  };

  /** Dispatch queued work up to maxConcurrent, highest priority first. */
  const dispatchNext = () => {
    if (disposed) return;
    for (let level = 0; level < PRIORITY_LEVELS && active.size < maxConcurrent; level += 1) {
      const bucket = queues[level];
      while (bucket.length > 0 && active.size < maxConcurrent) {
        const entry = bucket.shift()!;
        if (entry.settled) continue;
        const openPromise = openPromises.get(entry.request.runId);
        if (!openPromise) {
          dropQueued(entry, new Error('PDF document is not open'));
          continue;
        }
        active.set(entry.request.requestId, entry);
        // The pool render is issued once the run's document is ready.
        void openPromise.then(
          () => {
            if (disposed || entry.settled) return;
            const poolHandle =
              isCropRequest(entry.request)
                ? pool.renderCrop(entry.request as RenderCropRequest)
                : pool.renderBase(entry.request as RenderBaseRequest);
            entry.poolHandle = poolHandle;
            poolHandle.promise.then(
              (delivery) => onDelivery(entry, delivery),
              (error: Error) => onPoolError(entry, error),
            );
          },
          (error: Error) => onPoolError(entry, error),
        );
        refreshStats();
      }
    }
  };

  const onPoolError = (entry: SchedulerEntry, error: Error) => {
    if (entry.settled) return;
    entry.settled = true;
    active.delete(entry.request.requestId);
    registered.delete(entry.request.requestId);
    clearForegroundRef(entry.request);
    entry.reject(error);
    refreshStats();
    dispatchNext();
  };

  const onDelivery = (entry: SchedulerEntry, delivery: PdfRenderDelivery) => {
    if (entry.settled) return;
    const request = entry.request;
    const activeGeneration = latestGenerationByPage.get(pageKey(request.runId, request.pageIndex));
    const activePage = activePageByRun.get(request.runId);
    // The pool stamps generation 0; the commit rule compares against the
    // scheduler's activeGeneration for the page.
    const resultView = { ...delivery.result, generation: request.generation, requestId: request.requestId };
    if (!canCommit(resultView, activeGeneration, registered, activePage)) {
      // Stale: close the bitmap and never display it (DoD 9 + 17).
      const bitmap = delivery.claim();
      if (bitmap) {
        try {
          bitmap.close();
        } catch {
          // already closed
        }
      }
      entry.settled = true;
      active.delete(request.requestId);
      registered.delete(request.requestId);
      clearForegroundRef(request);
      stats.dropped += 1;
      entry.reject(new RenderStaleError('Stale generation result dropped'));
      refreshStats();
      dispatchNext();
      return;
    }
    // Commit: hand the delivery to the consumer with the caller's request
    // metadata stamped.
    const committedDelivery: PdfRenderDelivery = {
      result: resultView,
      claim: delivery.claim,
    };
    entry.settled = true;
    active.delete(request.requestId);
    registered.delete(request.requestId);
    clearForegroundRef(request);
    stats.committed += 1;
    entry.resolve(committedDelivery);
    refreshStats();
    dispatchNext();
  };

  const submit = (request: RenderRequest): PdfRenderHandle => {
    if (disposed) {
      return { promise: Promise.reject(new Error('PDF render scheduler disposed')), cancel: () => undefined };
    }
    if (registered.has(request.requestId)) {
      return {
        promise: Promise.reject(new Error(`Duplicate requestId ${request.requestId}`)),
        cancel: () => undefined,
      };
    }
    const key = pageKey(request.runId, request.pageIndex);
    const currentGen = latestGenerationByPage.get(key) ?? 0;
    if (request.generation < currentGen) {
      // This request is already older than the active generation: drop it
      // immediately (no bitmap exists yet, nothing to close).
      stats.dropped += 1;
      return {
        promise: Promise.reject(new RenderStaleError('Request older than active generation dropped')),
        cancel: () => undefined,
      };
    }

    // Latest-wins: bump the page's active generation, then drop every queued
    // request for the same page that is STRICTLY older. Same-generation
    // requests (e.g. base-first gen 1 + foreground crop gen 1) coexist: the
    // commit rule only requires equality with the active generation.
    latestGenerationByPage.set(key, request.generation);
    for (let level = 0; level < PRIORITY_LEVELS; level += 1) {
      for (const queued of [...queues[level]]) {
        if (
          queued.request.runId === request.runId &&
          queued.request.pageIndex === request.pageIndex &&
          queued.request.generation < request.generation
        ) {
          dropQueued(queued, new RenderStaleError('Superseded by a newer generation for the same page'));
        }
      }
    }

    // Max one foreground crop per page: a newer foreground crop supersedes
    // the previous one (queued or active) for the same page.
    if (isCropRequest(request) && request.priority === 'foreground') {
      const previous = foregroundByPage.get(key);
      if (previous && previous !== request.requestId) {
        const prevActive = active.get(previous);
        if (prevActive) {
          cancelActive(prevActive, new RenderStaleError('Superseded by a newer foreground crop for the same page'));
        } else {
          // A queued foreground crop was already dropped by the generation
          // sweep above; only the bookkeeping entry may remain.
          registered.delete(previous);
          stats.dropped += 1;
        }
      }
      foregroundByPage.set(key, request.requestId);
    }

    registered.add(request.requestId);
    let resolve!: (delivery: PdfRenderDelivery) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<PdfRenderDelivery>((res, rej) => { resolve = res; reject = rej; });
    const entry: SchedulerEntry = {
      request,
      poolHandle: null,
      resolve,
      reject,
      settled: false,
    };
    queues[priorityLevelOf(request)].push(entry);

    // When a P0 arrives and every slot is busy with background work, preempt
    // the lowest-priority active P2/P3 job to free a slot immediately.
    if (priorityLevelOf(request) === PRIORITY_FOREGROUND && active.size >= maxConcurrent) {
      preemptBackground();
    }

    refreshStats();
    dispatchNext();
    return {
      promise,
      cancel: () => {
        if (entry.settled) return;
        // If queued, remove; if active, cancel the pool job.
        if (active.get(request.requestId) === entry) {
          cancelActive(entry, new RenderAbortError());
        } else {
          dropQueued(entry, new RenderAbortError());
        }
        refreshStats();
        dispatchNext();
      },
    };
  };

  /** Cancel the lowest-priority active background job (P3 first, then P2).
   *  P1 base-first is never preempted (first useful paint must not be
   *  delayed); another P0 is never preempted (per-page foreground rule). */
  const preemptBackground = () => {
    let target: SchedulerEntry | null = null;
    for (const entry of active.values()) {
      if (entry.settled) continue;
      const level = priorityLevelOf(entry.request);
      if (level < 2) continue; // P0/P1 not preemptable
      if (!target || level > priorityLevelOf(target.request)) target = entry;
    }
    if (target) {
      cancelActive(target, new RenderStaleError('Preempted by a higher-priority foreground crop'));
    }
  };

  const open = (runId: string, pageIndex: number): Promise<PdfPageMetrics> => {
    if (disposed) return Promise.reject(new Error('PDF render scheduler disposed'));
    const existing = openPromises.get(runId);
    if (existing) {
      // Re-open is a no-op at the pool level; refresh the active page.
      activePageByRun.set(runId, pageIndex);
      return existing.then((metrics) => metrics);
    }
    const openPromise = pool.open(runId, pageIndex);
    openPromises.set(runId, openPromise);
    activePageByRun.set(runId, pageIndex);
    openPromise.catch(() => {
      if (openPromises.get(runId) === openPromise) openPromises.delete(runId);
    });
    return openPromise;
  };

  const getPageMetrics = (runId: string, pageIndex: number): Promise<PdfPageMetrics> => {
    if (disposed) return Promise.reject(new Error('PDF render scheduler disposed'));
    return pool.getPageMetrics(runId, pageIndex);
  };

  const setActivePage = (runId: string, pageIndex: number) => {
    activePageByRun.set(runId, pageIndex);
    // Drop queued work for non-active pages of the run; active results for
    // other pages will fail the commit rule ("pageIndex masih aktif").
    for (let level = 0; level < PRIORITY_LEVELS; level += 1) {
      for (const queued of [...queues[level]]) {
        if (queued.request.runId === runId && queued.request.pageIndex !== pageIndex) {
          dropQueued(queued, new RenderStaleError('Page is no longer active'));
        }
      }
    }
    refreshStats();
    dispatchNext();
  };

  const closeRun = (runId: string) => {
    for (let level = 0; level < PRIORITY_LEVELS; level += 1) {
      for (const queued of [...queues[level]]) {
        if (queued.request.runId === runId) {
          dropQueued(queued, new RenderAbortError('PDF run closed'));
        }
      }
    }
    for (const entry of [...active.values()]) {
      if (entry.request.runId === runId) {
        cancelActive(entry, new RenderAbortError('PDF run closed'));
      }
    }
    for (const key of [...latestGenerationByPage.keys()]) {
      if (key.startsWith(`${runId}:`)) latestGenerationByPage.delete(key);
    }
    for (const key of [...foregroundByPage.keys()]) {
      if (key.startsWith(`${runId}:`)) foregroundByPage.delete(key);
    }
    activePageByRun.delete(runId);
    openPromises.delete(runId);
    pool.closeRun(runId);
    refreshStats();
    dispatchNext();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const error = new RenderAbortError('PDF render scheduler disposed');
    for (let level = 0; level < PRIORITY_LEVELS; level += 1) {
      for (const queued of [...queues[level]]) {
        if (!queued.settled) {
          queued.settled = true;
          queued.reject(error);
        }
      }
      queues[level].length = 0;
    }
    for (const entry of [...active.values()]) {
      if (!entry.settled) {
        entry.settled = true;
        entry.poolHandle?.cancel();
        entry.reject(error);
      }
    }
    active.clear();
    registered.clear();
    foregroundByPage.clear();
    latestGenerationByPage.clear();
    activePageByRun.clear();
    openPromises.clear();
    pool.dispose();
    refreshStats();
  };

  return {
    open,
    getPageMetrics,
    setActivePage,
    submitBase: (request: RenderBaseRequest) => submit(request),
    submitCrop: (request: RenderCropRequest) => submit(request),
    closeRun,
    dispose,
    stats,
  };
}
