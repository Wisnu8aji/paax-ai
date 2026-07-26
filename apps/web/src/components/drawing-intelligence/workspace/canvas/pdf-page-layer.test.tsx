// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { shouldRefreshArtifactUrl, PdfPageLayer } from './pdf-page-layer';
import { createPdfTilePool } from './pdf-tile-pool';
import { normalizeArtifactExpiry, fetchPdfArtifactUrl } from '../../drawing-intelligence-api';

vi.mock('../../drawing-intelligence-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../drawing-intelligence-api')>();
  return {
    ...actual,
    fetchPdfArtifactUrl: vi.fn(),
  };
});

vi.mock('./pdf-tile-pool', () => {
  return {
    createPdfTilePool: vi.fn(() => ({
      open: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ width: 1000, height: 800, rotation: 0 });
          }, 50);
        });
      }),
      request: vi.fn().mockReturnValue({
        promise: new Promise(() => {}),
        cancel: vi.fn(),
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    })),
  };
});

describe('Artifact Expiry Normalization', () => {
  it('artifact expires_at accepts ISO string, epoch seconds number, epoch seconds numeric string, epoch milliseconds number/string, and rejects invalid input', () => {
    // 1785067200 s = 1785067200000 ms = 2026-07-26T12:00:00.000Z
    expect(normalizeArtifactExpiry('2026-07-26T12:00:00.000Z')).toBe('2026-07-26T12:00:00.000Z');
    expect(normalizeArtifactExpiry(1785067200)).toBe('2026-07-26T12:00:00.000Z');
    expect(normalizeArtifactExpiry('1785067200')).toBe('2026-07-26T12:00:00.000Z');
    expect(normalizeArtifactExpiry(1785067200000)).toBe('2026-07-26T12:00:00.000Z');
    expect(normalizeArtifactExpiry('1785067200000')).toBe('2026-07-26T12:00:00.000Z');

    expect(() => normalizeArtifactExpiry('invalid-date')).toThrow();
    expect(() => normalizeArtifactExpiry('')).toThrow();
    expect(() => normalizeArtifactExpiry(NaN)).toThrow();
    expect(() => normalizeArtifactExpiry(-100)).toThrow();
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

  it('shouldRefreshArtifactUrl correctly handles normalized inputs', () => {
    expect(shouldRefreshArtifactUrl('2026-07-26T12:00:30.000Z', new Date('2026-07-26T12:00:00.000Z'))).toBe(true);
    expect(shouldRefreshArtifactUrl(1785067230, new Date('2026-07-26T12:00:00.000Z'))).toBe(true);
    expect(shouldRefreshArtifactUrl('1785067230', new Date('2026-07-26T12:00:00.000Z'))).toBe(true);
    expect(shouldRefreshArtifactUrl('2026-07-26T12:10:00.000Z', new Date('2026-07-26T12:00:00.000Z'))).toBe(false);
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
      expiresAt: '2026-07-26T12:00:00.000Z',
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
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('pdf-page-layer')).not.toBeNull();

    mockFetchArtifact.mockResolvedValueOnce({
      url: '/api/document-intelligence/drawings/dem/run-2/artifact?token=xyz',
      expiresAt: '2026-07-26T12:00:00.000Z',
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
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('pdf-page-layer')).not.toBeNull();
  });

  it('ensures signed URL remains component-local', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    const mockUrl = '/api/document-intelligence/drawings/dem/run-local/artifact?token=secret123';
    mockFetchArtifact.mockResolvedValue({
      url: mockUrl,
      expiresAt: '2026-07-26T12:00:00.000Z',
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
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    const html = document.body.innerHTML;
    expect(html).not.toContain('secret123');
  });
});

describe('Worker and Document Generation Lifecycle (Phase 2B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a deferred tile request resolving after rerender to another runId/pageIndex must not set painted state for the old document', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=abc',
      expiresAt: '2026-07-26T12:00:00.000Z',
    });

    const resolvers1: Array<(result: any) => void> = [];
    const currentPool = {
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
    vi.mocked(createPdfTilePool).mockReturnValueOnce(currentPool as any);

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

    expect(currentPool.request).toHaveBeenCalled();
    expect(resolvers1.length).toBeGreaterThan(0);

    const resolvers2: Array<(result: any) => void> = [];
    const pool2 = {
      open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
      request: vi.fn().mockImplementation(() => {
        let resolve: (result: any) => void;
        const promise = new Promise<any>((res) => { resolve = res; });
        resolvers2.push(resolve!);
        return { promise, cancel: vi.fn() };
      }),
      close: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createPdfTilePool).mockReturnValueOnce(pool2 as any);

    mockFetchArtifact.mockResolvedValueOnce({
      url: '/api/document-intelligence/drawings/dem/run-2/artifact?token=xyz',
      expiresAt: '2026-07-26T12:00:00.000Z',
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

    const mockBitmap1 = { width: 256, height: 256, close: vi.fn() };
    await act(async () => {
      resolvers1[0]({ width: 256, height: 256, bitmap: mockBitmap1 });
      await Promise.resolve();
    });

    expect(mockBitmap1.close).toHaveBeenCalledTimes(1);
  });

  it('a deferred tile request resolving after unmount must not update React state and its unclaimed ImageBitmap must be closed exactly once', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=abc',
      expiresAt: '2026-07-26T12:00:00.000Z',
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
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(poolInstance.request).toHaveBeenCalled();
    expect(resolvers.length).toBeGreaterThan(0);

    unmount();

    const mockBitmap = { width: 256, height: 256, close: vi.fn() };
    await act(async () => {
      resolvers[0]({ width: 256, height: 256, bitmap: mockBitmap });
      await Promise.resolve();
    });

    expect(mockBitmap.close).toHaveBeenCalledTimes(1);
  });

  it('React.StrictMode mount-cleanup-remount creates a fresh pool and disposes each pool exactly once; no disposed pool is reused', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-strict/artifact?token=abc',
      expiresAt: '2026-07-26T12:00:00.000Z',
    });

    const createdPools: Array<{ dispose: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn> }> = [];
    vi.mocked(createPdfTilePool).mockImplementation(() => {
      const p = {
        open: vi.fn().mockResolvedValue({ width: 1000, height: 800, rotation: 0 }),
        request: vi.fn().mockReturnValue({
          promise: new Promise(() => {}),
          cancel: vi.fn(),
        }),
        close: vi.fn(),
        dispose: vi.fn(),
      };
      createdPools.push(p);
      return p as any;
    });

    const viewport = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
    const { unmount } = render(
      <React.StrictMode>
        <PdfPageLayer
          runId="run-strict"
          pageIndex={0}
          viewport={viewport}
          fallbackWidth={800}
          fallbackHeight={600}
        />
      </React.StrictMode>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createdPools.length).toBe(2);
    expect(createdPools[0].dispose).toHaveBeenCalledTimes(1);
    expect(createdPools[1].dispose).toHaveBeenCalledTimes(0);
    expect(createdPools[0].request).not.toHaveBeenCalled();

    unmount();

    expect(createdPools[0].dispose).toHaveBeenCalledTimes(1);
    expect(createdPools[1].dispose).toHaveBeenCalledTimes(1);
  });

  it('tile requests do not start for a new document until pool.open for that exact document generation resolves', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-1/artifact?token=abc',
      expiresAt: '2026-07-26T12:00:00.000Z',
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
    vi.mocked(createPdfTilePool).mockReturnValueOnce(pool2 as any);

    mockFetchArtifact.mockResolvedValueOnce({
      url: '/api/document-intelligence/drawings/dem/run-2/artifact?token=xyz',
      expiresAt: '2026-07-26T12:00:00.000Z',
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

    expect(pool2.open).toHaveBeenCalledWith(expect.objectContaining({ documentKey: 'run-2:0' }));
    expect(pool2.request).not.toHaveBeenCalled();

    await act(async () => {
      resolveOpen2({ width: 1000, height: 800, rotation: 0 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pool2.request).toHaveBeenCalled();
  });

  it('resolves an oversize tile result so TileLru.set returns false and bitmap.close is called exactly once', async () => {
    const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
    mockFetchArtifact.mockResolvedValue({
      url: '/api/document-intelligence/drawings/dem/run-oversize/artifact?token=abc',
      expiresAt: '2026-07-26T12:00:00.000Z',
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
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(requests.length).toBeGreaterThan(0);

    const mockBitmap = { width: 10000, height: 10000, close: vi.fn() };
    await act(async () => {
      requests[0]({ width: 10000, height: 10000, bitmap: mockBitmap });
      await Promise.resolve();
    });

    expect(mockBitmap.close).toHaveBeenCalledTimes(1);
  });

  it('does not request tiles during signed URL refresh open pending gap when viewport changes', async () => {
    vi.useFakeTimers();
    try {
      const mockFetchArtifact = vi.mocked(fetchPdfArtifactUrl);
      const now = Date.now();
      mockFetchArtifact.mockResolvedValueOnce({
        url: '/api/document-intelligence/drawings/dem/run-refresh/artifact?token=first',
        expiresAt: new Date(now + 120_000).toISOString(),
      });

      let resolveRefreshOpen!: (m: any) => void;
      const refreshOpenPromise = new Promise<any>((res) => { resolveRefreshOpen = res; });

      const poolInstance = {
        open: vi.fn()
          .mockResolvedValueOnce({ width: 1000, height: 800, rotation: 0 })
          .mockReturnValueOnce(refreshOpenPromise),
        request: vi.fn().mockReturnValue({
          promise: new Promise(() => {}),
          cancel: vi.fn(),
        }),
        close: vi.fn(),
        dispose: vi.fn(),
      };
      vi.mocked(createPdfTilePool).mockReturnValueOnce(poolInstance as any);

      const viewport1 = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 };
      const { rerender } = render(
        <PdfPageLayer
          runId="run-refresh"
          pageIndex={0}
          viewport={viewport1}
          fallbackWidth={800}
          fallbackHeight={600}
        />
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const initialRequestCount = poolInstance.request.mock.calls.length;
      expect(initialRequestCount).toBeGreaterThan(0);

      mockFetchArtifact.mockResolvedValueOnce({
        url: '/api/document-intelligence/drawings/dem/run-refresh/artifact?token=second',
        expiresAt: new Date(now + 240_000).toISOString(),
      });

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await Promise.resolve();
      });

      expect(poolInstance.close).toHaveBeenCalledWith('run-refresh:0');
      expect(poolInstance.open).toHaveBeenCalledTimes(2);

      const viewport2 = { x: 0.2, y: 0.2, width: 0.5, height: 0.5, zoom: 1, dpr: 1 };
      rerender(
        <PdfPageLayer
          runId="run-refresh"
          pageIndex={0}
          viewport={viewport2}
          fallbackWidth={800}
          fallbackHeight={600}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(poolInstance.request).toHaveBeenCalledTimes(initialRequestCount);

      await act(async () => {
        resolveRefreshOpen({ width: 1000, height: 800, rotation: 0 });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(poolInstance.request.mock.calls.length).toBeGreaterThan(initialRequestCount);
    } finally {
      vi.useRealTimers();
    }
  });
});
