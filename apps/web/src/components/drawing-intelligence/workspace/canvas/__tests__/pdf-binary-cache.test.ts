import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  fetchPdfBinary,
  clearPdfBinaryCache,
  validatePdfMagicHeader,
  PdfSignedUrlError,
  PdfArtifactFetchError,
  PdfValidationError,
} from '../pdf-binary-cache';

vi.mock('../../../drawing-intelligence-api', () => ({
  fetchPdfArtifactUrl: vi.fn(),
  PDF_ARTIFACT_REFRESH_SKEW_MS: 30000,
}));

import { fetchPdfArtifactUrl } from '../../../drawing-intelligence-api';

describe('pdf-binary-cache', () => {
  beforeEach(() => {
    clearPdfBinaryCache();
    vi.clearAllMocks();
  });

  describe('validatePdfMagicHeader', () => {
    it('accepts valid %PDF- header', () => {
      const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]).buffer;
      expect(() => validatePdfMagicHeader(buffer)).not.toThrow();
    });

    it('rejects buffer shorter than 5 bytes', () => {
      const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
      expect(() => validatePdfMagicHeader(buffer)).toThrow(PdfValidationError);
    });

    it('rejects buffer with non-PDF magic bytes', () => {
      const buffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).buffer;
      expect(() => validatePdfMagicHeader(buffer)).toThrow(PdfValidationError);
    });
  });

  describe('fetchPdfBinary', () => {
    it('fetches PDF binary via signed URL and caches single-flight promise per runId', async () => {
      const mockPdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00]);
      vi.mocked(fetchPdfArtifactUrl).mockResolvedValue({
        url: '/api/document-intelligence/drawings/dem/run-100/artifact?token=valid-signed-token',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        arrayBuffer: async () => mockPdfData.buffer,
      });
      vi.stubGlobal('fetch', mockFetch);

      const firstCall = fetchPdfBinary('run-100');
      const secondCall = fetchPdfBinary('run-100');

      expect(firstCall).toBe(secondCall);

      const buffer = await firstCall;
      expect(buffer).toBe(mockPdfData.buffer);

      expect(fetchPdfArtifactUrl).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/document-intelligence/drawings/dem/run-100/artifact?token=valid-signed-token',
        { method: 'GET', cache: 'no-store' },
      );

      vi.unstubAllGlobals();
    });

    it('throws PdfSignedUrlError when fetching artifact URL fails', async () => {
      vi.mocked(fetchPdfArtifactUrl).mockRejectedValue(new Error('Signed URL generation failed'));

      await expect(fetchPdfBinary('run-err')).rejects.toThrow(PdfSignedUrlError);
    });

    it('throws PdfArtifactFetchError when HTTP download fails', async () => {
      vi.mocked(fetchPdfArtifactUrl).mockResolvedValue({
        url: '/api/document-intelligence/drawings/dem/run-404/artifact?token=valid-signed-token',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(fetchPdfBinary('run-404')).rejects.toThrow(PdfArtifactFetchError);

      vi.unstubAllGlobals();
    });

    it('throws PdfValidationError when magic bytes do not match %PDF-', async () => {
      vi.mocked(fetchPdfArtifactUrl).mockResolvedValue({
        url: '/api/document-intelligence/drawings/dem/run-bad/artifact?token=valid-signed-token',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        arrayBuffer: async () => new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]).buffer,
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(fetchPdfBinary('run-bad')).rejects.toThrow(PdfValidationError);

      vi.unstubAllGlobals();
    });
  });
});
