// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  getPdfViewerMode,
  setPdfViewerMode,
  usePdfViewerMode,
  PDF_VIEWER_MODE_STORAGE_KEY,
  PDF_VIEWER_MODE_DEFAULT,
  PDF_VIEWER_MODE_EVENT,
  isPdfViewerMode,
} from './pdf-viewer-feature-flag';

function memoryStorage(): Storage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  } as Storage & { store: Map<string, string> };
}

function ViewerProbe() {
  const mode = usePdfViewerMode();
  return <div data-testid="probe">{mode}</div>;
}

describe('pdf-viewer-feature-flag', () => {
  let storage: Storage & { store: Map<string, string> };

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    window.dispatchEvent(new CustomEvent(PDF_VIEWER_MODE_EVENT, { detail: PDF_VIEWER_MODE_DEFAULT }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('defaults to legacy when storage is empty', () => {
    expect(getPdfViewerMode(storage)).toBe('legacy');
  });

  it('returns the persisted native mode', () => {
    setPdfViewerMode('native', storage);
    expect(getPdfViewerMode(storage)).toBe('native');
  });

  it('falls back to legacy on unknown/corrupt values (rollback safety)', () => {
    storage.setItem(PDF_VIEWER_MODE_STORAGE_KEY, 'webgl-turbo');
    expect(getPdfViewerMode(storage)).toBe('legacy');
    storage.setItem(PDF_VIEWER_MODE_STORAGE_KEY, '');
    expect(getPdfViewerMode(storage)).toBe('legacy');
  });

  it('ignores invalid writes and never persists them', () => {
    setPdfViewerMode('sideways' as never, storage);
    expect(storage.getItem(PDF_VIEWER_MODE_STORAGE_KEY)).toBeNull();
    expect(getPdfViewerMode(storage)).toBe('legacy');
  });

  it('isPdfViewerMode validates the union', () => {
    expect(isPdfViewerMode('legacy')).toBe(true);
    expect(isPdfViewerMode('native')).toBe(true);
    expect(isPdfViewerMode('fancy')).toBe(false);
    expect(isPdfViewerMode(undefined)).toBe(false);
  });

  it('usePdfViewerMode renders the default and live-updates on setPdfViewerMode', () => {
    const view = render(<ViewerProbe />);
    expect(view.getByTestId('probe').textContent).toBe('legacy');
    act(() => {
      setPdfViewerMode('native');
    });
    expect(view.getByTestId('probe').textContent).toBe('native');
    act(() => {
      setPdfViewerMode('legacy');
    });
    expect(view.getByTestId('probe').textContent).toBe('legacy');
  });

  it('usePdfViewerMode reacts to cross-tab storage events', () => {
    const view = render(<ViewerProbe />);
    act(() => {
      storage.setItem(PDF_VIEWER_MODE_STORAGE_KEY, 'native');
      fireEvent(window, new StorageEvent('storage', { key: PDF_VIEWER_MODE_STORAGE_KEY, newValue: 'native' }));
    });
    expect(view.getByTestId('probe').textContent).toBe('native');
  });

  it('toggles between native and legacy (rollback path)', () => {
    const view = render(<ViewerProbe />);
    act(() => {
      setPdfViewerMode('native');
    });
    expect(view.getByTestId('probe').textContent).toBe('native');
    act(() => {
      setPdfViewerMode('legacy');
    });
    expect(view.getByTestId('probe').textContent).toBe('legacy');
    expect(getPdfViewerMode(storage)).toBe('legacy');
  });
});
