import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Worker-level protocol tests. The worker module is loaded under stubbed
// worker globals (`self`) and a mocked pdfjs-dist so the onmessage dispatcher
// and the render path can be exercised without a real PDF.

const { getDocumentMock, postMock, selfScope } = vi.hoisted(() => {
  const getDocumentMock = vi.fn();
  const postMock = vi.fn();
  const selfScope = { postMessage: postMock, onmessage: null as ((event: { data: unknown }) => void) | null };
  return { getDocumentMock, postMock, selfScope };
});

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: getDocumentMock,
}));

interface FakeRenderTask {
  promise: Promise<void>;
  cancel: ReturnType<typeof vi.fn>;
}

interface FakePage {
  getViewport: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
}

interface FakeDocument {
  numPages: number;
  getPage: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

class FakeOffscreenCanvas {
  static instances: FakeOffscreenCanvas[] = [];
  width: number;
  height: number;
  ctx = {
    save: vi.fn(),
    setTransform: vi.fn(),
    globalCompositeOperation: '',
    fillStyle: '',
    fillRect: vi.fn(),
    restore: vi.fn(),
  };
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    FakeOffscreenCanvas.instances.push(this);
  }
  getContext(): unknown {
    return this.ctx;
  }
  transferToImageBitmap(): unknown {
    return { __fakeBitmap: true };
  }
}

const mockPdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]).buffer;

function makePage(renderPromise?: Promise<void>): FakePage {
  const render = vi.fn((): FakeRenderTask => ({
    promise: renderPromise ?? Promise.resolve(),
    cancel: vi.fn(),
  }));
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({ width: 100 * scale, height: 200 * scale, rotation: 0 }));
  return { getViewport, render };
}

