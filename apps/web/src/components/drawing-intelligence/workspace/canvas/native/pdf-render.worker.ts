/*
 * PAAX native PDF render worker — pdf-render.worker.ts
 *
 * Implements the render-base / render-crop wire protocol from
 * pdf-native-contract.ts. Responsibilities:
 *   - cache pdf.js getDocument per runId (safe against close-run races via
 *     a run generation guard);
 *   - OffscreenCanvas rendering with a document-canvas fallback;
 *   - dark-mode inversion (difference composite, mirrors legacy invertTile);
 *   - per-render cancellation and a worker-side timeout watchdog;
 *   - renderMs + estimatedBytes reporting for diagnostics/memory budget.
 *
 * There is intentionally NO FIFO queue here: priority scheduling is owned by
 * pdf-render-scheduler.ts (P0 > P1 > P2 > P3). The worker starts renders as
 * they arrive and cancels by requestId, so a slow background render can never
 * hold a foreground crop behind it.
 */
import * as pdfjs from 'pdfjs-dist';
import { estimatedBytesFor, type RenderRegion, type RenderWorkerInboundMessage, type RenderWorkerOutboundMessage } from './pdf-native-contract';

/** Worker-side watchdog for a single render (ms). The pool also enforces a
 *  round-trip deadline; this guards against a wedged pdf.js task holding the
 *  worker forever (DoD 15). */
const RENDER_TIMEOUT_MS = 30_000;

/** Canvas factory used by pdf.js. Prefers OffscreenCanvas (worker standard);
 *  falls back to document.createElement('canvas') when OffscreenCanvas is
 *  unavailable (some embedded/test environments). */
class NativeCanvasFactory {
  create(width: number, height: number): { canvas: OffscreenCanvas | HTMLCanvasElement; context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null } {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    return { canvas, context };
  }

  reset(target: { canvas: OffscreenCanvas | HTMLCanvasElement }, width: number, height: number): void {
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target: { canvas: OffscreenCanvas | HTMLCanvasElement | null; context: unknown }): void {
    target.canvas = null;
    target.context = null;
  }
}

class NativeFilterFactory {
  addFilter(): string { return 'none'; }
  addHCMFilter(): string { return 'none'; }
  addAlphaFilter(): string { return 'none'; }
  addLuminosityFilter(): string { return 'none'; }
  addHighlightHCMFilter(): string { return 'none'; }
  destroy(): void { /* no worker-side filter cache */ }
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error('No canvas implementation available (OffscreenCanvas missing)');
}

/** Dark-mode inversion: a `difference` composite against white flips
 *  luminance while preserving alpha (light-on-dark review). */
function invertCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): void {
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'difference';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

async function canvasToBitmap(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<ImageBitmap> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas && typeof canvas.transferToImageBitmap === 'function') {
    return canvas.transferToImageBitmap();
  }
  // Fallback path: createImageBitmap from a regular canvas element.
  return createImageBitmap(canvas);
}

interface PdfDocumentEntry {
  loadingTask: ReturnType<typeof pdfjs.getDocument>;
  document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  pages: Map<number, Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>['getPage']>>>;
}

interface ActiveRender {
  requestId: string;
  runId: string;
  cancel(): void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<RenderWorkerInboundMessage>) => void) | null;
};

/** getDocument cache per runId (task 2). A close-run bumps the generation so
 *  an in-flight open can never resurrect a destroyed document. */
const documentsByRun = new Map<string, PdfDocumentEntry>();
const runGenerations = new Map<string, number>();
const activeRenders = new Map<string, ActiveRender>();

