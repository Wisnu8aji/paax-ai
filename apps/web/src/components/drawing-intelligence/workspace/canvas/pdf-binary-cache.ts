import { fetchPdfArtifactUrl } from '../../drawing-intelligence-api';

export class PdfSignedUrlError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PdfSignedUrlError';
  }
}

export class PdfArtifactFetchError extends Error {
  constructor(message: string, public readonly status?: number, public readonly cause?: unknown) {
    super(message);
    this.name = 'PdfArtifactFetchError';
  }
}

export class PdfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfValidationError';
  }
}

export class PdfjsParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PdfjsParseError';
  }
}

const pdfBinaryCache = new Map<string, Promise<ArrayBuffer>>();

/**
 * Validates that an ArrayBuffer starts with the standard PDF magic header (%PDF-).
 */
export function validatePdfMagicHeader(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 5) {
    throw new PdfValidationError('Ukuran file PDF tidak boleh kosong atau terlalu kecil');
  }
  const bytes = new Uint8Array(buffer, 0, 5);
  // %PDF- magic bytes: 0x25, 0x50, 0x44, 0x46, 0x2D
  if (
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 ||
    bytes[4] !== 0x2d
  ) {
    throw new PdfValidationError('Header file PDF tidak valid (magic bytes %PDF- tidak ditemukan)');
  }
}

/**
 * Single-flight in-memory PDF binary cache.
 * Fetches the signed URL, downloads the PDF binary once per runId, and validates magic bytes.
 * The ArrayBuffer promise is cached in-memory and never re-downloaded when switching pages.
 */
export function fetchPdfBinary(runId: string): Promise<ArrayBuffer> {
  const existing = pdfBinaryCache.get(runId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    let signedUrlResponse: { url: string; expiresAt: string };
    try {
      signedUrlResponse = await fetchPdfArtifactUrl(runId);
    } catch (cause) {
      throw new PdfSignedUrlError(
        cause instanceof Error ? cause.message : 'Gagal memperoleh signed URL PAAX',
        cause,
      );
    }

    let response: Response;
    try {
      response = await fetch(signedUrlResponse.url, {
        method: 'GET',
        cache: 'no-store',
      });
    } catch (cause) {
      throw new PdfArtifactFetchError('Gagal mengunduh file PDF dari server', undefined, cause);
    }

    if (!response.ok) {
      throw new PdfArtifactFetchError(
        `Gagal mengunduh artifact PDF (HTTP status ${response.status})`,
        response.status,
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().includes('application/pdf') && !contentType.toLowerCase().includes('octet-stream')) {
      throw new PdfValidationError(`Tipe konten tidak valid: ${contentType}`);
    }

    let buffer: ArrayBuffer;
    try {
      buffer = await response.arrayBuffer();
    } catch (cause) {
      throw new PdfArtifactFetchError('Gagal membaca data biner PDF', response.status, cause);
    }

    try {
      validatePdfMagicHeader(buffer);
    } catch (error) {
      if (error instanceof PdfValidationError) {
        throw error;
      }
      throw new PdfValidationError(error instanceof Error ? error.message : 'Validasi biner PDF gagal');
    }

    return buffer;
  })().catch((error) => {
    // Evict failed promises so retries can attempt a fresh fetch.
    pdfBinaryCache.delete(runId);
    throw error;
  });

  pdfBinaryCache.set(runId, promise);
  return promise;
}

export function clearPdfBinaryCache(runId?: string): void {
  if (runId) {
    pdfBinaryCache.delete(runId);
  } else {
    pdfBinaryCache.clear();
  }
}
