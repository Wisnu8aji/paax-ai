/*
 * PAAX PDF viewer feature flag — `legacy` | `native`.
 *
 * ORION-F4 ownership (Master Plan PAAX-2026-08-06-review-pdf-viewer-native §5):
 * the viewer feature flag is F4's file. The legacy tile-pyramid viewer stays
 * selectable until the Arbiter approves cutover (DoD 25) — the flag is the
 * rollback switch, so `legacy` is the default.
 *
 * Storage: localStorage key `paax.pdfViewerMode`. The value is validated
 * against the union; anything unknown falls back to `legacy` so a stale or
 * corrupted value can never silently enable the experimental path.
 *
 * SSR-safe: `typeof window === 'undefined'` reads return the default.
 */
import { useCallback, useEffect, useState } from 'react';

export type PdfViewerMode = 'legacy' | 'native';

export const PDF_VIEWER_MODE_STORAGE_KEY = 'paax.pdfViewerMode';
export const PDF_VIEWER_MODE_DEFAULT: PdfViewerMode = 'legacy';

/** Storage event name re-dispatched by setPdfViewerMode for same-tab sync. */
export const PDF_VIEWER_MODE_EVENT = 'paax:pdf-viewer-mode';

export function isPdfViewerMode(value: unknown): value is PdfViewerMode {
  return value === 'legacy' || value === 'native';
}

/** Read the persisted mode. SSR and unknown/corrupt values fall back to legacy. */
export function getPdfViewerMode(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): PdfViewerMode {
  if (!storage) return PDF_VIEWER_MODE_DEFAULT;
  try {
    const raw = storage.getItem(PDF_VIEWER_MODE_STORAGE_KEY);
    return isPdfViewerMode(raw) ? raw : PDF_VIEWER_MODE_DEFAULT;
  } catch {
    return PDF_VIEWER_MODE_DEFAULT;
  }
}

/** Persist the mode. Dispatches a same-tab CustomEvent so live hooks update. */
export function setPdfViewerMode(mode: PdfViewerMode, storage: Pick<Storage, 'setItem'> | null = defaultStorage()): void {
  if (!isPdfViewerMode(mode)) return;
  if (storage) {
    try {
      storage.setItem(PDF_VIEWER_MODE_STORAGE_KEY, mode);
    } catch {
      // Storage full/unavailable — the in-memory event below still updates live hooks.
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PDF_VIEWER_MODE_EVENT, { detail: mode }));
  }
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Live mode hook. Re-reads on the same-tab CustomEvent and on cross-tab
 * `storage` events, so a toggle in any tab re-renders every viewer.
 */
export function usePdfViewerMode(): PdfViewerMode {
  const [mode, setMode] = useState<PdfViewerMode>(() => getPdfViewerMode());

  useEffect(() => {
    const sync = () => setMode(getPdfViewerMode());
    window.addEventListener(PDF_VIEWER_MODE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PDF_VIEWER_MODE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = useCallback(() => {
    setPdfViewerMode(getPdfViewerMode() === 'native' ? 'legacy' : 'native');
  }, []);

  return mode;
}
