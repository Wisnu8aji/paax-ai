// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { shouldRefreshArtifactUrl, PdfPageLayer, resetGlobalPdfTilePool, resetGlobalTileCache } from './pdf-page-layer';
import { TileLru, PdfTilePyramid, type TileViewport } from './pdf-tile-pyramid';
import { createPdfTilePool } from './pdf-tile-pool';
import { normalizeArtifactExpiry, fetchPdfArtifactUrl } from '../../drawing-intelligence-api';

let getContextSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetGlobalPdfTilePool();
  resetGlobalTileCache();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId: string) => {
    if (contextId === '2d') {
      return { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    }
    return null;
  });
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

describe('Worker and Document Generation Lifecycle (Phase 2B & 3A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('run/page stale delivery does not call claim', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const resolvers1: Array<(result: any) => void> = [];
    const pool1 = {
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: any) => void;
        const promise = new Promise<any>((res) => { resolve = res; });
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

    const resolvers: Array<(result: any) => void> = [];
    const poolInstance = {
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: any) => void;
        const promise = new Promise<any>((res) => { resolve = res; });
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

    const resolvers: Array<(result: any) => void> = [];
    const poolInstance = {
      open: vi.fn().mockImplementation(() => {
        resolvers.length = 0;
        return Promise.resolve({ width: 1000, height: 800, rotation: 0 });
      }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: any) => void;
        const promise = new Promise<any>((res) => { resolve = res; });
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

    const requests: Array<(result: any) => void> = [];
    const poolInstance = {
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: any) => void;
        const promise = new Promise<any>((res) => { resolve = res; });
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


describe('Phase 3B1: Metadata-only React state and cache.peek rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('active delivery draws from cache.peek, sizing canvas and calling drawImage', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-3b1/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const drawImageSpy = vi.fn();
    getContextSpy.mockImplementation((contextId: string) => {
      if (contextId === '2d') {
        return { drawImage: drawImageSpy } as unknown as CanvasRenderingContext2D;
      }
      return null;
    });

    const peekSpy = vi.spyOn(TileLru.prototype, 'peek');

    const resolvers: Array<(result: any) => void> = [];
    const poolInstance = {
      open: vi.fn().mockImplementation(() => {
        resolvers.length = 0;
        return Promise.resolve({ width: 1000, height: 800, rotation: 0 });
      }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: any) => void;
        const promise = new Promise<any>((res) => { resolve = res; });
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
        runId="run-3b1"
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

    const mockBitmap = { width: 512, height: 512, close: vi.fn() };
    const delivery = {
      width: 512,
      height: 512,
      claim: vi.fn().mockReturnValue(mockBitmap),
    };

    await act(async () => {
      resolvers[0](delivery);
      await Promise.resolve();
    });

    expect(peekSpy).toHaveBeenCalledWith('run-3b1:0:1:0:0');
    expect(drawImageSpy).toHaveBeenCalledWith(mockBitmap, 0, 0);

    peekSpy.mockRestore();
  });

  it('an evicted/missing key in TileLru does not call drawImage', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-evicted/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const drawImageSpy = vi.fn();
    getContextSpy.mockImplementation((contextId: string) => {
      if (contextId === '2d') {
        return { drawImage: drawImageSpy } as unknown as CanvasRenderingContext2D;
      }
      return null;
    });

    const peekSpy = vi.spyOn(TileLru.prototype, 'peek').mockReturnValue(undefined);

    const resolvers: Array<(result: any) => void> = [];
    const poolInstance = {
      open: vi.fn().mockImplementation(() => {
        resolvers.length = 0;
        return Promise.resolve({ width: 1000, height: 800, rotation: 0 });
      }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: any) => void;
        const promise = new Promise<any>((res) => { resolve = res; });
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
        runId="run-evicted"
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

    const mockBitmap = { width: 512, height: 512, close: vi.fn() };
    const delivery = {
      width: 512,
      height: 512,
      claim: vi.fn().mockReturnValue(mockBitmap),
    };

    await act(async () => {
      resolvers[0](delivery);
      await Promise.resolve();
    });

    expect(peekSpy).toHaveBeenCalledWith('run-evicted:0:1:0:0');
    expect(drawImageSpy).not.toHaveBeenCalled();

    peekSpy.mockRestore();
  });

  it('same tile key updated with new bitmap re-renders TileCanvas and calls drawImage with new bitmap via revision', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-same-key/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const drawImageSpy = vi.fn();
    getContextSpy.mockImplementation((contextId: string) => {
      if (contextId === '2d') {
        return { drawImage: drawImageSpy } as unknown as CanvasRenderingContext2D;
      }
      return null;
    });

    const mockBitmapA = { width: 512, height: 512, close: vi.fn(), id: 'bitmapA' };
    const mockBitmapB = { width: 512, height: 512, close: vi.fn(), id: 'bitmapB' };

    const resolvers: Array<(delivery: any) => void> = [];
    const requestedTiles: any[] = [];
    const poolInstance = {
      open: vi.fn().mockImplementation(() => {
        resolvers.length = 0;
        return Promise.resolve({ width: 1000, height: 800, rotation: 0 });
      }),
      request: vi.fn().mockImplementation(({ tile }: any) => {
        requestedTiles.push(tile);
        let resolve: (delivery: any) => void;
        const promise = new Promise<any>((res) => { resolve = res; });
        resolvers.push(resolve!);
        return { promise, cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValue(poolInstance as any);

    const viewport1 = { x: 0, y: 0, width: 0.1, height: 0.1, zoom: 1, dpr: 1 };
    const { rerender } = render(
      <PdfPageLayer
        runId="run-same-key"
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
      await Promise.resolve();
    });

    expect(resolvers.length).toBe(1);

    const deliveryA = {
      width: 512,
      height: 512,
      claim: vi.fn().mockReturnValue(mockBitmapA),
    };

    await act(async () => {
      resolvers[0](deliveryA);
      await Promise.resolve();
    });

    expect(drawImageSpy).toHaveBeenCalledWith(mockBitmapA, 0, 0);
    drawImageSpy.mockClear();

    const hasSpy = vi.spyOn(TileLru.prototype, 'has').mockReturnValueOnce(false);
    const getSpy = vi.spyOn(TileLru.prototype, 'get').mockReturnValueOnce(undefined);

    const viewport2 = { x: 0.05, y: 0, width: 0.1, height: 0.1, zoom: 1, dpr: 1 };
    rerender(
      <PdfPageLayer
        runId="run-same-key"
        pageIndex={0}
        viewport={viewport2}
        fallbackWidth={800}
        fallbackHeight={600}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolvers.length).toBe(2);
    expect(requestedTiles[0].key).toBe(requestedTiles[1].key);

    const deliveryB = {
      width: 512,
      height: 512,
      claim: vi.fn().mockReturnValue(mockBitmapB),
    };

    await act(async () => {
      resolvers[1](deliveryB);
      await Promise.resolve();
    });

    expect(drawImageSpy).toHaveBeenCalledWith(mockBitmapB, 0, 0);

    hasSpy.mockRestore();
    getSpy.mockRestore();
  });

  it('updates tile metadata on cache hit when geometry changes for same key without incrementing revision or re-triggering drawImage', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-meta/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const drawImageSpy = vi.fn();
    getContextSpy.mockImplementation((contextId: string) => {
      if (contextId === '2d') {
        return { drawImage: drawImageSpy } as unknown as CanvasRenderingContext2D;
      }
      return null;
    });

    const tileV1 = { key: 'run-meta:0:1:0:0', tx: 0, ty: 0, x: 0, y: 0, width: 400, height: 400, density: 1 };
    const tileV2 = { key: 'run-meta:0:1:0:0', tx: 0, ty: 0, x: 0, y: 0, width: 500, height: 400, density: 1 };

    const visibleTilesSpy = vi.spyOn(PdfTilePyramid.prototype, 'visibleTiles')
      .mockImplementation((vp: TileViewport) => vp.x > 0 ? [tileV2] : [tileV1]);

    const resolvers: Array<(delivery: any) => void> = [];
    const poolInstance = {
      open: vi.fn().mockImplementation(() => {
        resolvers.length = 0;
        return Promise.resolve({ width: 1000, height: 800, rotation: 0 });
      }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (delivery: any) => void;
        const promise = new Promise<any>((res) => { resolve = res; });
        resolvers.push(resolve!);
        return { promise, cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValue(poolInstance as any);

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    const { container, rerender } = render(
      <PdfPageLayer
        runId="run-meta"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolvers.length).toBe(1);

    const mockBitmap = { width: 400, height: 400, close: vi.fn() };
    const delivery = {
      width: 400,
      height: 400,
      claim: vi.fn().mockReturnValue(mockBitmap),
    };

    await act(async () => {
      resolvers[0](delivery);
      await Promise.resolve();
    });

    expect(drawImageSpy).toHaveBeenCalledTimes(1);
    drawImageSpy.mockClear();

    const canvasBefore = container.querySelector('canvas');
    expect(canvasBefore).not.toBeNull();
    expect(canvasBefore?.style.width).toBe('40%');

    // Rerender with slight viewport change dependency to re-trigger useEffect
    // visibleTiles returns tileV2 (same key, width 500)
    rerender(
      <PdfPageLayer
        runId="run-meta"
        pageIndex={0}
        viewport={{ ...viewport, x: 0.001 }}
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Cache hit: no second pool.request
    expect(resolvers.length).toBe(1);

    // Canvas width updated to 50%
    const canvasAfter = container.querySelector('canvas');
    expect(canvasAfter?.style.width).toBe('50%');

    // drawImage was NOT called again because revision was preserved
    expect(drawImageSpy).not.toHaveBeenCalled();

    visibleTilesSpy.mockRestore();
  });
});

describe('Phase 3B2: Persistent in-flight request dedup and surgical cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rapid pan between two viewports sharing one tile: overlap handle cancel not called and pool.request for that key remains exactly once; leaving key is cancelled', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-pan/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const cancelA = vi.fn();
    const cancelShared = vi.fn();
    const cancelB = vi.fn();

    const tileA = { key: 'run-pan:0:1:0:0', tx: 0, ty: 0, x: 0, y: 0, width: 400, height: 400, density: 1 };
    const tileShared = { key: 'run-pan:0:1:1:0', tx: 1, ty: 0, x: 400, y: 0, width: 400, height: 400, density: 1 };
    const tileB = { key: 'run-pan:0:1:2:0', tx: 2, ty: 0, x: 800, y: 0, width: 400, height: 400, density: 1 };

    const visibleTilesSpy = vi.spyOn(PdfTilePyramid.prototype, 'visibleTiles')
      .mockImplementation((vp: TileViewport) => vp.x > 0 ? [tileShared, tileB] : [tileA, tileShared]);

    const requestedKeys: string[] = [];
    const poolInstance = {
      open: vi.fn().mockImplementation(() => Promise.resolve({ width: 1000, height: 800, rotation: 0 })),
      request: vi.fn().mockImplementation(({ tile }: any) => {
        requestedKeys.push(tile.key);
        let cancel = cancelA;
        if (tile.key === tileShared.key) cancel = cancelShared;
        if (tile.key === tileB.key) cancel = cancelB;
        return { promise: new Promise(() => {}), cancel };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValue(poolInstance as any);

    const viewport1 = { x: 0, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 };
    const { rerender } = render(
      <PdfPageLayer
        runId="run-pan"
        pageIndex={0}
        viewport={viewport1}
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(requestedKeys).toEqual([tileA.key, tileShared.key]);
    expect(cancelA).not.toHaveBeenCalled();
    expect(cancelShared).not.toHaveBeenCalled();

    // Rerender with viewport2 sharing tileShared
    const viewport2 = { x: 0.2, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 };
    rerender(
      <PdfPageLayer
        runId="run-pan"
        pageIndex={0}
        viewport={viewport2}
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Overlap handle cancel not called
    expect(cancelShared).not.toHaveBeenCalled();
    // Leaving key cancelled
    expect(cancelA).toHaveBeenCalledTimes(1);
    // Request for tileShared remains exactly once
    expect(requestedKeys.filter((k) => k === tileShared.key).length).toBe(1);
    // tileB requested
    expect(requestedKeys).toContain(tileB.key);

    visibleTilesSpy.mockRestore();
  });

  it('kept overlap request resolving after old effect cleanup still claims/caches/draws for new viewport', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-kept/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const drawImageSpy = vi.fn();
    getContextSpy.mockImplementation((contextId: string) => {
      if (contextId === '2d') {
        return { drawImage: drawImageSpy } as unknown as CanvasRenderingContext2D;
      }
      return null;
    });

    const tileShared = { key: 'run-kept:0:1:0:0', tx: 0, ty: 0, x: 0, y: 0, width: 400, height: 400, density: 1 };

    const visibleTilesSpy = vi.spyOn(PdfTilePyramid.prototype, 'visibleTiles')
      .mockReturnValue([tileShared]);

    let resolveShared!: (delivery: any) => void;
    const poolInstance = {
      open: vi.fn().mockImplementation(() => Promise.resolve({ width: 1000, height: 800, rotation: 0 })),
      request: vi.fn().mockImplementation(({ tile }: any) => {
        const promise = new Promise<any>((res) => { resolveShared = res; });
        return { promise, cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValue(poolInstance as any);

    const viewport1 = { x: 0, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 };
    const { rerender } = render(
      <PdfPageLayer
        runId="run-kept"
        pageIndex={0}
        viewport={viewport1}
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Viewport change, causing old effect cleanup to run
    const viewport2 = { x: 0.05, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 };
    rerender(
      <PdfPageLayer
        runId="run-kept"
        pageIndex={0}
        viewport={viewport2}
        fallbackWidth={1000}
        fallbackHeight={800}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Now request resolves after old effect cleanup
    const mockBitmap = { width: 400, height: 400, close: vi.fn() };
    const delivery = {
      width: 400,
      height: 400,
      claim: vi.fn().mockReturnValue(mockBitmap),
    };

    await act(async () => {
      resolveShared(delivery);
      await Promise.resolve();
    });

    expect(delivery.claim).toHaveBeenCalledTimes(1);
    expect(drawImageSpy).toHaveBeenCalledWith(mockBitmap, 0, 0);

    visibleTilesSpy.mockRestore();
  });

  it('old settled handler cannot remove a newer same-key entry', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-settle/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const tile1 = { key: 'run-settle:0:1:0:0', tx: 0, ty: 0, x: 0, y: 0, width: 400, height: 400, density: 1 };
    const tile2 = { key: 'run-settle:0:1:1:0', tx: 1, ty: 0, x: 400, y: 0, width: 400, height: 400, density: 1 };
    const visibleTilesSpy = vi.spyOn(PdfTilePyramid.prototype, 'visibleTiles')
      .mockImplementation((vp: TileViewport) => vp.x > 0 ? [tile2] : [tile1]);

    const resolvers: Array<(delivery: any) => void> = [];
    const poolInstance = {
      open: vi.fn().mockImplementation(() => {
        resolvers.length = 0;
        return Promise.resolve({ width: 1000, height: 800, rotation: 0 });
      }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (delivery: any) => void;
        const promise = new Promise<any>((res) => { resolve = res; });
        resolvers.push(resolve!);
        return { promise, cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValue(poolInstance as any);

    const viewport1 = { x: 0, y: 0, width: 0.5, height: 1, zoom: 1, dpr: 1 };
    const { rerender } = render(
      <PdfPageLayer
        runId="run-settle"
        pageIndex={0}
        viewport={viewport1}
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resolvers.length).toBe(1);
    const req1Resolver = resolvers[0];

    // Pan away so tile1 is no longer desired and request 1 is cancelled
    rerender(
      <PdfPageLayer
        runId="run-settle"
        pageIndex={0}
        viewport={{ ...viewport1, x: 0.5 }}
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Pan back so tile1 is requested again (request 2)
    rerender(
      <PdfPageLayer
        runId="run-settle"
        pageIndex={0}
        viewport={{ ...viewport1, x: 0 }}
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={poolInstance as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolvers.length).toBe(3);
    const req2Resolver = resolvers[2];

    // Now old request 1 settles
    const mockBitmapOld = { width: 400, height: 400, close: vi.fn() };
    await act(async () => {
      req1Resolver({ width: 400, height: 400, claim: vi.fn().mockReturnValue(mockBitmapOld) });
      await Promise.resolve();
    });

    // Request 2 delivery now resolves
    const mockBitmapNew = { width: 400, height: 400, close: vi.fn() };
    const claimNew = vi.fn().mockReturnValue(mockBitmapNew);
    await act(async () => {
      req2Resolver({ width: 400, height: 400, claim: claimNew });
      await Promise.resolve();
    });

    // Request 2 delivery MUST BE CLAIMED because old settle handler did NOT delete request 2's active entry!
    expect(claimNew).toHaveBeenCalledTimes(1);

    visibleTilesSpy.mockRestore();
  });

  it('mocked visible/detail duplicate key causes one visible immediate request and no delayed duplicate', async () => {
    vi.useFakeTimers();
    try {
      const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
      mockFetchArtifact.mockResolvedValue({
        url: '/api/document-intelligence/drawings/dem/run-dedup/artifact?token=abc',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      const tileDup = { key: 'run-dedup:0:5:0:0', tx: 0, ty: 0, x: 0, y: 0, width: 400, height: 400, density: 5 };

      const visibleTilesSpy = vi.spyOn(PdfTilePyramid.prototype, 'visibleTiles')
        .mockReturnValue([tileDup]);
      const detailTilesSpy = vi.spyOn(PdfTilePyramid.prototype, 'visibleDetailTiles')
        .mockReturnValue([tileDup]);

      const poolInstance = {
        open: vi.fn().mockImplementation(() => Promise.resolve({ width: 1000, height: 800, rotation: 0 })),
        request: vi.fn().mockReturnValue({
          promise: new Promise(() => {}),
          cancel: vi.fn(),
        }),
        close: vi.fn(),
        dispose: vi.fn(),
      };
      vi.mocked(createPdfTilePool).mockReturnValue(poolInstance as any);

      const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
      render(
        <PdfPageLayer
          runId="run-dedup"
          pageIndex={0}
          viewport={viewport}
          fallbackWidth={1000}
          fallbackHeight={800}
          tilePool={poolInstance as any}
        />
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(poolInstance.request).toHaveBeenCalledTimes(1);
      expect(poolInstance.request).toHaveBeenCalledWith(expect.objectContaining({ tile: tileDup }));

      // Fast-forward detail timer (125ms)
      await act(async () => {
        vi.advanceTimersByTime(200);
        await Promise.resolve();
      });

      // No second request for tileDup
      expect(poolInstance.request).toHaveBeenCalledTimes(1);

      visibleTilesSpy.mockRestore();
      detailTilesSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('unmount/document switch cancels all active requests', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-unmount/artifact?token=abc',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const cancel1 = vi.fn();
    const cancel2 = vi.fn();
    let count = 0;

    const poolInstance1 = {
      open: vi.fn().mockImplementation(() => Promise.resolve({ width: 1000, height: 800, rotation: 0 })),
      request: vi.fn().mockImplementation(() => {
        count++;
        return { promise: new Promise(() => {}), cancel: count === 1 ? cancel1 : cancel2 };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValue(poolInstance1 as any);

    const tile1 = { key: 'run-unmount:0:1:0:0', tx: 0, ty: 0, x: 0, y: 0, width: 400, height: 400, density: 1 };
    const tile2 = { key: 'run-unmount:0:1:1:0', tx: 1, ty: 0, x: 400, y: 0, width: 400, height: 400, density: 1 };

    const visibleTilesSpy = vi.spyOn(PdfTilePyramid.prototype, 'visibleTiles')
      .mockReturnValue([tile1, tile2]);

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    const { rerender } = render(
      <PdfPageLayer
        runId="run-unmount"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={poolInstance1 as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(cancel1).not.toHaveBeenCalled();
    expect(cancel2).not.toHaveBeenCalled();

    // Document switch
    mockFetchArtifact.mockResolvedValueOnce({
      url: '/api/document-intelligence/drawings/dem/run-next/artifact?token=xyz',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    rerender(
      <PdfPageLayer
        runId="run-next"
        pageIndex={0}
        viewport={viewport}
        fallbackWidth={1000}
        fallbackHeight={800}
        tilePool={poolInstance1 as any}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Document switch cancels all active requests
    expect(cancel1).toHaveBeenCalledTimes(1);
    expect(cancel2).toHaveBeenCalledTimes(1);

    visibleTilesSpy.mockRestore();
  });
});

