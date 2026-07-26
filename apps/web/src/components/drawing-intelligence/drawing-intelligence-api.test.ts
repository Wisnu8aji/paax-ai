// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeArtifactExpiry,
  fetchPdfArtifactUrl,
  PDF_ARTIFACT_REFRESH_SKEW_MS,
} from './drawing-intelligence-api';

describe('drawing-intelligence-api: PDF Artifact Expiry and Fetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('normalizeArtifactExpiry boundaries', () => {
    it('handles numeric and numeric-string boundary cases at 9_999_999_999, 10_000_000_000, 999_999_999_999, 1_000_000_000_000', () => {
      // 9_999_999_999 <= 9_999_999_999 => epoch seconds
      const secNum = 9_999_999_999;
      const expectedSecIso = new Date(secNum * 1000).toISOString();
      expect(normalizeArtifactExpiry(secNum)).toBe(expectedSecIso);
      expect(normalizeArtifactExpiry(String(secNum))).toBe(expectedSecIso);

      // 10_000_000_000 (11 digits) => ambiguous => reject
      expect(() => normalizeArtifactExpiry(10_000_000_000)).toThrow();
      expect(() => normalizeArtifactExpiry('10000000000')).toThrow();

      // 999_999_999_999 (12 digits) => ambiguous => reject
      expect(() => normalizeArtifactExpiry(999_999_999_999)).toThrow();
      expect(() => normalizeArtifactExpiry('999999999999')).toThrow();

      // 1_000_000_000_000 (13 digits) => epoch milliseconds
      const msNum = 1_000_000_000_000;
      const expectedMsIso = new Date(msNum).toISOString();
      expect(normalizeArtifactExpiry(msNum)).toBe(expectedMsIso);
      expect(normalizeArtifactExpiry(String(msNum))).toBe(expectedMsIso);

      // null and undefined runtime guards
      expect(() => normalizeArtifactExpiry(null as unknown as string)).toThrow();
      expect(() => normalizeArtifactExpiry(undefined as unknown as string)).toThrow();
    });
  });

  describe('fetchPdfArtifactUrl controlled Date.now and fetch tests', () => {
    it('rejects near/expired expiry (<= Date.now() + PDF_ARTIFACT_REFRESH_SKEW_MS) and succeeds for now+300s epoch seconds', async () => {
      const fixedNowMs = 1785067200000; // 2026-07-26T12:00:00.000Z
      vi.spyOn(Date, 'now').mockReturnValue(fixedNowMs);

      // 1) Expired in the past (now - 10s)
      const pastEpochSec = Math.floor((fixedNowMs - 10_000) / 1000);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'past-token', expires_at: pastEpochSec }),
      } as Response);

      await expect(fetchPdfArtifactUrl('run-past')).rejects.toThrow();

      // 2) Near expiry (now + 30s <= now + 60s skew)
      const nearEpochSec = Math.floor((fixedNowMs + 30_000) / 1000);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'near-token', expires_at: nearEpochSec }),
      } as Response);

      await expect(fetchPdfArtifactUrl('run-near')).rejects.toThrow();

      // 3) Exactly at skew boundary (now + 60s)
      const exactSkewEpochSec = Math.floor((fixedNowMs + PDF_ARTIFACT_REFRESH_SKEW_MS) / 1000);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'skew-token', expires_at: exactSkewEpochSec }),
      } as Response);

      await expect(fetchPdfArtifactUrl('run-skew')).rejects.toThrow();

      // 4) Authoritative backend style: now + 300 seconds epoch seconds => succeeds
      const backendNow300Sec = Math.floor(fixedNowMs / 1000) + 300;
      const expectedIso = new Date(backendNow300Sec * 1000).toISOString();
      const rawToken = 'tok+en=val/';
      const encodedToken = encodeURIComponent(rawToken);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: rawToken, expires_at: backendNow300Sec }),
      } as Response);

      const result = await fetchPdfArtifactUrl('run-valid');
      expect(result).toEqual({
        url: `/api/document-intelligence/drawings/dem/run-valid/artifact?token=${encodedToken}`,
        expiresAt: expectedIso,
      });
      expect(result.url).toBe(
        `/api/document-intelligence/drawings/dem/run-valid/artifact?token=${encodeURIComponent('tok+en=val/')}`
      );
    });
  });
});
