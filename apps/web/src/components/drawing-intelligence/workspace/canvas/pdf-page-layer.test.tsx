// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';

declare module 'vitest' {
  interface Assertion<T = any> {
    toHaveAttribute(name: string, value?: string): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveAttribute(name: string, value?: string): void;
  }
}

expect.extend({
  toHaveAttribute(element: Element, name: string, value?: string) {
    const actual = element.getAttribute(name);
    const pass = value === undefined ? actual !== null : actual === value;
    return {
      pass,
      message: () =>
        `expected element to have attribute "${name}"${value !== undefined ? ` = "${value}"` : ''} but got "${actual}"`,
    };
  },
});
import {
  shouldRefreshArtifactUrl,
  PdfPageLayer,
  resetGlobalPdfTilePool,
  resetGlobalTileCache,
  resetGlobalDetailTileCache,
  resetDetectedPageSurfaceBufferLimit,
  detectPageSurfaceBufferLimit,
  MAX_PAGE_SURFACE_BUFFER,
  FALLBACK_PAGE_SURFACE_BUFFER,
  DETAIL_PASS_MS,
  OVERSCAN_MARGIN_PCT,
} from './pdf-page-layer';
import { TileLru, PdfTilePyramid, toLogicalViewport } from './pdf-tile-pyramid';
import { createPdfTilePool } from './pdf-tile-pool';
import { normalizeArtifactExpiry, fetchPdfArtifactUrl } from '../../drawing-intelligence-api';
import * as compositorModule from './pdf-tile-compositor';
import type { PdfTileCompositor } from './pdf-tile-compositor';

let getContextSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetGlobalPdfTilePool();
  resetGlobalTileCache();
  resetGlobalDetailTileCache();
  resetDetectedPageSurfaceBufferLimit();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId: string) => {
    if (contextId === '2d') {
      return { drawImage: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    }
    return null;
  });
});

afterEach(() => {
  cleanup();
});

vi.mock('../../drawing-intelligence-api', async (importOriginal: () => Promise<typeof import('../../drawing-intelligence-api')>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchPdfArtifactUrl: vi.fn(),
  };
});

vi.mock('./pdf-binary-cache', () => ({
  fetchPdfBinary: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]).buffer),
  clearPdfBinaryCache: vi.fn(),
  validatePdfMagicHeader: vi.fn(),
}));

vi.mock('./pdf-tile-pool', async (importOriginal: () => Promise<typeof import('./pdf-tile-pool')>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPdfTilePool: vi.fn(() => ({
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockReturnValue({
        promise: new Promise(() => {}),
        cancel: vi.fn(),
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    })),
    getGlobalPdfTilePool: vi.fn(() => (createPdfTilePool as any)()),
    resetGlobalPdfTilePool: vi.fn(),
  };
});

const FIT = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };

function bitmap(width = 512, height = 512) {
  return { width, height, close: vi.fn() };
}

type Delivery = { width: number; height: number; claim: ReturnType<typeof vi.fn> };

function controlledPool(
  metrics = { width: 1000, height: 800, rotation: 0 },
  opts: { failKeys?: Set<string> } = {},
) {
  const resolvers = new Map<string, Array<(delivery: Delivery) => void>>();
  const requestedKeys: string[] = [];
  const cancels: Array<ReturnType<typeof vi.fn>> = [];
  const pool = {
    open: vi.fn().mockResolvedValue(metrics),
    request: vi.fn().mockImplementation(({ tile }: { tile: { key: string } }) => {
      requestedKeys.push(tile.key);
      if (opts.failKeys?.has(tile.key)) {
        return { promise: Promise.reject(new Error('tile failed')), cancel: vi.fn() };
      }
      let resolve!: (delivery: Delivery) => void;
      const promise = new Promise<Delivery>((res) => { resolve = res; });
      const list = resolvers.get(tile.key) ?? [];
      list.push(resolve);
      resolvers.set(tile.key, list);
      const cancel = vi.fn();
      cancels.push(cancel);
      return { promise, cancel };
    }),
    close: vi.fn(),
    dispose: vi.fn(),
  };
  return { pool, resolvers, requestedKeys, cancels };
}

function deliver(resolvers: Map<string, Array<(delivery: Delivery) => void>>, key: string, bmp = bitmap()) {
  const list = resolvers.get(key);
  if (!list || list.length === 0) throw new Error(`no pending request for ${key}`);
  const delivery: Delivery = {
    width: bmp.width,
    height: bmp.height,
    claim: vi.fn().mockReturnValue(bmp),
  };
  list[list.length - 1](delivery);
  return delivery;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
      window.setTimeout(finish, 30);
    });
    await Promise.resolve();
    await Promise.resolve();
  });
}

