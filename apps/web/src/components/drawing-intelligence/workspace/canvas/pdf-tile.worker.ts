// pdf.js is supplied by the Apache-2.0 `pdfjs-dist` package dependency.
import * as pdfjs from 'pdfjs-dist';
import { PdfTileWorkerQueue } from './pdf-tile-worker-queue';

type OpenMessage = {
  type: 'open-document';
  documentKey: string;
  pageNumber: number;
  data: ArrayBuffer;
};
type GetPageMetricsMessage = {
  type: 'get-page-metrics';
  requestId: number;
  documentKey: string;
  pageNumber: number;
};
type RenderMessage = {
  type: 'render-tile';
  requestId: number;
  documentKey: string;
  pageNumber: number;
  tile: { x: number; y: number; width: number; height: number; density: number };
  /**
   * Optional arbitrary render scale (device px per PDF point), uncapped by the
   * pyramid. When present it replaces the legacy density-based scale for this
   * render; when absent the legacy `tile.density` semantics apply unchanged.
   * Protocol extension contract: pdf-tile-protocol (F1); local alias here until
   * F4 reconciles the type.
   */
  scale?: number;
  /** Optional dark-mode flag: invert the rendered tile after painting. */
  dark?: boolean;
};
type CloseMessage = { type: 'close-document'; documentKey: string };
type CloseRunMessage = { type: 'close-run'; runId: string };
type CancelMessage = { type: 'cancel'; requestId: number; documentKey: string };
type IncomingMessage = OpenMessage | GetPageMetricsMessage | RenderMessage | CloseMessage | CloseRunMessage | CancelMessage;

interface PdfDocumentEntry {
  loadingTask: ReturnType<typeof pdfjs.getDocument>;
  document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  pages: Map<number, Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>['getPage']>>>;
  renderQueue: PdfTileWorkerQueue<RenderMessage>;
  activeRenders: number;
  refCount: number;
}

/**
 * pdf.js serializes renders per canvas; each tile uses a fresh OffscreenCanvas,
 * so concurrent renders on the same page are safe. A small FIFO queue with 2
 * concurrent slots per worker cuts sequential pop-in time without racing.
 */
const MAX_RENDER_CONCURRENCY = 2;

class WorkerCanvasFactory {
  create(width: number, height: number) {
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(target: { canvas: OffscreenCanvas }, width: number, height: number) {
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target: { canvas: OffscreenCanvas | null; context: unknown }) {
    if (target.canvas) {
      target.canvas.width = 0;
      target.canvas.height = 0;
    }
    target.canvas = null;
    target.context = null;
  }
}

class WorkerFilterFactory {
  addFilter() { return 'none'; }
  addHCMFilter() { return 'none'; }
  addAlphaFilter() { return 'none'; }
  addLuminosityFilter() { return 'none'; }
  addHighlightHCMFilter() { return 'none'; }
  destroy() { /* no worker-side filter cache */ }
}

/**
 * Inverts a rendered tile in place for dark-mode review. Mirrors OpenTakeOff's
 * invertOffscreen: a `difference` composite against white flips luminance while
 * preserving alpha, so the rasterized drawing reads as light-on-dark.
 */
function invertTile(canvas: OffscreenCanvas): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'difference';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

/**
 * Resolves the render scale for a tile request. The extended protocol allows an
 * arbitrary uncapped `scale` (device px per PDF point); when absent the legacy
 * density-based semantics apply unchanged. This is the single translation point
 * that keeps backward compatibility testable in isolation.
 */
export function resolveRenderScale(message: Pick<RenderMessage, 'scale'> & { tile: { density: number } }): number {
  return message.scale !== undefined && Number.isFinite(message.scale) ? message.scale : message.tile.density;
}

const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<IncomingMessage>) => void) | null;
};
const documentsByRun = new Map<string, PdfDocumentEntry>();
const documentAliases = new Map<string, string>();
const renderTasks = new Map<number, { documentKey: string; cancel(): void }>();
// Monotonic per-run generation: an open that started before closeRun must not
// resurrect a destroyed entry after its awaits resume.
const runGenerations = new Map<string, number>();