function post(message: RenderWorkerOutboundMessage, transfer?: Transferable[]): void {
  scope.postMessage(message, transfer ?? []);
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

async function closeRun(runId: string): Promise<void> {
  runGenerations.set(runId, (runGenerations.get(runId) ?? 0) + 1);
  for (const [requestId, render] of [...activeRenders.entries()]) {
    if (render.runId !== runId) continue;
    if (render.timeoutHandle !== null) clearTimeout(render.timeoutHandle);
    render.cancel();
    activeRenders.delete(requestId);
  }
  const entry = documentsByRun.get(runId);
  if (entry) {
    documentsByRun.delete(runId);
    entry.pages.clear();
    await entry.document.destroy().catch(() => undefined);
  }
}

async function getOrFetchPage(entry: PdfDocumentEntry, pageIndex: number) {
  let page = entry.pages.get(pageIndex);
  if (!page) {
    page = await entry.document.getPage(pageIndex + 1); // pdf.js pages are 1-based
    entry.pages.set(pageIndex, page);
  }
  return page;
}

async function openDocument(message: Extract<RenderWorkerInboundMessage, { type: 'open-document' }>): Promise<void> {
  const runId = message.runId;
  const generation = runGenerations.get(runId) ?? 0;
  const existing = documentsByRun.get(runId);
  if (existing) {
    const page = await getOrFetchPage(existing, 0);
    if ((runGenerations.get(runId) ?? 0) !== generation) return;
    const viewport = page.getViewport({ scale: 1 });
    post({
      type: 'document-ready',
      runId,
      numPages: existing.document.numPages,
      width: viewport.width,
      height: viewport.height,
    });
    return;
  }

  let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined;
  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(message.data),
      verbosity: 0,
      CanvasFactory: new NativeCanvasFactory(),
      FilterFactory: new NativeFilterFactory(),
      ownerDocument: scope as unknown as Document,
    });
    const document = await loadingTask.promise;
    if ((runGenerations.get(runId) ?? 0) !== generation) {
      await loadingTask.destroy().catch(() => undefined);
      return;
    }
    documentsByRun.set(runId, { loadingTask, document, pages: new Map() });
    const page = await getOrFetchPage(documentsByRun.get(runId)!, 0);
    if ((runGenerations.get(runId) ?? 0) !== generation) {
      await closeRun(runId);
      return;
    }
    const viewport = page.getViewport({ scale: 1 });
    post({
      type: 'document-ready',
      runId,
      numPages: document.numPages,
      width: viewport.width,
      height: viewport.height,
    });
  } catch (error) {
    await loadingTask?.destroy().catch(() => undefined);
    if ((runGenerations.get(runId) ?? 0) === generation) {
      post({ type: 'document-error', runId, message: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function getPageMetrics(message: Extract<RenderWorkerInboundMessage, { type: 'get-page-metrics' }>): Promise<void> {
  const entry = documentsByRun.get(message.runId);
  if (!entry) {
    post({ type: 'page-metrics-error', requestId: message.requestId, runId: message.runId, message: 'PDF document is not open' });
    return;
  }
  try {
    const page = await getOrFetchPage(entry, message.pageIndex);
    const viewport = page.getViewport({ scale: 1 });
    post({
      type: 'page-metrics',
      requestId: message.requestId,
      runId: message.runId,
      pageIndex: message.pageIndex,
      width: viewport.width,
      height: viewport.height,
    });
  } catch (error) {
    post({ type: 'page-metrics-error', requestId: message.requestId, runId: message.runId, message: error instanceof Error ? error.message : String(error) });
  }
}

function cancelRender(requestId: string): void {
  const render = activeRenders.get(requestId);
  if (!render) return;
  if (render.timeoutHandle !== null) clearTimeout(render.timeoutHandle);
  render.cancel();
  activeRenders.delete(requestId);
}

/**
 * Shared render path for base and crop.
 *  - base (region === null): full page. The region is derived from the page
 *    viewport at scale 1 (PDF points), canvas = round(pagePt × density), and
 *    no transform offset is applied.
 *  - crop (region provided): region in PDF points, canvas = round(region ×
 *    density), transform shifts the scaled page so the region origin lands at
 *    canvas (0,0).
 * Mirrors the proven legacy tile transform contract (region × scale in
 * device px, viewport scale = density).
 */
async function runRender(
  runId: string,
  requestId: string,
  pageIndex: number,
  region: RenderRegion | null,
  density: number,
  darkMode: boolean,
): Promise<void> {
  const entry = documentsByRun.get(runId);
  if (!entry) {
    post({ type: 'render-error', requestId, runId, message: 'PDF document is not open' });
    return;
  }
  const started = nowMs();
  try {
    const page = await getOrFetchPage(entry, pageIndex);
    const fullPage = region ?? (() => {
      const vp1 = page.getViewport({ scale: 1 });
      return { x: 0, y: 0, width: vp1.width, height: vp1.height };
    })();
    const widthPx = Math.max(1, Math.round(fullPage.width * density));
    const heightPx = Math.max(1, Math.round(fullPage.height * density));
    const canvas = createCanvas(widthPx, heightPx);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context unavailable');
    const renderTask = page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport: page.getViewport({ scale: density }),
      // Crop offset in device px (region × density); base renders the full
      // page at the canvas origin.
      transform: [1, 0, 0, 1, -fullPage.x * density, -fullPage.y * density],
    });
    const render: ActiveRender = {
      requestId,
      runId,
      cancel: () => renderTask.cancel(),
      timeoutHandle: null,
    };
    render.timeoutHandle = setTimeout(() => {
      if (activeRenders.get(requestId) === render) {
        render.cancel();
        activeRenders.delete(requestId);
        post({ type: 'render-error', requestId, runId, message: 'Render timed out', code: 'timeout' });
      }
    }, RENDER_TIMEOUT_MS);
    activeRenders.set(requestId, render);

    await renderTask.promise;
    if (activeRenders.get(requestId) !== render) return; // cancelled while rendering
    if (render.timeoutHandle !== null) clearTimeout(render.timeoutHandle);
    activeRenders.delete(requestId);

    if (darkMode) invertCanvas(canvas);
    const bitmap = await canvasToBitmap(canvas);
    const renderMs = nowMs() - started;
    post(
      {
        type: 'render-result',
        requestId,
        runId,
        pageIndex,
        region: fullPage,
        density,
        widthPx,
        heightPx,
        renderMs,
        estimatedBytes: estimatedBytesFor(widthPx, heightPx),
        bitmap,
      },
      [bitmap],
    );
  } catch (error) {
    const stillActive = activeRenders.get(requestId);
    if (stillActive && stillActive.timeoutHandle !== null) clearTimeout(stillActive.timeoutHandle);
    activeRenders.delete(requestId);
    if (error instanceof Error && error.name === 'RenderingCancelledException') {
      return; // cancellation is not an error; pool already settled the handle
    }
    post({ type: 'render-error', requestId, runId, message: error instanceof Error ? error.message : String(error) });
  }
}

scope.onmessage = (event: MessageEvent<RenderWorkerInboundMessage>) => {
  const message = event.data;
  if (message.type === 'open-document') void openDocument(message);
  if (message.type === 'get-page-metrics') void getPageMetrics(message);
  if (message.type === 'render-base') {
    void runRender(
      message.runId,
      message.requestId,
      message.pageIndex,
      // null region = full-page base; the worker derives the page region.
      null,
      message.density,
      message.darkMode,
    );
  }
  if (message.type === 'render-crop') {
    void runRender(
      message.runId,
      message.requestId,
      message.pageIndex,
      message.region,
      message.density,
      message.darkMode,
    );
  }
  if (message.type === 'cancel') cancelRender(message.requestId);
  if (message.type === 'close-run') void closeRun(message.runId);
};
