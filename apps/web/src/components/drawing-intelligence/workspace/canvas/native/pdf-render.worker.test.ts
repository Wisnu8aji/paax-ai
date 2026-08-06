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
    return { __fakeBitmap: true, width: this.width, height: this.height, close: vi.fn() };
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

function makeDocument(page: FakePage, destroyMock?: ReturnType<typeof vi.fn>): FakeDocument {
  return {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue(page),
    destroy: destroyMock ?? vi.fn().mockResolvedValue(undefined),
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const dispatch = (message: unknown) => {
  selfScope.onmessage?.({ data: message });
};

describe('pdf-render.worker protocol', () => {
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

  async function loadWorkerAndOpen(): Promise<FakePage> {
    const page = makePage();
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeDocument(page)), destroy: vi.fn().mockResolvedValue(undefined) });
    await import('./pdf-render.worker');
    expect(typeof selfScope.onmessage).toBe('function');
    dispatch({ type: 'open-document', runId: 'run-1', data: mockPdfBuffer });
    await flush();
    return page;
  }

  it('opens a document and reports page metrics at scale 1', async () => {
    const page = await loadWorkerAndOpen();
    expect(getDocumentMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'document-ready', runId: 'run-1', numPages: 1, width: 100, height: 200 }),
      [],
    );
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 1 });
  });

  it('caches getDocument per runId across open requests', async () => {
    await loadWorkerAndOpen();
    dispatch({ type: 'open-document', runId: 'run-1', data: mockPdfBuffer });
    await flush();
    expect(getDocumentMock).toHaveBeenCalledTimes(1);
  });

  it('renders a full-page base with density-scaled bitmap and reports renderMs/bytes', async () => {
    await loadWorkerAndOpen();
    dispatch({
      type: 'render-base',
      requestId: 'base-1',
      runId: 'run-1',
      pageIndex: 0,
      density: 2,
      darkMode: false,
    });
    await flush();
    const result = postMock.mock.calls.find(([message]) => message.type === 'render-result');
    expect(result).toBeDefined();
    const message = result![0];
    expect(message).toMatchObject({
      type: 'render-result',
      requestId: 'base-1',
      runId: 'run-1',
      pageIndex: 0,
      density: 2,
      widthPx: 200,
      heightPx: 400,
      region: { x: 0, y: 0, width: 100, height: 200 },
    });
    expect(message.estimatedBytes).toBe(200 * 400 * 4);
    expect(typeof message.renderMs).toBe('number');
    expect(message.bitmap).toEqual(expect.objectContaining({ __fakeBitmap: true }));
    // bitmap transferred
    expect(postMock.mock.calls.find(([, transfer]) => transfer?.length === 1)).toBeDefined();
  });

  it('renders a crop with region×density bitmap and region offset transform', async () => {
    const page = await loadWorkerAndOpen();
    dispatch({
      type: 'render-crop',
      requestId: 'crop-1',
      runId: 'run-1',
      pageIndex: 0,
      region: { x: 10, y: 20, width: 50, height: 60 },
      density: 3,
      darkMode: false,
    });
    await flush();
    const result = postMock.mock.calls.find(([message]) => message.type === 'render-result');
    expect(result).toBeDefined();
    const message = result![0];
    expect(message).toMatchObject({
      requestId: 'crop-1',
      widthPx: 150,
      heightPx: 180,
      region: { x: 10, y: 20, width: 50, height: 60 },
    });
    const renderCall = page.render.mock.calls[0][0];
    expect(renderCall.transform).toEqual([1, 0, 0, 1, -30, -60]);
    expect(renderCall.viewport).toEqual({ width: 300, height: 600, rotation: 0 });
  });

  it('inverts the canvas in dark mode', async () => {
    await loadWorkerAndOpen();
    dispatch({
      type: 'render-crop',
      requestId: 'dark-1',
      runId: 'run-1',
      pageIndex: 0,
      region: { x: 0, y: 0, width: 10, height: 10 },
      density: 1,
      darkMode: true,
    });
    await flush();
    const canvas = FakeOffscreenCanvas.instances[FakeOffscreenCanvas.instances.length - 1];
    expect(canvas.ctx.fillRect).toHaveBeenCalled();
    expect(canvas.ctx.globalCompositeOperation).toBe('difference');
  });

  it('cancels a render and suppresses the late result', async () => {
    let resolveRender!: () => void;
    const page = makePage(new Promise<void>((resolve) => { resolveRender = resolve; }));
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeDocument(page)), destroy: vi.fn().mockResolvedValue(undefined) });
    await import('./pdf-render.worker');
    dispatch({ type: 'open-document', runId: 'run-1', data: mockPdfBuffer });
    await flush();
    dispatch({
      type: 'render-crop',
      requestId: 'cancel-me',
      runId: 'run-1',
      pageIndex: 0,
      region: { x: 0, y: 0, width: 10, height: 10 },
      density: 1,
      darkMode: false,
    });
    await flush();
    const renderTask = page.render.mock.results[0].value as FakeRenderTask;
    dispatch({ type: 'cancel', requestId: 'cancel-me' });
    expect(renderTask.cancel).toHaveBeenCalled();
    resolveRender();
    await flush();
    const results = postMock.mock.calls.filter(([message]) => message.type === 'render-result');
    expect(results).toHaveLength(0);
  });

  it('reports an error when the document is not open', async () => {
    getDocumentMock.mockReturnValue({ promise: new Promise(() => undefined), destroy: vi.fn() });
    await import('./pdf-render.worker');
    dispatch({
      type: 'render-base',
      requestId: 'base-x',
      runId: 'missing',
      pageIndex: 0,
      density: 1,
      darkMode: false,
    });
    await flush();
    expect(postMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'render-error', requestId: 'base-x', runId: 'missing' }),
      [],
    );
  });

  it('close-run destroys the cached document and invalidates in-flight opens', async () => {
    const page = makePage();
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeDocument(page, destroy)), destroy });
    await import('./pdf-render.worker');
    dispatch({ type: 'open-document', runId: 'run-1', data: mockPdfBuffer });
    await flush();
    dispatch({ type: 'close-run', runId: 'run-1' });
    await flush();
    expect(destroy).toHaveBeenCalled();
    // A subsequent render for the closed run reports not-open (no resurrect).
    dispatch({
      type: 'render-base',
      requestId: 'base-2',
      runId: 'run-1',
      pageIndex: 0,
      density: 1,
      darkMode: false,
    });
    await flush();
    expect(postMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'render-error', requestId: 'base-2', runId: 'run-1' }),
      [],
    );
  });
});