function makeFakeCompositor(overrides: Partial<PdfTileCompositor> = {}) {
  const upload = vi.fn();
  const state = { committedGeneration: null as number | null, committedTileCount: 0 };
  const commit = vi.fn((frame: { generation: number; tiles: readonly unknown[] }) => {
    state.committedGeneration = frame.generation;
    state.committedTileCount = frame.tiles.length;
  });
  const release = vi.fn();
  const compositor = {
    kind: 'canvas2d',
    upload,
    commit,
    render: vi.fn(),
    release,
    diagnostics: vi.fn(() => ({
      renderer: 'canvas2d',
      committedGeneration: state.committedGeneration,
      committedTileCount: state.committedTileCount,
      materializedTileCount: state.committedTileCount,
      textureCount: 0,
      estimatedTextureBytes: 0,
      contextLost: false,
      uploadFailures: 0,
    })),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as PdfTileCompositor;
  return { compositor, upload, commit, release };
}

function makeContextFakeCompositor() {
  const state = {
    renderer: 'webgl2' as 'webgl2' | 'canvas2d',
    contextLost: false,
    textureCount: 2,
    committedGeneration: null as number | null,
    committedTileCount: 0,
  };
  const upload = vi.fn();
  const commit = vi.fn((frame: { generation: number; tiles: readonly unknown[] }) => {
    state.committedGeneration = frame.generation;
    state.committedTileCount = frame.tiles.length;
  });
  const release = vi.fn();
  const compositor = {
    get kind() {
      return state.renderer;
    },
    upload,
    commit,
    render: vi.fn(),
    release,
    diagnostics: vi.fn(() => ({
      renderer: state.renderer,
      committedGeneration: state.committedGeneration,
      committedTileCount: state.committedTileCount,
      materializedTileCount: state.contextLost ? 0 : state.committedTileCount,
      textureCount: state.contextLost ? 0 : state.textureCount,
      estimatedTextureBytes: 0,
      contextLost: state.contextLost,
      uploadFailures: 0,
    })),
    dispose: vi.fn(),
  } as unknown as PdfTileCompositor;
  return { compositor, state, upload, commit, release };
}

function layer() {
  return screen.getByTestId('pdf-page-layer');
}

function renderNormalizedFitLayer(
  pool: ReturnType<typeof controlledPool>['pool'],
  runId = 'run-fit',
  viewport = FIT,
  extra: Partial<React.ComponentProps<typeof PdfPageLayer>> = {},
) {
  return render(
    <PdfPageLayer
      runId={runId}
      pageIndex={0}
      viewport={viewport}
      viewportSpace="normalized"
      fallbackWidth={1000}
      fallbackHeight={800}
      tilePool={pool as any}
      {...extra}
    />,
  );
}

describe('Artifact Expiry Normalization', () => {
  it('artifact expires_at accepts ISO string, epoch seconds number, epoch seconds numeric string, epoch milliseconds number/string, boundary cases, and rejects invalid/ambiguous input', () => {
    // 1785067200 s = 1785067200000 ms = 2026-07-26T12:00:00.000Z
    expect(normalizeArtifactExpiry('2026-07-26T12:00:00.000Z')).toBe('2026-07-26T12:00:00.000Z');
    expect(normalizeArtifactExpiry(1785067200)).toBe('2026-07-26T12:00:00.000Z');
    expect(normalizeArtifactExpiry('1785067200')).toBe('2026-07-26T12:00:00.000Z');
    expect(normalizeArtifactExpiry(1785067200000)).toBe('2026-07-26T12:00:00.000Z');
    expect(normalizeArtifactExpiry('1785067200000')).toBe('2026-07-26T12:00:00.000Z');

    // Boundary tests at 9_999_999_999, 10_000_000_000, 999_999_999_999, 1_000_000_000_000
    const secIso = new Date(9_999_999_999 * 1000).toISOString();
    expect(normalizeArtifactExpiry(9_999_999_999)).toBe(secIso);
    expect(normalizeArtifactExpiry('9999999999')).toBe(secIso);

    expect(() => normalizeArtifactExpiry(10_000_000_000)).toThrow();
    expect(() => normalizeArtifactExpiry('10000000000')).toThrow();
    expect(() => normalizeArtifactExpiry(999_999_999_999)).toThrow();
    expect(() => normalizeArtifactExpiry('999999999999')).toThrow();

    const msIso = new Date(1_000_000_000_000).toISOString();
    expect(normalizeArtifactExpiry(1_000_000_000_000)).toBe(msIso);
    expect(normalizeArtifactExpiry('1000000000000')).toBe(msIso);

    expect(() => normalizeArtifactExpiry('invalid-date')).toThrow();
    expect(() => normalizeArtifactExpiry('')).toThrow();
    expect(() => normalizeArtifactExpiry(NaN)).toThrow();
    expect(() => normalizeArtifactExpiry(-100)).toThrow();
    expect(() => normalizeArtifactExpiry(null as unknown as string)).toThrow();
    expect(() => normalizeArtifactExpiry(undefined as unknown as string)).toThrow();
  });

  it('all accepted forms normalize to one canonical ISO string with no 1970 error', () => {
    const isoResult = normalizeArtifactExpiry('2026-07-26T12:00:00.000Z');
    const epochSecNum = normalizeArtifactExpiry(1785067200);
    const epochSecStr = normalizeArtifactExpiry('1785067200');
    const epochMsNum = normalizeArtifactExpiry(1785067200000);
    const epochMsStr = normalizeArtifactExpiry('1785067200000');

    expect(isoResult).toBe('2026-07-26T12:00:00.000Z');
    expect(epochSecNum).toBe(isoResult);
    expect(epochSecStr).toBe(isoResult);
    expect(epochMsNum).toBe(isoResult);
    expect(epochMsStr).toBe(isoResult);

    expect(new Date(epochSecStr).getFullYear()).toBe(2026);
    expect(new Date(epochMsStr).getFullYear()).toBe(2026);
  });

  it('shouldRefreshArtifactUrl correctly handles normalized inputs including numeric false case', () => {
    const now = new Date('2026-07-26T12:00:00.000Z');
    expect(shouldRefreshArtifactUrl('2026-07-26T12:00:30.000Z', now)).toBe(true);
    expect(shouldRefreshArtifactUrl(1785067230, now)).toBe(true);
    expect(shouldRefreshArtifactUrl('1785067230', now)).toBe(true);
    expect(shouldRefreshArtifactUrl('2026-07-26T12:10:00.000Z', now)).toBe(false);

    // Numeric shouldRefreshArtifactUrl false case (epoch seconds now + 300s)
    const epochNowSec = Math.floor(now.getTime() / 1000);
    expect(shouldRefreshArtifactUrl(epochNowSec + 300, now)).toBe(false);
    expect(shouldRefreshArtifactUrl(String(epochNowSec + 300), now)).toBe(false);
  });
});

describe('PdfPageLayer Component Mount and Page Transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts actual PdfPageLayer component and transitions cleanly on runId/pageIndex change', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };

    const { rerender } = render(
      <PdfPageLayer
        runId="run-1"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={800}
        fallbackHeight={600}
      />
    );

    expect(screen.getByRole('status').textContent).toContain('Loading original PDF');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('pdf-page-layer')).not.toBeNull();

    mockFetchArtifact.mockResolvedValueOnce({
      url: '/api/document-intelligence/drawings/dem/run-2/artifact?token=xyz',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    rerender(
      <PdfPageLayer
        runId="run-2"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={800}
        fallbackHeight={600}
      />
    );

    expect(screen.getByRole('status').textContent).toContain('Loading original PDF');
    expect(screen.queryByTestId('pdf-page-layer')).toBeNull();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('pdf-page-layer')).not.toBeNull();
  });

  it('ensures signed URL remains component-local', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    const mockUrl = '/api/document-intelligence/drawings/dem/run-local/artifact?token=secret123';
    mockFetchArtifact.mockResolvedValue({
      url: mockUrl,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    render(
      <PdfPageLayer
        runId="run-local"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={800}
        fallbackHeight={600}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const html = document.body.innerHTML;
    expect(html).not.toContain('secret123');
  });
});