function post(message: unknown, transfer?: Transferable[]): void {
  scope.postMessage(message, transfer ?? []);
}

function extractRunId(documentKey: string): string {
  const idx = documentKey.indexOf(':');
  return idx !== -1 ? documentKey.substring(0, idx) : documentKey;
}

async function closeDocument(documentKey: string): Promise<void> {
  const runId = extractRunId(documentKey);
  const entry = documentsByRun.get(runId);
  for (const [requestId, task] of [...renderTasks.entries()]) {
    if (task.documentKey === documentKey || extractRunId(task.documentKey) === runId) {
      entry?.renderQueue.cancel(requestId);
      task.cancel();
    }
  }

  documentAliases.delete(documentKey);

  if (entry) {
    // Drop queued renders of this run so a closed document cannot keep an
    // unbounded backlog of dead work in the FIFO queue.
    entry.renderQueue.removeDocument(documentKey, runId);
  }
}

async function closeRun(runId: string): Promise<void> {
  // Invalidate an in-flight open even when it has not created an entry yet.
  // Otherwise closeRun during pdfjs loading can let that stale open resurrect
  // the destroyed run after its await completes.
  runGenerations.set(runId, (runGenerations.get(runId) ?? 0) + 1);
  const entry = documentsByRun.get(runId);
  for (const [requestId, task] of [...renderTasks.entries()]) {
    if (extractRunId(task.documentKey) === runId) {
      entry?.renderQueue.cancel(requestId);
      task.cancel();
    }
  }

  for (const [documentKey, aliasRun] of [...documentAliases.entries()]) {
    if (aliasRun === runId || extractRunId(documentKey) === runId) {
      documentAliases.delete(documentKey);
    }
  }

  if (entry) {
    documentsByRun.delete(runId);
    entry.renderQueue.removeDocument(runId, runId);
    entry.pages.clear();
    await entry.document.destroy();
  }
}

async function getOrFetchPage(entry: PdfDocumentEntry, pageNumber: number) {
  let page = entry.pages.get(pageNumber);
  if (!page) {
    page = await entry.document.getPage(pageNumber);
    entry.pages.set(pageNumber, page);
  }
  return page;
}

