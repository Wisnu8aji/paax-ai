// pdf.js is supplied by the Apache-2.0 `pdfjs-dist` package dependency.
import * as pdfjs from 'pdfjs-dist';

type OpenMessage = {
  type: 'open-document';
  documentKey: string;
  pageNumber: number;
  url: string;
  rangeChunkSize: number;
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
type IncomingMessage = OpenMessage | RenderMessage | CloseMessage | CancelMessage;

interface PdfDocumentEntry {
  loadingTask: ReturnType<typeof pdfjs.getDocument>;
  document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  pageNumber: number;
  chain: Promise<void>;
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
const documents = new Map<string, PdfDocumentEntry>();
const cancelled = new Set<number>();
const renderTasks = new Map<number, { documentKey: string; cancel(): void }>();

function post(message: unknown, transfer?: Transferable[]): void {
  scope.postMessage(message, transfer ?? []);
}

async function closeDocument(documentKey: string): Promise<void> {
  const entry = documents.get(documentKey);
  if (!entry) return;
  documents.delete(documentKey);
  for (const [requestId, task] of renderTasks) {
    if (task.documentKey === documentKey) {
      cancelled.add(requestId);
      task.cancel();
    }
  }
  // PDFDocumentProxy.destroy delegates to its loadingTask.destroy(), so this
  // single idempotent lifecycle call releases both without a double destroy.
  await entry.document.destroy();
}

async function openDocument(message: OpenMessage): Promise<void> {
  await closeDocument(message.documentKey);
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined;
  try {
    loadingTask = pdfjs.getDocument({
      url: message.url,
      rangeChunkSize: message.rangeChunkSize,
      disableRange: false,
      disableStream: true,
      disableAutoFetch: true,
      verbosity: 0,
      CanvasFactory: WorkerCanvasFactory,
      FilterFactory: WorkerFilterFactory,
      ownerDocument: scope as unknown as Document,
    });
    const document = await loadingTask.promise;
    documents.set(message.documentKey, { loadingTask, document, pageNumber: message.pageNumber, chain: Promise.resolve() });
    post({ type: 'document-ready', documentKey: message.documentKey });
  } catch (error) {
    await loadingTask?.destroy().catch(() => undefined);
    post({ type: 'document-error', documentKey: message.documentKey, message: String(error) });
  }
}

async function renderTile(message: RenderMessage): Promise<void> {
  const entry = documents.get(message.documentKey);
  if (!entry) {
    post({ type: 'tile-error', requestId: message.requestId, documentKey: message.documentKey, message: 'PDF document is not open' });
    return;
  }
  const render = async () => {
    try {
    const page = await entry.document.getPage(message.pageNumber);
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
  // pdf.js does not permit overlapping page.render() calls for one document
  // in a worker. The pool round-robins workers, then this chain serializes
  // requests once a worker is selected again.
  entry.chain = entry.chain.then(render, render);
  await entry.chain;
}

scope.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (message.type === 'open-document') void openDocument(message);
  if (message.type === 'render-tile') void renderTile(message);
  if (message.type === 'close-document') void closeDocument(message.documentKey);
  if (message.type === 'cancel') {
    cancelled.add(message.requestId);
    renderTasks.get(message.requestId)?.cancel();
  }
};