function makeDocument(page: FakePage): FakeDocument {
  return {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue(page),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const openMessage = {
  type: 'open-document' as const,
  documentKey: 'run-1:A-101',
  pageNumber: 1,
  data: mockPdfBuffer,
};

const legacyTileMessage = {
  type: 'render-tile' as const,
  requestId: 1,
  documentKey: 'run-1:A-101',
  pageNumber: 1,
  tile: { x: 0, y: 0, width: 512, height: 512, density: 2 },
};

const dispatch = (message: unknown) => {
  selfScope.onmessage?.({ data: message });
};

describe('pdf-tile.worker protocol', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeOffscreenCanvas.instances = [];
    getDocumentMock.mockReset();
    postMock.mockReset();
    selfScope.onmessage = null;
    vi.stubGlobal('self', selfScope);
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadWorkerAndOpen(page: FakePage): Promise<void> {
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeDocument(page)), destroy: vi.fn().mockResolvedValue(undefined) });
    await import('./pdf-tile.worker');
    expect(typeof selfScope.onmessage).toBe('function');
    dispatch(openMessage);
    await flush();
    await flush();
  }

  it('legacy density-based render-tile posts a tile at tile.density without dark inversion', async () => {
    const page = makePage();
    await loadWorkerAndOpen(page);

    dispatch(legacyTileMessage);
    await flush();
    await flush();

    expect(page.getViewport).toHaveBeenCalledWith({ scale: 2 });
    const tilePost = postMock.mock.calls.find(([message]) => (message as { type?: string }).type === 'tile');
    expect(tilePost).toBeDefined();
    const tile = tilePost![0] as { requestId: number; width: number; height: number; bitmap: unknown };
    expect(tile.requestId).toBe(1);
    expect(tile.width).toBe(512);
    expect(tile.height).toBe(512);
    expect(tile.bitmap).toEqual({ __fakeBitmap: true });
    // No inversion for legacy messages.
    const canvas = FakeOffscreenCanvas.instances.at(-1);
    expect(canvas?.ctx.fillRect).not.toHaveBeenCalled();
  });

  it('extended render-tile with arbitrary uncapped scale renders at exactly that scale', async () => {
    const page = makePage();
    await loadWorkerAndOpen(page);

    dispatch({ ...legacyTileMessage, requestId: 7, scale: 17.3 });
    await flush();
    await flush();

    expect(page.getViewport).toHaveBeenCalledWith({ scale: 17.3 });
    const tilePost = postMock.mock.calls.find(([message]) => (message as { type?: string }).type === 'tile');
    expect((tilePost![0] as { requestId: number }).requestId).toBe(7);
  });

  it('extended render-tile with dark flag inverts the canvas before transfer', async () => {
    const page = makePage();
    await loadWorkerAndOpen(page);

    dispatch({ ...legacyTileMessage, requestId: 3, dark: true });
    await flush();
    await flush();

    const canvas = FakeOffscreenCanvas.instances.at(-1);
    expect(canvas).toBeDefined();
    const ctx = canvas!.ctx;
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(ctx.globalCompositeOperation).toBe('difference');
    expect(ctx.fillStyle).toBe('#fff');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 512, 512);
    const tilePost = postMock.mock.calls.find(([message]) => (message as { type?: string }).type === 'tile');
    expect(tilePost).toBeDefined();
  });

  it('cancel mid-render suppresses the tile post and cancels the pdf.js task', async () => {
    let resolveRender!: () => void;
    const renderPromise = new Promise<void>((resolve) => { resolveRender = resolve; });
    const page = makePage(renderPromise);
    await loadWorkerAndOpen(page);

    dispatch(legacyTileMessage);
    await flush();

    const renderTask = page.render.mock.results[0].value as FakeRenderTask;
    dispatch({ type: 'cancel', requestId: 1, documentKey: 'run-1:A-101' });
    expect(renderTask.cancel).toHaveBeenCalled();

    resolveRender();
    await flush();
    await flush();

    const tilePost = postMock.mock.calls.find(([message]) => (message as { type?: string }).type === 'tile');
    expect(tilePost).toBeUndefined();
  });

  it('first-open posts document-ready and does not destroy the fresh document (generation-guard regression)', async () => {
    const page = makePage();
    await loadWorkerAndOpen(page);

    const readyPost = postMock.mock.calls.find(([message]) => (message as { type?: string }).type === 'document-ready');
    expect(readyPost).toBeDefined();
    const ready = readyPost![0] as { documentKey: string; numPages: number; metrics: { width: number; height: number; rotation: number } };
    expect(ready.documentKey).toBe('run-1:A-101');
    expect(ready.numPages).toBe(1);
    expect(ready.metrics).toEqual({ width: 100, height: 200, rotation: 0 });

    // The freshly loaded document must be kept alive and cached for renders,
    // never destroyed by the first-open guard.
    const doc = await (getDocumentMock.mock.results[0].value.promise as Promise<FakeDocument>);
    expect(doc.destroy).not.toHaveBeenCalled();

    // The run must be immediately usable: a legacy render still posts a tile.
    dispatch(legacyTileMessage);
    await flush();
    await flush();
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 2 });
    const tilePost = postMock.mock.calls.find(([message]) => (message as { type?: string }).type === 'tile');
    expect(tilePost).toBeDefined();
    expect((tilePost![0] as { requestId: number }).requestId).toBe(1);
  });

  it('close-run destroys the cached document', async () => {
    const page = makePage();
    await loadWorkerAndOpen(page);

    dispatch({ type: 'close-run', runId: 'run-1' });
    await flush();

    const doc = getDocumentMock.mock.results[0].value.promise as unknown as Promise<FakeDocument>;
    const resolved = await doc;
    expect(resolved.destroy).toHaveBeenCalled();
  });

  it('document-error is posted when pdf.js open fails', async () => {
    getDocumentMock.mockReturnValue({ promise: Promise.reject(new Error('bad pdf')), destroy: vi.fn().mockResolvedValue(undefined) });
    await import('./pdf-tile.worker');
    dispatch(openMessage);
    await flush();
    await flush();

    const errorPost = postMock.mock.calls.find(([message]) => (message as { type?: string }).type === 'document-error');
    expect(errorPost).toBeDefined();
    expect((errorPost![0] as { message: string }).message).toBe('bad pdf');
  });
});

describe('resolveRenderScale', () => {
  async function loadWorkerModule(): Promise<typeof import('./pdf-tile.worker')> {
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeDocument(makePage())), destroy: vi.fn().mockResolvedValue(undefined) });
    const mod = await import('./pdf-tile.worker');
    expect(typeof selfScope.onmessage).toBe('function');
    return mod;
  }

  it('falls back to legacy density when scale is absent', async () => {
    const mod = await loadWorkerModule();
    expect(mod.resolveRenderScale({ tile: { density: 0.5 } })).toBe(0.5);
    expect(mod.resolveRenderScale({ tile: { density: 8 } })).toBe(8);
  });

  it('uses arbitrary uncapped scale when present', async () => {
    const mod = await loadWorkerModule();
    expect(mod.resolveRenderScale({ tile: { density: 2 }, scale: 64 })).toBe(64);
    expect(mod.resolveRenderScale({ tile: { density: 2 }, scale: 0.03 })).toBe(0.03);
  });
});