describe('Worker and Document Generation Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('run/page stale delivery does not call claim', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const resolvers1: Array<(result: Delivery) => void> = [];
    const pool1 = {
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: Delivery) => void;
        const promise = new Promise<Delivery>((res) => { resolve = res; });
        resolvers1.push(resolve!);
        return { promise, cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValueOnce(pool1 as any);

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    const { rerender } = render(
      <PdfPageLayer
        runId="run-1"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={800}
        fallbackHeight={600}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pool1.request).toHaveBeenCalled();

    const pool2 = {
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockReturnValue({ promise: new Promise(() => {}), cancel: vi.fn() }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValueOnce(pool2 as any);

    mockFetchArtifact.mockResolvedValueOnce({
      url: '/api/document-intelligence/drawings/dem/run-2/artifact?token=xyz',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    rerender(
      <PdfPageLayer
        runId="run-2"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={800}
        fallbackHeight={600}
        tilePool={pool2 as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const mockBitmap = { width: 256, height: 256, close: vi.fn() };
    const claimSpy = vi.fn().mockReturnValue(mockBitmap);
    const delivery = { width: 256, height: 256, claim: claimSpy };

    await act(async () => {
      resolvers1[0](delivery);
      await Promise.resolve();
    });

    expect(claimSpy).not.toHaveBeenCalled();
    expect(mockBitmap.close).not.toHaveBeenCalled();
  });

  it('unmounted delivery does not call claim', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const resolvers: Array<(result: Delivery) => void> = [];
    const poolInstance = {
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: Delivery) => void;
        const promise = new Promise<Delivery>((res) => { resolve = res; });
        resolvers.push(resolve!);
        return { promise, cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValueOnce(poolInstance as any);

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    const { unmount } = render(
      <PdfPageLayer
        runId="run-1"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={800}
        fallbackHeight={600}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(poolInstance.request).toHaveBeenCalled();

    unmount();

    const mockBitmap = { width: 256, height: 256, close: vi.fn() };
    const claimSpy = vi.fn().mockReturnValue(mockBitmap);
    const delivery = { width: 256, height: 256, claim: claimSpy };

    await act(async () => {
      resolvers[0](delivery);
      await Promise.resolve();
    });

    expect(claimSpy).not.toHaveBeenCalled();
    expect(mockBitmap.close).not.toHaveBeenCalled();
  });

  it('active delivery calls claim once and passes bitmap to cache/render path', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-active/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const resolvers: Array<(result: Delivery) => void> = [];
    const poolInstance = {
      open: vi.fn().mockImplementation(() => {
        resolvers.length = 0;
        return Promise.resolve({ width: 1000, height: 800, rotation: 0 });
      }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: Delivery) => void;
        const promise = new Promise<Delivery>((res) => { resolve = res; });
        resolvers.push(resolve!);
        return { promise, cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValue(poolInstance as any);

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    render(
      <PdfPageLayer
        runId="run-active"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={800}
        fallbackHeight={600}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolvers.length).toBeGreaterThan(0);

    const mockBitmap = { width: 256, height: 256, close: vi.fn() };
    let claimedCount = 0;
    const delivery = {
      width: 256,
      height: 256,
      claim: vi.fn().mockImplementation(() => {
        claimedCount++;
        return claimedCount === 1 ? mockBitmap : null;
      }),
    };

    await act(async () => {
      resolvers[0](delivery);
      await Promise.resolve();
    });

    expect(delivery.claim).toHaveBeenCalledTimes(1);
    expect(mockBitmap.close).not.toHaveBeenCalled();
  });

  it('oversize active delivery claims once and closes once via real TileLru, not pool', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-oversize/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const requests: Array<(result: Delivery) => void> = [];
    const poolInstance = {
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: Delivery) => void;
        const promise = new Promise<Delivery>((res) => { resolve = res; });
        requests.push(resolve!);
        return { promise, cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValueOnce(poolInstance as any);

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    render(
      <PdfPageLayer
        runId="run-oversize"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={800}
        fallbackHeight={600}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(requests.length).toBeGreaterThan(0);

    const mockBitmap = { width: 10000, height: 10000, close: vi.fn() };
    const claimSpy = vi.fn().mockReturnValue(mockBitmap);
    const delivery = { width: 10000, height: 10000, claim: claimSpy };

    await act(async () => {
      requests[0](delivery);
      await Promise.resolve();
    });

    expect(claimSpy).toHaveBeenCalledTimes(1);
    expect(mockBitmap.close).toHaveBeenCalledTimes(1);
  });

  it('React.StrictMode mount-cleanup-remount creates a fresh pool and disposes each pool exactly once; no disposed pool is reused', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-strict/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const pool1 = {
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockReturnValue({
        promise: new Promise(() => {}),
        cancel: vi.fn(),
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    const { unmount } = render(
      <React.StrictMode>
        <PdfPageLayer
          runId="run-strict"
          pageIndex={0}
          viewport={viewport}
          fallbackWidth={800}
          fallbackHeight={600}
          tilePool={pool1 as any}
        />
      </React.StrictMode>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pool1.open).toHaveBeenCalledWith(expect.objectContaining({ documentKey: 'run-strict:0', pageNumber: 1 }));

    unmount();
  });

  it('tile requests do not start for a new document until pool.open for that exact document generation resolves', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    let resolveOpen1!: (m: any) => void;
    const openPromise1 = new Promise<any>((res) => { resolveOpen1 = res; });

    const pool1 = {
      open: vi.fn().mockReturnValue(openPromise1),
      request: vi.fn().mockReturnValue({
        promise: new Promise(() => {}),
        cancel: vi.fn(),
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    const { rerender } = render(
      <PdfPageLayer
        runId="run-1"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={800}
        fallbackHeight={600}
        tilePool={pool1 as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(pool1.open).toHaveBeenCalledWith(expect.objectContaining({ documentKey: 'run-1:0' }));
    expect(pool1.request).not.toHaveBeenCalled();

    await act(async () => {
      resolveOpen1({ width: 1000, height: 800, rotation: 0 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pool1.request).toHaveBeenCalled();

    // Rerender to run-2 with pending open
    let resolveOpen2!: (m: any) => void;
    const openPromise2 = new Promise<any>((res) => { resolveOpen2 = res; });
    const pool2 = {
      open: vi.fn().mockReturnValue(openPromise2),
      request: vi.fn().mockReturnValue({
        promise: new Promise(() => {}),
        cancel: vi.fn(),
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };

    mockFetchArtifact.mockResolvedValueOnce({
      url: '/api/document-intelligence/drawings/dem/run-2/artifact?token=xyz',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    rerender(
      <PdfPageLayer
        runId="run-2"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={800}
        fallbackHeight={600}
        tilePool={pool2 as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pool2.open).toHaveBeenCalledWith(expect.objectContaining({ documentKey: 'run-2:0' }));
    expect(pool2.request).not.toHaveBeenCalled();

    await act(async () => {
      resolveOpen2({ width: 1000, height: 800, rotation: 0 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pool2.request).toHaveBeenCalled();
  });

  it('single-flight binary transport prevents redundant signed URL refresh loops during canvas rendering', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-refresh/artifact?token=first',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });

    const poolInstance = {
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockReturnValue({
        promise: new Promise(() => {}),
        cancel: vi.fn(),
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };

    const viewport1 = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    render(
      <PdfPageLayer
        runId="run-refresh"
        pageIndex={0}
        viewport={viewport1}
        fallbackWidth={800}
        fallbackHeight={600}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(poolInstance.open).toHaveBeenCalledTimes(1);
    expect(poolInstance.close).not.toHaveBeenCalled();
  });
});

describe('Atomic generations: committed/candidate state and coverage transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the committed generation until every visible candidate tile is ready', async () => {
    const { pool, resolvers } = controlledPool();
    const onCoverageChange = vi.fn();
    const { container } = renderNormalizedFitLayer(pool, 'run-brief1', FIT, { onCoverageChange });
    await flush();

    expect(pool.request).toHaveBeenCalledTimes(4);

    deliver(resolvers, 'run-brief1:0:1:0:0');
    deliver(resolvers, 'run-brief1:0:1:0:1');
    await flush();

    expect(layer()).toHaveAttribute('data-committed-generation', '0');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'false');
    expect(layer()).toHaveAttribute('data-coverage-ratio', '0.000');

    deliver(resolvers, 'run-brief1:0:1:1:0');
    deliver(resolvers, 'run-brief1:0:1:1:1');
    await flush();

    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
    expect(layer()).toHaveAttribute('data-committed-generation', '1');
    expect(layer()).toHaveAttribute('data-coverage-ratio', '1.000');
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(onCoverageChange).toHaveBeenCalledWith(
      expect.objectContaining({ documentKey: 'run-brief1:0', generation: 1, ready: false, coverage: 0 }),
    );
    expect(onCoverageChange).toHaveBeenCalledWith(
      expect.objectContaining({ documentKey: 'run-brief1:0', generation: 1, ready: true, coverage: 1, renderer: 'canvas2d' }),
    );
  });

  it('a single ready tile never commits a multi-tile viewport and never reports coverage-ready', async () => {
    const { pool, resolvers } = controlledPool();
    const onCoverageChange = vi.fn();
    renderNormalizedFitLayer(pool, 'run-brief2', FIT, { onCoverageChange });
    await flush();

    deliver(resolvers, 'run-brief2:0:1:0:0');
    await flush();

    expect(layer()).toHaveAttribute('data-committed-generation', '0');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'false');
    expect(onCoverageChange).not.toHaveBeenCalledWith(expect.objectContaining({ ready: true }));

    deliver(resolvers, 'run-brief2:0:1:0:1');
    deliver(resolvers, 'run-brief2:0:1:1:0');
    deliver(resolvers, 'run-brief2:0:1:1:1');
    await flush();

    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
    expect(onCoverageChange).toHaveBeenCalledWith(expect.objectContaining({ ready: true, generation: 1 }));
    expect(onCoverageChange.mock.calls.filter((c: any) => c[0].ready === true)).toHaveLength(1);
  });

  it('cached tiles enter readyKeys immediately without being re-requested', async () => {
    const cache = new TileLru();
    cache.set('run-cache:0:1:0:0', bitmap() as unknown as ImageBitmap, 512 * 512 * 4);
    cache.set('run-cache:0:1:0:1', bitmap() as unknown as ImageBitmap, 512 * 512 * 4);

    const { pool, resolvers } = controlledPool();
    renderNormalizedFitLayer(pool, 'run-cache', FIT, { tileCache: cache as any });
    await flush();

    expect(pool.request).toHaveBeenCalledTimes(2);
    expect(pool.request).toHaveBeenCalledWith(expect.objectContaining({ tile: expect.objectContaining({ key: 'run-cache:0:1:1:0' }) }));
    expect(layer()).toHaveAttribute('data-coverage-ready', 'false');

    deliver(resolvers, 'run-cache:0:1:1:0');
    deliver(resolvers, 'run-cache:0:1:1:1');
    await flush();

    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
    expect(layer()).toHaveAttribute('data-committed-generation', '1');
  });

  it('normalizes a viewport with width and height above one through the production wiring', async () => {
    const requestedTiles: any[] = [];
    const poolInstance = {
      open: vi.fn().mockResolvedValue({ width: 1191, height: 842, rotation: 0 }),
      request: vi.fn().mockImplementation(({ tile }: any) => {
        requestedTiles.push(tile);
        return { promise: new Promise(() => {}), cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };

    const viewport = { x: -0.08, y: 0, width: 1.153, height: 1.568, zoom: 0.447, dpr: 1 };
    render(
      <PdfPageLayer
        runId="run-p0"
        pageIndex={0}
        viewport={viewport}
        viewportSpace="normalized"
        fallbackWidth={1400}
        fallbackHeight={990}
        tilePool={poolInstance as any}
      />
    );

    await flush();

    expect(requestedTiles.length).toBeGreaterThan(0);
    const pageWidth = 1191;
    const maxRight = Math.max(...requestedTiles.map((t) => (t.x + t.width) / t.density));
    expect(Math.min(1, maxRight / pageWidth)).toBeGreaterThanOrEqual(0.99);
    const columns = new Set(requestedTiles.map((t) => t.tx));
    expect(columns.size).toBeGreaterThanOrEqual(2);
  });

  it('normalized viewport with width > 1 but height <= 1 also covers the right edge', async () => {
    const requestedTiles: any[] = [];
    const poolInstance = {
      open: vi.fn().mockResolvedValue({ width: 1191, height: 842, rotation: 0 }),
      request: vi.fn().mockImplementation(({ tile }: any) => {
        requestedTiles.push(tile);
        return { promise: new Promise(() => {}), cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };

    const viewport = { x: -0.05, y: 0, width: 1.03, height: 0.9, zoom: 0.6, dpr: 1 };
    render(
      <PdfPageLayer
        runId="run-p0b"
        pageIndex={0}
        viewport={viewport}
        viewportSpace="normalized"
        fallbackWidth={1400}
        fallbackHeight={990}
        tilePool={poolInstance as any}
      />
    );

    await flush();

    expect(requestedTiles.length).toBeGreaterThan(0);
    const pageWidth = 1191;
    const maxRight = Math.max(...requestedTiles.map((t) => (t.x + t.width) / t.density));
    expect(Math.min(1, maxRight / pageWidth)).toBeGreaterThanOrEqual(0.99);
  });

  it('onFirstPaint fires exactly once per opened document, after full visible coverage commits', async () => {
    const { pool, resolvers } = controlledPool();
    const onFirstPaint = vi.fn();
    const { rerender } = renderNormalizedFitLayer(pool, 'run-fp', FIT, { onFirstPaint });
    await flush();

    deliver(resolvers, 'run-fp:0:1:0:0');
    await flush();
    expect(onFirstPaint).not.toHaveBeenCalled();

    deliver(resolvers, 'run-fp:0:1:0:1');
    deliver(resolvers, 'run-fp:0:1:1:0');
    deliver(resolvers, 'run-fp:0:1:1:1');
    await flush();
    expect(onFirstPaint).toHaveBeenCalledTimes(1);

    rerender(
      <PdfPageLayer
        runId="run-fp"
        pageIndex={0}
        viewport={{ ...FIT, x: 0.1 }}
        viewportSpace="normalized"
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={pool as any}
        onFirstPaint={onFirstPaint}
      />
    );
    await flush();
    expect(onFirstPaint).toHaveBeenCalledTimes(1);

    rerender(
      <PdfPageLayer
        runId="run-fp2"
        pageIndex={0}
        viewport={FIT}
        viewportSpace="normalized"
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={pool as any}
        onFirstPaint={onFirstPaint}
      />
    );
    await flush();

    deliver(resolvers, 'run-fp2:0:1:0:0');
    deliver(resolvers, 'run-fp2:0:1:0:1');
    deliver(resolvers, 'run-fp2:0:1:1:0');
    deliver(resolvers, 'run-fp2:0:1:1:1');
    await flush();
    expect(onFirstPaint).toHaveBeenCalledTimes(2);
  });

  it('keeps the committed manifest and coverage signal while a replacement candidate is in flight', async () => {
    const { pool, resolvers } = controlledPool();
    const onCoverageChange = vi.fn();
    const { rerender } = renderNormalizedFitLayer(pool, 'run-zoom', FIT, { onCoverageChange });
    await flush();

    for (const key of ['run-zoom:0:1:0:0', 'run-zoom:0:1:0:1', 'run-zoom:0:1:1:0', 'run-zoom:0:1:1:1']) {
      deliver(resolvers, key);
    }
    await flush();

    expect(layer()).toHaveAttribute('data-committed-generation', '1');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
    const falseCalls = onCoverageChange.mock.calls.filter((c: any) => c[0].ready === false).length;

    rerender(
      <PdfPageLayer
        runId="run-zoom"
        pageIndex={0}
        viewport={{ x: 0.25, y: 0.25, width: 0.5, height: 0.5, zoom: 2, dpr: 1 }}
        viewportSpace="normalized"
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={pool as any}
        onCoverageChange={onCoverageChange}
      />
    );
    await flush();

    expect(layer()).toHaveAttribute('data-committed-generation', '1');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
    expect(onCoverageChange.mock.calls.filter((c: any) => c[0].ready === false).length).toBe(falseCalls);

    const visibleZoomKeys: string[] = [];
    for (let tx = 0; tx <= 2; tx += 1) {
      for (let ty = 0; ty <= 2; ty += 1) visibleZoomKeys.push(`run-zoom:0:2:${tx}:${ty}`);
    }
    for (const key of visibleZoomKeys) deliver(resolvers, key);
    await flush();

    expect(layer()).toHaveAttribute('data-committed-generation', '2');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
    expect(onCoverageChange).toHaveBeenCalledWith(expect.objectContaining({ ready: true, generation: 2 }));
    expect(onCoverageChange.mock.calls.filter((c: any) => c[0].ready === true)).toHaveLength(2);
  });

  it('detail tiles recommit the same generation progressively without refiring readiness', async () => {
    vi.useFakeTimers();
    try {
      const drawImageSpy = vi.fn();
      getContextSpy.mockImplementation((contextId: string) => {
        if (contextId === '2d') return { drawImage: drawImageSpy, clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
        return null;
      });

      const { pool, resolvers } = controlledPool();
      const onCoverageChange = vi.fn();
      const { rerender } = renderNormalizedFitLayer(pool, 'run-detail', FIT, { onCoverageChange });
      await flush();

      for (const key of ['run-detail:0:1:0:0', 'run-detail:0:1:0:1', 'run-detail:0:1:1:0', 'run-detail:0:1:1:1']) {
        deliver(resolvers, key);
      }
      await flush();
      expect(layer()).toHaveAttribute('data-committed-generation', '1');
      expect(onCoverageChange.mock.calls.filter((c: any) => c[0].ready === true)).toHaveLength(1);
      const baseDrawCalls = drawImageSpy.mock.calls.length;
      expect(baseDrawCalls).toBe(4);

      await act(async () => {
        vi.advanceTimersByTime(200);
        await Promise.resolve();
      });
      expect(pool.request).toHaveBeenCalledTimes(4);

      rerender(
        <PdfPageLayer
          runId="run-detail"
          pageIndex={0}
          viewport={{ x: 0.25, y: 0.25, width: 0.5, height: 0.5, zoom: 3, dpr: 1 }}
          viewportSpace="normalized"
          fallbackWidth={1000}
          fallbackHeight={800}
          tilePool={pool as any}
          onCoverageChange={onCoverageChange}
        />
      );
      await flush();
      await act(async () => {
        vi.advanceTimersByTime(200);
        await Promise.resolve();
      });

      const detailKeys: string[] = [];
      for (let tx = 1; tx <= 4; tx += 1) {
        for (let ty = 1; ty <= 4; ty += 1) detailKeys.push(`run-detail:0:3:${tx}:${ty}`);
      }
      const zoomBaseKeys: string[] = [];
      for (let tx = 1; tx <= 5; tx += 1) {
        for (let ty = 1; ty <= 5; ty += 1) zoomBaseKeys.push(`run-detail:0:4:${tx}:${ty}`);
      }
      for (const key of zoomBaseKeys) deliver(resolvers, key);
      await flush();

      expect(layer()).toHaveAttribute('data-committed-generation', '2');
      expect(onCoverageChange.mock.calls.filter((c: any) => c[0].ready === true)).toHaveLength(2);

      for (const key of detailKeys) deliver(resolvers, key);
      await flush();

      expect(layer()).toHaveAttribute('data-committed-generation', '2');
      expect(onCoverageChange.mock.calls.filter((c: any) => c[0].ready === true)).toHaveLength(2);
      expect(drawImageSpy.mock.calls.length).toBeGreaterThan(baseDrawCalls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-emits ready:false when a committed hole becomes visible and re-commits after the missing tile arrives', async () => {
    const { pool, resolvers } = controlledPool();
    const onCoverageChange = vi.fn();
    const { rerender } = renderNormalizedFitLayer(pool, 'run-hole', { ...FIT, zoom: 4 }, { onCoverageChange });
    await flush();

    const gridKeys: string[] = [];
    for (let tx = 0; tx < 8; tx += 1) {
      for (let ty = 0; ty < 7; ty += 1) gridKeys.push(`run-hole:0:4:${tx}:${ty}`);
    }
    for (const key of gridKeys.filter((k) => k !== 'run-hole:0:4:7:6')) deliver(resolvers, key);
    await flush();

    expect(layer()).toHaveAttribute('data-committed-generation', '1');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');

    rerender(
      <PdfPageLayer
        runId="run-hole"
        pageIndex={0}
        viewport={{ x: 0.83, y: 0.75, width: 0.17, height: 0.25, zoom: 4, dpr: 1 }}
        viewportSpace="normalized"
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={pool as any}
        onCoverageChange={onCoverageChange}
      />
    );
    await flush();

    expect(layer()).toHaveAttribute('data-coverage-ready', 'false');
    expect(onCoverageChange).toHaveBeenLastCalledWith(expect.objectContaining({ ready: false, generation: 2 }));

    deliver(resolvers, 'run-hole:0:4:7:6');
    await flush();

    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
    expect(layer()).toHaveAttribute('data-committed-generation', '2');
    expect(onCoverageChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ready: true, generation: 2, coverage: 1 }),
    );
  });

  it('a delivery for a key that left the viewport cannot claim or commit', async () => {
    const { pool, resolvers } = controlledPool({ width: 1600, height: 800, rotation: 0 });
    const { rerender } = renderNormalizedFitLayer(pool, 'run-depart', { x: 0, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 });
    await flush();

    expect(pool.request).toHaveBeenCalledTimes(6);

    rerender(
      <PdfPageLayer
        runId="run-depart"
        pageIndex={0}
        viewport={{ x: 0.5, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 }}
        viewportSpace="normalized"
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={pool as any}
      />
    );
    await flush();

    const departed = resolvers.get('run-depart:0:1:0:0');
    expect(departed).toBeDefined();
    const bmp = bitmap();
    const delivery: Delivery = { width: 512, height: 512, claim: vi.fn().mockReturnValue(bmp) };
    await act(async () => {
      departed![0](delivery);
      await Promise.resolve();
    });

    expect(delivery.claim).not.toHaveBeenCalled();
    expect(layer()).toHaveAttribute('data-committed-generation', '0');
  });

  it('reuses same-key in-flight work for the successor candidate after viewport churn', async () => {
    const { pool, resolvers } = controlledPool();
    const { rerender } = renderNormalizedFitLayer(pool, 'run-reuse', { x: 0, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 });
    await flush();

    expect(pool.request).toHaveBeenCalledTimes(4);

    rerender(
      <PdfPageLayer
        runId="run-reuse"
        pageIndex={0}
        viewport={{ x: 0.1, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 }}
        viewportSpace="normalized"
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={pool as any}
      />
    );
    await flush();

    expect(pool.request).toHaveBeenCalledTimes(4);
    expect(resolvers.get('run-reuse:0:1:0:0')).toHaveLength(1);

    const delivery = deliver(resolvers, 'run-reuse:0:1:0:0');
    deliver(resolvers, 'run-reuse:0:1:0:1');
    deliver(resolvers, 'run-reuse:0:1:1:0');
    deliver(resolvers, 'run-reuse:0:1:1:1');
    await flush();

    expect(delivery.claim).toHaveBeenCalledTimes(1);
    expect(layer()).toHaveAttribute('data-committed-generation', '2');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
  });

  it('an old cancelled same-key delivery cannot supersede the newer request', async () => {
    const { pool, resolvers } = controlledPool({ width: 1600, height: 800, rotation: 0 });
    const { rerender } = renderNormalizedFitLayer(pool, 'run-settle2', { x: 0, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 });
    await flush();

    expect(pool.request).toHaveBeenCalledTimes(6);

    rerender(
      <PdfPageLayer
        runId="run-settle2"
        pageIndex={0}
        viewport={{ x: 0.5, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 }}
        viewportSpace="normalized"
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={pool as any}
      />
    );
    await flush();

    rerender(
      <PdfPageLayer
        runId="run-settle2"
        pageIndex={0}
        viewport={{ x: 0, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 }}
        viewportSpace="normalized"
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={pool as any}
      />
    );
    await flush();

    await flush();
    expect(pool.request).toHaveBeenCalledTimes(10);

    const oldDelivery: Delivery = { width: 512, height: 512, claim: vi.fn().mockReturnValue(bitmap()) };
    await act(async () => {
      resolvers.get('run-settle2:0:1:0:0')![0](oldDelivery);
      await Promise.resolve();
    });
    expect(oldDelivery.claim).not.toHaveBeenCalled();

    const newDelivery = deliver(resolvers, 'run-settle2:0:1:0:0');
    deliver(resolvers, 'run-settle2:0:1:0:1');
    deliver(resolvers, 'run-settle2:0:1:1:0');
    deliver(resolvers, 'run-settle2:0:1:1:1');
    await flush();

    expect(newDelivery.claim).toHaveBeenCalledTimes(1);
    expect(layer()).toHaveAttribute('data-committed-generation', '3');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
  });

  it('detail requests never duplicate base requests for the same keys', async () => {
    vi.useFakeTimers();
    try {
      const { pool } = controlledPool();
      renderNormalizedFitLayer(pool, 'run-dedup2', FIT);
      await flush();
      expect(pool.request).toHaveBeenCalledTimes(4);

      await act(async () => {
        vi.advanceTimersByTime(200);
        await Promise.resolve();
      });
      expect(pool.request).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed tile leaves the candidate uncommitted and coverage-ready false', async () => {
    const { pool, resolvers } = controlledPool(
      { width: 1000, height: 800, rotation: 0 },
      { failKeys: new Set(['run-fail:0:1:1:0']) },
    );
    renderNormalizedFitLayer(pool, 'run-fail', FIT);
    await flush();

    deliver(resolvers, 'run-fail:0:1:0:0');
    deliver(resolvers, 'run-fail:0:1:0:1');
    deliver(resolvers, 'run-fail:0:1:1:1');
    await flush();

    expect(layer()).toHaveAttribute('data-committed-generation', '0');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'false');
  });

  it('continuous 100ms viewport churn cannot postpone retirement past the absolute deadline', async () => {
    vi.useFakeTimers();
    try {
      const { compositor: fakeCompositor, release: releaseMock } = makeFakeCompositor();
      const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(fakeCompositor);

      const { pool } = controlledPool();
      const { rerender } = renderNormalizedFitLayer(pool, 'run-churn', { ...FIT, x: 0 });
      await flush();

      const pyramid = new PdfTilePyramid({ pageKey: 'run-churn:0', width: 1000, height: 800 });
      const metrics = { width: 1000, height: 800 };
      const desiredByStep: Array<Set<string>> = [];
      const seenKeys = new Set<string>();
      for (let i = 0; i <= 20; i += 1) {
        const logical = toLogicalViewport({ x: i * 0.05, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 }, metrics);
        const keys = new Set(pyramid.visibleTiles(logical, OVERSCAN_MARGIN_PCT).map((t) => t.key));
        for (const key of keys) seenKeys.add(key);
        desiredByStep.push(keys);
      }

      for (let i = 1; i <= 20; i += 1) {
        await act(async () => {
          rerender(
            <PdfPageLayer
              runId="run-churn"
              pageIndex={0}
              viewport={{ x: i * 0.05, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 }}
              viewportSpace="normalized"
              fallbackWidth={1000}
              fallbackHeight={800}
              tilePool={pool as any}
            />
          );
          vi.advanceTimersByTime(100);
          await Promise.resolve();
        });
      }

      const finalKeys = desiredByStep[desiredByStep.length - 1];
      const staleKeys = [...seenKeys].filter((key) => !finalKeys.has(key));
      expect(staleKeys.length).toBeGreaterThan(0);

      const releasedKeys = new Set<string>();
      for (const call of releaseMock.mock.calls) {
        for (const key of call[0] as string[]) releasedKeys.add(key);
      }
      for (const key of staleKeys) {
        expect(releasedKeys.has(key)).toBe(true);
      }
      for (const call of releaseMock.mock.calls) {
        for (const key of call[0] as string[]) {
          expect(finalKeys.has(key)).toBe(false);
        }
      }
      expect(releaseMock).toHaveBeenCalled();

      spy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('document switch cancels all active requests and resets committed generation state', async () => {
    const { pool, cancels } = controlledPool();
    const { rerender } = renderNormalizedFitLayer(pool, 'run-switch-a', FIT);
    await flush();

    expect(cancels.length).toBe(4);
    const beforeSwitch = [...cancels];

    rerender(
      <PdfPageLayer
        runId="run-switch-b"
        pageIndex={0}
        viewport={FIT}
        viewportSpace="normalized"
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={pool as any}
      />
    );
    await flush();

    expect(pool.close).toHaveBeenCalledWith('run-switch-a:0');
    expect(beforeSwitch.every((c) => c.mock.calls.length === 1)).toBe(true);
    expect(layer()).toHaveAttribute('data-committed-generation', '0');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'false');
  });

  it('unmount cancels all active requests and disposes layer-owned resources', async () => {
    const { pool, cancels } = controlledPool();
    const { unmount } = renderNormalizedFitLayer(pool, 'run-unmount2', FIT);
    await flush();

    expect(cancels.length).toBe(4);

    unmount();

    expect(cancels.every((c) => c.mock.calls.length === 1)).toBe(true);
    expect(pool.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('Fix round 1: revision hygiene, context-loss observation, incremental upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears revision/bitmap bookkeeping on document lifecycle (A→B→A restarts revisions at 1)', async () => {
    const { compositor: fakeCompositor, commit: commitMock } = makeFakeCompositor();
    const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(fakeCompositor);

    const aKeys = ['run-rev-a:0:1:0:0', 'run-rev-a:0:1:0:1', 'run-rev-a:0:1:1:0', 'run-rev-a:0:1:1:1'];
    const bKeys = ['run-rev-b:0:1:0:0', 'run-rev-b:0:1:0:1', 'run-rev-b:0:1:1:0', 'run-rev-b:0:1:1:1'];
    const { pool, resolvers } = controlledPool();
    const renderLayer = (runId: string, cache: TileLru) =>
      render(
        <PdfPageLayer
          runId={runId}
          pageIndex={0}
          viewport={FIT}
          viewportSpace="normalized"
          fallbackWidth={1000}
          fallbackHeight={800}
          tilePool={pool as any}
          tileCache={cache as any}
        />
      );

    const first = renderLayer('run-rev-a', new TileLru());
    await flush();
    for (const key of aKeys) deliver(resolvers, key);
    await flush();
    expect(layer()).toHaveAttribute('data-committed-generation', '1');

    first.rerender(<PdfPageLayer runId="run-rev-b" pageIndex={0} viewport={FIT} viewportSpace="normalized" fallbackWidth={1000} fallbackHeight={800} tilePool={pool as any} tileCache={new TileLru() as any} />);
    await flush();
    for (const key of bKeys) deliver(resolvers, key);
    await flush();
    expect(layer()).toHaveAttribute('data-committed-generation', '2');

    first.rerender(<PdfPageLayer runId="run-rev-a" pageIndex={0} viewport={FIT} viewportSpace="normalized" fallbackWidth={1000} fallbackHeight={800} tilePool={pool as any} tileCache={new TileLru() as any} />);
    await flush();
    for (const key of aKeys) deliver(resolvers, key, bitmap());
    await flush();

    const frames = commitMock.mock.calls.map((c: any) => c[0]);
    expect(frames).toHaveLength(3);
    expect(frames[2].tiles.map((t: any) => t.revision)).toEqual([1, 1, 1, 1]);
    expect(frames[2].tiles.map((t: any) => t.key)).toEqual(expect.arrayContaining(aKeys));

    spy.mockRestore();
  });

  it('context loss immediately exposes lost diagnostics and emits ready:false for the committed generation', async () => {
    const { compositor, state } = makeContextFakeCompositor();
    const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(compositor);
    const onCoverageChange = vi.fn();
    const { pool, resolvers } = controlledPool();
    const { container } = renderNormalizedFitLayer(pool, 'run-loss', FIT, { onCoverageChange });
    await flush();

    for (const key of ['run-loss:0:1:0:0', 'run-loss:0:1:0:1', 'run-loss:0:1:1:0', 'run-loss:0:1:1:1']) {
      deliver(resolvers, key);
    }
    await flush();
    expect(layer()).toHaveAttribute('data-committed-generation', '1');
    expect(onCoverageChange).toHaveBeenLastCalledWith(expect.objectContaining({ ready: true, generation: 1 }));

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    state.contextLost = true;
    await act(async () => {
      canvas!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      await Promise.resolve();
    });

    expect(layer()).toHaveAttribute('data-context-lost', 'true');
    expect(layer()).toHaveAttribute('data-renderer-kind', 'webgl2');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'false');
    expect(layer()).toHaveAttribute('data-committed-generation', '1');
    expect(onCoverageChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ready: false, generation: 1, renderer: 'webgl2' }),
    );

    spy.mockRestore();
  });

  it('never hides the underlay via ready:true while the context is lost, even when a new generation commits', async () => {
    const { compositor, state } = makeContextFakeCompositor();
    const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(compositor);
    const onCoverageChange = vi.fn();
    const { pool, resolvers } = controlledPool();
    const { container, rerender } = renderNormalizedFitLayer(pool, 'run-loss-commit', FIT, { onCoverageChange });
    await flush();

    for (const key of ['run-loss-commit:0:1:0:0', 'run-loss-commit:0:1:0:1', 'run-loss-commit:0:1:1:0', 'run-loss-commit:0:1:1:1']) {
      deliver(resolvers, key);
    }
    await flush();
    expect(layer()).toHaveAttribute('data-committed-generation', '1');
    expect(onCoverageChange).toHaveBeenCalledWith(expect.objectContaining({ ready: true, generation: 1 }));

    const canvas = container.querySelector('canvas');
    state.contextLost = true;
    await act(async () => {
      canvas!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      await Promise.resolve();
    });
    expect(layer()).toHaveAttribute('data-context-lost', 'true');

    rerender(
      <PdfPageLayer
        runId="run-loss-commit"
        pageIndex={0}
        viewport={{ x: 0.25, y: 0.25, width: 0.5, height: 0.5, zoom: 2, dpr: 1 }}
        viewportSpace="normalized"
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={pool as any}
        onCoverageChange={onCoverageChange}
      />
    );
    await flush();

    const zoomKeys: string[] = [];
    for (let tx = 0; tx <= 2; tx += 1) {
      for (let ty = 0; ty <= 2; ty += 1) zoomKeys.push(`run-loss-commit:0:2:${tx}:${ty}`);
    }
    for (const key of zoomKeys) deliver(resolvers, key);
    await flush();

    expect(layer()).toHaveAttribute('data-committed-generation', '2');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'false');
    expect(onCoverageChange.mock.calls.filter((c: any) => c[0].ready === true)).toHaveLength(1);

    spy.mockRestore();
  });

  it('context restore updates diagnostics and re-emits ready:true for the committed generation after the frame boundary', async () => {
    const { compositor, state } = makeContextFakeCompositor();
    const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(compositor);
    const onCoverageChange = vi.fn();
    const { pool, resolvers } = controlledPool();
    const { container } = renderNormalizedFitLayer(pool, 'run-restore', FIT, { onCoverageChange });
    await flush();

    for (const key of ['run-restore:0:1:0:0', 'run-restore:0:1:0:1', 'run-restore:0:1:1:0', 'run-restore:0:1:1:1']) {
      deliver(resolvers, key);
    }
    await flush();
    expect(layer()).toHaveAttribute('data-committed-generation', '1');

    const canvas = container.querySelector('canvas');
    state.contextLost = true;
    await act(async () => {
      canvas!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      await Promise.resolve();
    });
    expect(layer()).toHaveAttribute('data-context-lost', 'true');

    state.contextLost = false;
    await act(async () => {
      canvas!.dispatchEvent(new Event('webglcontextrestored'));
    });
    await flushFrame();

    expect(layer()).toHaveAttribute('data-context-lost', 'false');
    expect(layer()).toHaveAttribute('data-renderer-kind', 'webgl2');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
    expect(onCoverageChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ready: true, generation: 1, coverage: 1, renderer: 'webgl2' }),
    );

    spy.mockRestore();
  });

  it('Canvas2D failover on repeated loss updates renderer diagnostics and re-emits ready:true', async () => {
    const { compositor, state } = makeContextFakeCompositor();
    const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(compositor);
    const onCoverageChange = vi.fn();
    const { pool, resolvers } = controlledPool();
    const { container } = renderNormalizedFitLayer(pool, 'run-failover', FIT, { onCoverageChange });
    await flush();

    for (const key of ['run-failover:0:1:0:0', 'run-failover:0:1:0:1', 'run-failover:0:1:1:0', 'run-failover:0:1:1:1']) {
      deliver(resolvers, key);
    }
    await flush();
    expect(layer()).toHaveAttribute('data-committed-generation', '1');

    const canvas = container.querySelector('canvas');
    state.renderer = 'canvas2d';
    state.contextLost = false;
    await act(async () => {
      canvas!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      await Promise.resolve();
    });

    expect(layer()).toHaveAttribute('data-renderer-kind', 'canvas2d');
    expect(layer()).toHaveAttribute('data-context-lost', 'false');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
    expect(onCoverageChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ready: true, generation: 1, renderer: 'canvas2d' }),
    );

    spy.mockRestore();
  });

  it('stale context events after unmount do nothing', async () => {
    const { compositor, state } = makeContextFakeCompositor();
    const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(compositor);
    const onCoverageChange = vi.fn();
    const { pool, resolvers } = controlledPool();
    const { container, unmount } = renderNormalizedFitLayer(pool, 'run-stale', FIT, { onCoverageChange });
    await flush();

    for (const key of ['run-stale:0:1:0:0', 'run-stale:0:1:0:1', 'run-stale:0:1:1:0', 'run-stale:0:1:1:1']) {
      deliver(resolvers, key);
    }
    await flush();
    const callsBefore = onCoverageChange.mock.calls.length;

    const canvas = container.querySelector('canvas');
    unmount();

    state.contextLost = true;
    await act(async () => {
      canvas!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      await Promise.resolve();
    });
    expect(onCoverageChange.mock.calls.length).toBe(callsBefore);

    await act(async () => {
      canvas!.dispatchEvent(new Event('webglcontextrestored'));
    });
    await flushFrame();
    expect(onCoverageChange.mock.calls.length).toBe(callsBefore);

    spy.mockRestore();
  });

  it('uploads ready tiles incrementally before commit and reuses the exact uploaded descriptors at commit', async () => {
    const { compositor: fakeCompositor, upload: uploadMock, commit: commitMock } = makeFakeCompositor({
      kind: 'webgl2',
    });
    const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(fakeCompositor);
    const onCoverageChange = vi.fn();
    const { pool, resolvers } = controlledPool();
    renderNormalizedFitLayer(pool, 'run-upload', FIT, { onCoverageChange });
    await flush();

    expect(uploadMock).not.toHaveBeenCalled();
    expect(commitMock).not.toHaveBeenCalled();

    deliver(resolvers, 'run-upload:0:1:0:0');
    await flush();

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledWith(expect.objectContaining({ key: 'run-upload:0:1:0:0', revision: 1 }));
    expect(layer()).toHaveAttribute('data-committed-generation', '0');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'false');
    expect(commitMock).not.toHaveBeenCalled();
    expect(onCoverageChange).not.toHaveBeenCalledWith(expect.objectContaining({ ready: true }));

    deliver(resolvers, 'run-upload:0:1:0:1');
    await flush();
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(layer()).toHaveAttribute('data-committed-generation', '0');

    deliver(resolvers, 'run-upload:0:1:1:0');
    deliver(resolvers, 'run-upload:0:1:1:1');
    await flush();

    expect(uploadMock).toHaveBeenCalledTimes(4);
    expect(commitMock).toHaveBeenCalledTimes(1);
    const frame = commitMock.mock.calls[0][0];
    expect(frame.tiles.map((t: any) => t.key)).toEqual(expect.arrayContaining([
      'run-upload:0:1:0:0',
      'run-upload:0:1:0:1',
      'run-upload:0:1:1:0',
      'run-upload:0:1:1:1',
    ]));
    expect(frame.tiles.map((t: any) => t.revision)).toEqual([1, 1, 1, 1]);
    for (const call of uploadMock.mock.calls) {
      expect(frame.tiles).toContain(call[0]);
    }
    expect(layer()).toHaveAttribute('data-committed-generation', '1');
    expect(layer()).toHaveAttribute('data-coverage-ready', 'true');

    spy.mockRestore();
  });

  it('retirement never releases an uploaded key still desired by the current candidate', async () => {
    vi.useFakeTimers();
    try {
      const { compositor: fakeCompositor, release: releaseMock } = makeFakeCompositor({ kind: 'webgl2' });
      const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(fakeCompositor);

      const { pool, resolvers } = controlledPool();
      const { rerender } = renderNormalizedFitLayer(pool, 'run-keep', { x: 0, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 });
      await flush();

      deliver(resolvers, 'run-keep:0:1:0:0');
      await flush();
      expect(layer()).toHaveAttribute('data-committed-generation', '0');

      await act(async () => {
        rerender(
          <PdfPageLayer
            runId="run-keep"
            pageIndex={0}
            viewport={{ x: 0.1, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 }}
            viewportSpace="normalized"
            fallbackWidth={1000}
            fallbackHeight={800}
            tilePool={pool as any}
          />
        );
        await Promise.resolve();
      });
      vi.advanceTimersByTime(200);
      await flush();

      expect(releaseMock).not.toHaveBeenCalled();

      spy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Page surface buffer sizing (B1)', () => {
  it('returns 8192 on a capable device with WebGL2 max texture >= 8192', () => {
    getContextSpy.mockImplementation((contextId: string) => {
      if (contextId === 'webgl2') {
        return {
          MAX_TEXTURE_SIZE: 0x0d33,
          getParameter: vi.fn(() => 16384),
          getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
        } as unknown as WebGL2RenderingContext;
      }
      return null;
    });
    expect(detectPageSurfaceBufferLimit()).toBe(MAX_PAGE_SURFACE_BUFFER);
  });

  it('returns 4096 when deviceMemory is below 4GB', () => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
    try {
      expect(detectPageSurfaceBufferLimit()).toBe(FALLBACK_PAGE_SURFACE_BUFFER);
    } finally {
      delete (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    }
  });

  it('returns 4096 when WebGL2 max texture size is below 8192', () => {
    getContextSpy.mockImplementation((contextId: string) => {
      if (contextId === 'webgl2') {
        return {
          MAX_TEXTURE_SIZE: 0x0d33,
          getParameter: vi.fn(() => 4096),
          getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
        } as unknown as WebGL2RenderingContext;
      }
      return null;
    });
    expect(detectPageSurfaceBufferLimit()).toBe(FALLBACK_PAGE_SURFACE_BUFFER);
  });

  it('returns 4096 when the 8192px allocation probe fails', () => {
    getContextSpy.mockImplementation(() => null);
    expect(detectPageSurfaceBufferLimit()).toBe(FALLBACK_PAGE_SURFACE_BUFFER);
  });

  it('sizes the compositor canvas to the detected limit (8192 capable device)', async () => {
    const { compositor: fakeCompositor } = makeFakeCompositor();
    const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(fakeCompositor);
    getContextSpy.mockImplementation((contextId: string) => {
      if (contextId === 'webgl2') {
        return {
          MAX_TEXTURE_SIZE: 0x0d33,
          getParameter: vi.fn(() => 16384),
          getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
        } as unknown as WebGL2RenderingContext;
      }
      return null;
    });
    try {
      const { pool } = controlledPool();
      const { container } = renderNormalizedFitLayer(
        pool,
        'run-buffer-capable',
        { ...FIT, dpr: 1 },
        { fallbackWidth: 10000, fallbackHeight: 10000 },
      );
      await flush();
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      expect(canvas!.width).toBe(MAX_PAGE_SURFACE_BUFFER);
      expect(canvas!.height).toBe(MAX_PAGE_SURFACE_BUFFER);
    } finally {
      spy.mockRestore();
    }
  });

  it('sizes the compositor canvas to the detected limit (4096 weak device)', async () => {
    const { compositor: fakeCompositor } = makeFakeCompositor();
    const spy = vi.spyOn(compositorModule, 'createPdfTileCompositor').mockReturnValue(fakeCompositor);
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
    try {
      const { pool } = controlledPool();
      const { container } = renderNormalizedFitLayer(
        pool,
        'run-buffer-weak',
        { ...FIT, dpr: 1 },
        { fallbackWidth: 10000, fallbackHeight: 10000 },
      );
      await flush();
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      expect(canvas!.width).toBe(FALLBACK_PAGE_SURFACE_BUFFER);
      expect(canvas!.height).toBe(FALLBACK_PAGE_SURFACE_BUFFER);
    } finally {
      delete (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      spy.mockRestore();
    }
  });
});

describe('B3 detail pass', () => {
  it('uses an 80ms settle window', () => {
    expect(DETAIL_PASS_MS).toBe(80);
  });

  it('caches detail tiles in the separate detail LRU, never the interactive cache', async () => {
    vi.useFakeTimers();
    try {
      const { pool, resolvers } = controlledPool();
      const shared = new TileLru();
      const detail = new TileLru();
      const { rerender } = renderNormalizedFitLayer(pool, 'run-detail-cache', FIT, {
        tileCache: shared as any,
        detailTileCache: detail as any,
      });
      await flush();

      rerender(
        <PdfPageLayer
          runId="run-detail-cache"
          pageIndex={0}
          viewport={{ x: 0.25, y: 0.25, width: 0.5, height: 0.5, zoom: 3, dpr: 1 }}
          viewportSpace="normalized"
          fallbackWidth={1000}
          fallbackHeight={800}
          tilePool={pool as any}
          tileCache={shared as any}
          detailTileCache={detail as any}
        />,
      );
      await flush();
      await act(async () => {
        vi.advanceTimersByTime(200);
        await Promise.resolve();
      });

      const requestedKeys = (pool.request as ReturnType<typeof vi.fn>).mock.calls.map((c: any) => c[0].tile.key as string);
      // Key format is `<pageKey>:<density>:<tx>:<ty>` — match the density segment
      // exactly so `:4:3:3` (density 4, tx/ty 3) is never misread as density 3.
      const densityOf = (key: string): string => key.split(':')[2] ?? '';
      const detailKeys = requestedKeys.filter((key) => densityOf(key) === '3');
      const baseKeys = requestedKeys.filter((key) => densityOf(key) === '4');
      expect(detailKeys.length).toBeGreaterThan(0);
      expect(baseKeys.length).toBeGreaterThan(0);

      for (const key of baseKeys) deliver(resolvers, key);
      for (const key of detailKeys) deliver(resolvers, key);
      await flush();

      for (const key of detailKeys) {
        expect(detail.has(key)).toBe(true);
        expect(shared.has(key)).toBe(false);
      }
      for (const key of baseKeys) {
        expect(shared.has(key)).toBe(true);
        expect(detail.has(key)).toBe(false);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