async function openDocument(message: OpenMessage): Promise<void> {
  const runId = extractRunId(message.documentKey);
  const generation = runGenerations.get(runId) ?? 0;
  documentAliases.set(message.documentKey, runId);

  let entry = documentsByRun.get(runId);
  if (entry) {
    try {
      const page = await getOrFetchPage(entry, message.pageNumber);
      if (runGenerations.get(runId) !== generation) return;
      const viewport = page.getViewport({ scale: 1 });
      post({
        type: 'document-ready',
        documentKey: message.documentKey,
        numPages: entry.document.numPages,
        metrics: { width: viewport.width, height: viewport.height, rotation: viewport.rotation },
      });
    } catch (error) {
      if (runGenerations.get(runId) === generation) {
        post({ type: 'document-error', documentKey: message.documentKey, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return;
  }

  let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined;
  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(message.data),
      verbosity: 0,
      CanvasFactory: WorkerCanvasFactory,
      FilterFactory: WorkerFilterFactory,
      ownerDocument: scope as unknown as Document,
    });
    const document = await loadingTask.promise;
    if ((runGenerations.get(runId) ?? 0) !== generation) {
      await loadingTask.destroy().catch(() => undefined);
      return;
    }
    entry = {
      loadingTask,
      document,
      pages: new Map(),
      renderQueue: new PdfTileWorkerQueue<RenderMessage>(),
      activeRenders: 0,
      refCount: 1,
    };
    documentsByRun.set(runId, entry);

    const page = await getOrFetchPage(entry, message.pageNumber);
    if ((runGenerations.get(runId) ?? 0) !== generation) {
      documentsByRun.delete(runId);
      await entry.document.destroy().catch(() => undefined);
      return;
    }
    const viewport = page.getViewport({ scale: 1 });
    post({
      type: 'document-ready',
      documentKey: message.documentKey,
      numPages: document.numPages,
      metrics: { width: viewport.width, height: viewport.height, rotation: viewport.rotation },
    });
  } catch (error) {
    await loadingTask?.destroy().catch(() => undefined);
    if ((runGenerations.get(runId) ?? 0) === generation) {
      post({ type: 'document-error', documentKey: message.documentKey, message: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function getPageMetrics(message: GetPageMetricsMessage): Promise<void> {
  const runId = extractRunId(message.documentKey);
  const entry = documentsByRun.get(runId);
  if (!entry) {
    post({ type: 'page-metrics-error', requestId: message.requestId, documentKey: message.documentKey, message: 'PDF document is not open' });
    return;
  }
  try {
    const page = await getOrFetchPage(entry, message.pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    post({
      type: 'page-metrics',
      requestId: message.requestId,
      documentKey: message.documentKey,
      pageNumber: message.pageNumber,
      metrics: { width: viewport.width, height: viewport.height, rotation: viewport.rotation },
    });
  } catch (error) {
    post({ type: 'page-metrics-error', requestId: message.requestId, documentKey: message.documentKey, message: error instanceof Error ? error.message : String(error) });
  }
}

async function renderTile(message: RenderMessage): Promise<void> {
  const runId = extractRunId(message.documentKey);
  const entry = documentsByRun.get(runId);
  if (!entry) {
    post({ type: 'tile-error', requestId: message.requestId, documentKey: message.documentKey, message: 'PDF document is not open' });
    return;
  }
  entry.renderQueue.enqueue(message);
  pumpRenders(entry);
}

function pumpRenders(entry: PdfDocumentEntry): void {
  while (entry.activeRenders < MAX_RENDER_CONCURRENCY) {
    const message = entry.renderQueue.take();
    if (!message) break;
    entry.activeRenders += 1;
    void runSingleRender(entry, message).finally(() => {
      entry.activeRenders -= 1;
      pumpRenders(entry);
    });
  }
}

async function runSingleRender(entry: PdfDocumentEntry, message: RenderMessage): Promise<void> {
  try {
    const page = await getOrFetchPage(entry, message.pageNumber);
    if (entry.renderQueue.isCancelled(message.requestId)) return;
    const canvas = new OffscreenCanvas(message.tile.width, message.tile.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas 2D context unavailable');
    // Extended protocol: arbitrary uncapped scale wins; legacy density-based
    // renders fall back to `tile.density` unchanged (backward compatible).
    const renderScale = resolveRenderScale(message);
    const renderTask = page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport: page.getViewport({ scale: renderScale }),
      transform: [1, 0, 0, 1, -message.tile.x, -message.tile.y],
    });
    renderTasks.set(message.requestId, { documentKey: message.documentKey, cancel: () => renderTask.cancel() });
    await renderTask.promise;
    renderTasks.delete(message.requestId);
    if (entry.renderQueue.isCancelled(message.requestId)) return;
    if (message.dark) invertTile(canvas);
    const bitmap = canvas.transferToImageBitmap();
    post({ type: 'tile', requestId: message.requestId, documentKey: message.documentKey, width: message.tile.width, height: message.tile.height, bitmap }, [bitmap]);
  } catch (error) {
    renderTasks.delete(message.requestId);
    if (!entry.renderQueue.isCancelled(message.requestId)) {
      post({ type: 'tile-error', requestId: message.requestId, documentKey: message.documentKey, message: String(error) });
    }
  } finally {
    entry.renderQueue.complete(message.requestId);
  }
}

scope.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (message.type === 'open-document') void openDocument(message);
  if (message.type === 'get-page-metrics') void getPageMetrics(message);
  if (message.type === 'render-tile') void renderTile(message);
  if (message.type === 'close-document') void closeDocument(message.documentKey);
  if (message.type === 'close-run') void closeRun(message.runId);
  if (message.type === 'cancel') {
    const entry = documentsByRun.get(extractRunId(message.documentKey));
    entry?.renderQueue.cancel(message.requestId);
    renderTasks.get(message.requestId)?.cancel();
  }
};
