// pdf.js is supplied by the Apache-2.0 `pdfjs-dist` package dependency.
import * as pdfjs from 'pdfjs-dist';

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
};
type CloseMessage = { type: 'close-document'; documentKey: string };
type CancelMessage = { type: 'cancel'; requestId: number };
type IncomingMessage = OpenMessage | GetPageMetricsMessage | RenderMessage | CloseMessage | CancelMessage;

interface PdfDocumentEntry {
  loadingTask: ReturnType<typeof pdfjs.getDocument>;
  document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  pages: Map<number, Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>['getPage']>>>;
  chain: Promise<void>;
  refCount: number;
}

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

const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<IncomingMessage>) => void) | null;
};
const documentsByRun = new Map<string, PdfDocumentEntry>();
const documentAliases = new Map<string, string>();
const cancelled = new Set<number>();
const renderTasks = new Map<number, { documentKey: string; cancel(): void }>();

function post(message: unknown, transfer?: Transferable[]): void {
  scope.postMessage(message, transfer ?? []);
}

function extractRunId(documentKey: string): string {
  const idx = documentKey.indexOf(':');
  return idx !== -1 ? documentKey.substring(0, idx) : documentKey;
}

async function closeDocument(documentKey: string, forceDestroy = false): Promise<void> {
  const runId = extractRunId(documentKey);
  for (const [requestId, task] of [...renderTasks.entries()]) {
    if (task.documentKey === documentKey || extractRunId(task.documentKey) === runId) {
      cancelled.add(requestId);
      task.cancel();
    }
  }

  documentAliases.delete(documentKey);

  const entry = documentsByRun.get(runId);
  if (!entry) return;

  if (forceDestroy) {
    documentsByRun.delete(runId);
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
  documentAliases.set(message.documentKey, runId);

  let entry = documentsByRun.get(runId);
  if (entry) {
    try {
      const page = await getOrFetchPage(entry, message.pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      post({
        type: 'document-ready',
        documentKey: message.documentKey,
        numPages: entry.document.numPages,
        metrics: { width: viewport.width, height: viewport.height, rotation: viewport.rotation },
      });
    } catch (error) {
      post({ type: 'document-error', documentKey: message.documentKey, message: error instanceof Error ? error.message : String(error) });
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
    entry = {
      loadingTask,
      document,
      pages: new Map(),
      chain: Promise.resolve(),
      refCount: 1,
    };
    documentsByRun.set(runId, entry);

    const page = await getOrFetchPage(entry, message.pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    post({
      type: 'document-ready',
      documentKey: message.documentKey,
      numPages: document.numPages,
      metrics: { width: viewport.width, height: viewport.height, rotation: viewport.rotation },
    });
  } catch (error) {
    await loadingTask?.destroy().catch(() => undefined);
    post({ type: 'document-error', documentKey: message.documentKey, message: error instanceof Error ? error.message : String(error) });
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
  const render = async () => {
    try {
      const page = await getOrFetchPage(entry, message.pageNumber);
      if (cancelled.has(message.requestId)) return;
      const canvas = new OffscreenCanvas(message.tile.width, message.tile.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('OffscreenCanvas 2D context unavailable');
      const renderTask = page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport: page.getViewport({ scale: message.tile.density }),
        transform: [1, 0, 0, 1, -message.tile.x, -message.tile.y],
      });
      renderTasks.set(message.requestId, { documentKey: message.documentKey, cancel: () => renderTask.cancel() });
      await renderTask.promise;
      renderTasks.delete(message.requestId);
      if (cancelled.has(message.requestId)) return;
      const bitmap = canvas.transferToImageBitmap();
      post({ type: 'tile', requestId: message.requestId, documentKey: message.documentKey, width: message.tile.width, height: message.tile.height, bitmap }, [bitmap]);
    } catch (error) {
      renderTasks.delete(message.requestId);
      if (!cancelled.has(message.requestId)) {
        post({ type: 'tile-error', requestId: message.requestId, documentKey: message.documentKey, message: String(error) });
      }
    } finally {
      cancelled.delete(message.requestId);
    }
  };
  entry.chain = entry.chain.then(render, render);
  await entry.chain;
}

scope.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (message.type === 'open-document') void openDocument(message);
  if (message.type === 'get-page-metrics') void getPageMetrics(message);
  if (message.type === 'render-tile') void renderTile(message);
  if (message.type === 'close-document') void closeDocument(message.documentKey);
  if (message.type === 'cancel') {
    cancelled.add(message.requestId);
    renderTasks.get(message.requestId)?.cancel();
  }
};
