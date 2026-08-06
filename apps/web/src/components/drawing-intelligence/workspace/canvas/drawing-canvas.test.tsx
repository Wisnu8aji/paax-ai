// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import React, { useLayoutEffect } from 'react';
import { DrawingCanvas, WHEEL_SETTLE_MS } from './drawing-canvas';
import type { PdfCoverageChangeEvent } from './pdf-page-layer';
import type { Sheet } from '../di-types';

const storeHolder = vi.hoisted(() => ({
  state: {
    activeSheetId: 's1',
    mappedSheets: [
      {
        id: 's1',
        runId: 'run-a',
        pageIndex: 0,
        imageUrl: 'http://example.test/thumb-a.png',
        widthPx: null,
        heightPx: null,
        scale: null,
      },
    ],
    canvas: { zoom: 1, panX: 0, panY: 0, tool: 'select', minimap: { visible: false, minimized: false, position: { x: 0, y: 0 } } },
    elements: [],
    overlays: {},
    selectedElementId: null,
    hoveredElementId: null,
  },
  dispatch: vi.fn(),
  sheet: null as Sheet | null,
  selectedElement: null,
}));

vi.mock('../workspace-store', () => ({
  useWorkspace: () => ({ state: storeHolder.state, dispatch: storeHolder.dispatch }),
  useActiveSheet: () => storeHolder.sheet,
  useSelectedElement: () => storeHolder.selectedElement,
}));

const layerProps = vi.hoisted(() => ({ current: null as null | { onMetrics: (m: { width: number; height: number; rotation: number }) => void; onCoverageChange: (e: PdfCoverageChangeEvent) => void } }));

vi.mock('./pdf-page-layer', () => ({
  PdfPageLayer: (props: any) => {
    layerProps.current = props;
    return null;
  },
}));

vi.mock('./canvas-toolbar', () => ({ CanvasToolbar: () => null }));
vi.mock('./zoom-bar', () => ({ ZoomBar: () => null }));
vi.mock('./selection-context-bar', () => ({ SelectionContextBar: () => null }));
vi.mock('./real-page-svg', () => ({ RealPageSvg: () => null }));
vi.mock('./sheet-plan-svg', () => ({ SheetPlanSvg: () => null, PLAN_MARGIN: 0 }));

function sheetFixture(runId: string, pageIndex: number, id: string): Sheet {
  return {
    id,
    fileId: 'f1',
    runId,
    pageIndex,
    code: 'A2-101',
    title: 'Test Sheet',
    originalPageName: 'Sheet 1',
    pageNumber: 1,
    floorId: 'F01',
    floorLabel: 'Lantai 1',
    disciplines: [],
    drawingType: 'Floor Plan',
    scale: '1:100',
    scaleConfirmed: false,
    revision: null,
    status: 'ready',
    reviewIssueCount: 0,
    sheetSize: 'A1 (841 x 594 mm)',
    analyzedOn: null,
    aiConfidence: null,
    geometry: { widthMm: 841, heightMm: 594, gridX: [], gridY: [], rooms: [] },
  };
}

/**
 * Layout-phase commit observer. React runs layout effects synchronously after
 * commit but BEFORE passive effects, so a snapshot taken here is exactly the
 * DOM state the browser would paint before the component's `useEffect`s run.
 * This is the only honest way to observe the "blink frame" the Task 4 review
 * warned about (drawing-canvas.test.tsx pre-fix could only see post-effect state).
 */
function CommitCapture({ onCommit }: { onCommit: () => void }) {
  useLayoutEffect(onCommit);
  return null;
}

function sheetWith(runId: string, pageIndex: number, id = `${runId}-${pageIndex}`) {
  return {
    id,
    runId,
    pageIndex,
    imageUrl: `http://example.test/thumb-${id}.png`,
    widthPx: null,
    heightPx: null,
    scale: null,
  };
}

function coverageEvent(documentKey: string, generation: number, ready: boolean): PdfCoverageChangeEvent {
  return { documentKey, generation, ready, coverage: ready ? 1 : 0, renderer: 'webgl2' };
}

const canvasPatches = () => storeHolder.dispatch.mock.calls.filter((call) => call[0]?.type === 'canvas').map((call) => call[0].patch as { zoom: number; panX: number; panY: number });

beforeEach(() => {
  storeHolder.state.activeSheetId = 's1';
  storeHolder.state.mappedSheets = [sheetWith('run-a', 0, 's1')];
  storeHolder.state.canvas = { zoom: 1, panX: 0, panY: 0, tool: 'select', minimap: { visible: false, minimized: false, position: { x: 0, y: 0 } } };
  storeHolder.state.elements = [];
  storeHolder.state.overlays = {};
  storeHolder.state.selectedElementId = null;
  storeHolder.sheet = null;
  storeHolder.selectedElement = null;
  // Mirror the real reducer's canvas merge so committed state and the DOM
  // transform converge after pointer-up (honest convergence seam).
  storeHolder.dispatch = vi.fn((action) => {
    if (action?.type === 'canvas') {
      storeHolder.state.canvas = { ...storeHolder.state.canvas, ...action.patch };
    }
  });
  layerProps.current = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderCanvas() {
  const view = render(<DrawingCanvas />);
  const viewport = view.container.querySelector('[data-testid="di-canvas-viewport"]') as HTMLElement;
  const surface = view.container.querySelector('[data-testid="di-canvas-page-surface"]') as HTMLElement;
  return { ...view, viewport, surface };
}

describe('DrawingCanvas coverage underlay', () => {
  it('keeps the thumbnail mounted and reveals until coverage is ready', () => {
    const { container } = renderCanvas();
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.style.visibility).toBe('visible');
  });

  it('hides only on matching ready:true for the active document', () => {
    const { container } = renderCanvas();
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.style.visibility).toBe('visible');
    act(() => {
      layerProps.current!.onCoverageChange(coverageEvent('run-a:0', 1, true));
    });
    expect(img.style.visibility).toBe('hidden');
    // M1: the underlay stays in the live DOM while hidden — a detached node's
    // inline style would still read 'hidden', so re-query the mounted tree.
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('ignores a wrong-document coverage event even when it arrives first', () => {
    const { container } = renderCanvas();
    act(() => {
      layerProps.current!.onCoverageChange(coverageEvent('run-b:1', 5, true));
    });
    act(() => {
      layerProps.current!.onCoverageChange(coverageEvent('run-a:0', 1, true));
    });
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.style.visibility).toBe('hidden');
  });

  it('renders the new document visible in the same commit that switches sheets, before any passive effect', () => {
    const snapshots: Array<{ height: string; visibility: string }> = [];
    let switched = false;
    const onCommit = () => {
      if (!switched) return;
      const surface = document.querySelector('[data-testid="di-canvas-page-surface"]') as HTMLElement | null;
      const img = surface?.querySelector('img[aria-hidden="true"]') as HTMLImageElement | null;
      snapshots.push({ height: surface?.style.height ?? '', visibility: img?.style.visibility ?? 'missing' });
    };
    const view = render(
      <>
        <CommitCapture onCommit={onCommit} />
        <DrawingCanvas />
      </>,
    );
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
      layerProps.current!.onCoverageChange(coverageEvent('run-a:0', 1, true));
    });
    storeHolder.state.activeSheetId = 's2';
    storeHolder.state.mappedSheets = [sheetWith('run-b', 1, 's2')];
    switched = true;
    view.rerender(
      <>
        <CommitCapture onCommit={onCommit} />
        <DrawingCanvas />
      </>,
    );
    // The switch commit must already use the fallback aspect (1.0 => 1400px)
    // and show the new document's underlay — the passive reset effect has not
    // run yet, so any aspect/coverage from run-a here is a real painted-frame bug.
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[snapshots.length - 1].height).toBe('1400px');
    expect(snapshots[snapshots.length - 1].visibility).toBe('visible');
  });

  it('resets fit, metrics, and coverage when a stable sheet id is remapped to a new run/page', () => {
    const { container, rerender } = renderCanvas();
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
      layerProps.current!.onCoverageChange(coverageEvent('run-a:0', 1, true));
    });
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.style.visibility).toBe('hidden');
    const before = canvasPatches().length;
    storeHolder.state.mappedSheets = [sheetWith('run-b', 1, 's1')];
    rerender(<DrawingCanvas />);
    expect(img.style.visibility).toBe('visible');
    expect(canvasPatches().length).toBeGreaterThan(before);
  });

  it('ignores wrong-document and older-generation events', () => {
    const { container } = renderCanvas();
    const img = container.querySelector('img') as HTMLImageElement;
    act(() => {
      layerProps.current!.onCoverageChange(coverageEvent('run-a:0', 1, true));
    });
    expect(img.style.visibility).toBe('hidden');
    act(() => {
      layerProps.current!.onCoverageChange(coverageEvent('run-b:1', 2, false));
      layerProps.current!.onCoverageChange(coverageEvent('run-a:0', 0, false));
    });
    expect(img.style.visibility).toBe('hidden');
  });

  it('reveals again on newer ready:false and keeps the img mounted', () => {
    const { container } = renderCanvas();
    const img = container.querySelector('img') as HTMLImageElement;
    act(() => {
      layerProps.current!.onCoverageChange(coverageEvent('run-a:0', 1, true));
    });
    expect(img.style.visibility).toBe('hidden');
    act(() => {
      layerProps.current!.onCoverageChange(coverageEvent('run-a:0', 2, false));
    });
    expect(img.style.visibility).toBe('visible');
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('resets to revealed on sheet switch', () => {
    const { container, rerender } = renderCanvas();
    const img = container.querySelector('img') as HTMLImageElement;
    act(() => {
      layerProps.current!.onCoverageChange(coverageEvent('run-a:0', 1, true));
    });
    expect(img.style.visibility).toBe('hidden');
    storeHolder.state.activeSheetId = 's2';
    storeHolder.state.mappedSheets = [sheetWith('run-b', 1, 's2')];
    rerender(<DrawingCanvas />);
    expect(img.style.visibility).toBe('visible');
  });
});

describe('DrawingCanvas document-keyed fit', () => {
  it('fits the active sheet with provisional sheet dimensions on first visit', () => {
    renderCanvas();
    const patches = canvasPatches();
    expect(patches.length).toBe(1);
    expect(patches[0].zoom).toBeGreaterThan(0);
  });

  it('applies a corrective fit when exact metrics arrive for the active document', () => {
    renderCanvas();
    const before = canvasPatches().length;
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
    });
    const patches = canvasPatches();
    expect(patches.length).toBe(before + 1);
    expect(patches[patches.length - 1].zoom).toBeGreaterThan(0);
  });

  it('does not refit when cached metrics make exact metrics equivalent', () => {
    renderCanvas();
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
    });
    const afterExact = canvasPatches().length;
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
    });
    expect(canvasPatches().length).toBe(afterExact);
  });

  it('ignores a stale metrics callback bound to the previous document', () => {
    const view = renderCanvas();
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
    });
    const staleHandler = layerProps.current!.onMetrics;
    const before = canvasPatches().length;
    storeHolder.state.activeSheetId = 's2';
    storeHolder.state.mappedSheets = [sheetWith('run-b', 1, 's2')];
    view.rerender(<DrawingCanvas />);
    const afterSwitch = canvasPatches().length;
    expect(afterSwitch).toBeGreaterThan(before);
    act(() => {
      staleHandler({ width: 999, height: 1, rotation: 0 });
    });
    expect(canvasPatches().length).toBe(afterSwitch);
  });

  it('does not refit fallback-to-exact upgrade after manual user zoom', () => {
    const { viewport } = renderCanvas();
    fireEvent.wheel(viewport, { deltaY: -100 });
    const before = canvasPatches().length;
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
    });
    expect(canvasPatches().length).toBe(before);
  });

  it('does not refit with exact metrics after a manual drag pan', () => {
    const { viewport } = renderCanvas();
    fireEvent.pointerDown(viewport, { button: 1, pointerId: 9, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(viewport, { pointerId: 9, clientX: 60, clientY: 40 });
    fireEvent.pointerUp(viewport, { pointerId: 9 });
    const before = canvasPatches().length;
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
    });
    expect(canvasPatches().length).toBe(before);
  });

  it('does not refit with exact metrics after minimap navigation', () => {
    storeHolder.sheet = sheetFixture('run-a', 0, 's1');
    storeHolder.state.canvas = {
      ...storeHolder.state.canvas,
      minimap: { visible: true, minimized: false, position: { x: 10, y: 10 } },
    };
    const { container } = renderCanvas();
    const preview = container.querySelector('[data-testid="di-minimap-preview"]') as HTMLElement | null;
    expect(preview).not.toBeNull();
    fireEvent.pointerDown(preview!, { pointerId: 5, clientX: 30, clientY: 20 });
    const before = canvasPatches().length;
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
    });
    expect(canvasPatches().length).toBe(before);
  });
});

describe('DrawingCanvas pointer convergence and GPU promotion', () => {
  it('commits the pending pan on pointer-up even when the RAF never fires', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 42);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { viewport, surface } = renderCanvas();
    const startPanX = storeHolder.state.canvas.panX;
    const startPanY = storeHolder.state.canvas.panY;
    fireEvent.pointerDown(viewport, { button: 1, pointerId: 7, clientX: 10, clientY: 10 });
    expect(surface.style.willChange).toBe('transform');
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 40, clientY: 30 });
    fireEvent.pointerUp(viewport, { pointerId: 7 });
    const patches = canvasPatches();
    expect(patches[patches.length - 1]).toEqual({ panX: startPanX + 30, panY: startPanY + 20 });
    expect(raf).toHaveBeenCalled();
    expect(surface.style.willChange).toBe('');
    // DOM transform converges to the committed state in the same event batch.
    expect(surface.style.transform).toBe(
      `translate3d(${startPanX + 30}px, ${startPanY + 20}px, 0) scale(${storeHolder.state.canvas.zoom})`,
    );
    raf.mockRestore();
  });

  it('uses translate3d for the declarative page surface', () => {
    const { surface } = renderCanvas();
    expect(surface.style.transform).toMatch(/^translate3d\(.*px, .*px, 0\) scale\(/);
  });

  it('executes the imperative translate3d drag transform when the RAF fires', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { viewport, surface } = renderCanvas();
    const startPanX = storeHolder.state.canvas.panX;
    const startPanY = storeHolder.state.canvas.panY;
    fireEvent.pointerDown(viewport, { button: 1, pointerId: 11, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(viewport, { pointerId: 11, clientX: 55, clientY: 35 });
    // The imperative path must have applied the pending pan via translate3d
    // even though no React render happened for this frame.
    expect(surface.style.transform).toBe(
      `translate3d(${startPanX + 45}px, ${startPanY + 25}px, 0) scale(${storeHolder.state.canvas.zoom})`,
    );
    fireEvent.pointerUp(viewport, { pointerId: 11 });
    raf.mockRestore();
  });

  it('clears will-change after the wheel settle window, resetting the deadline on repeated wheels', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 42);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { viewport, surface } = renderCanvas();
    fireEvent.wheel(viewport, { deltaY: -100 });
    expect(surface.style.willChange).toBe('transform');
    act(() => {
      vi.advanceTimersByTime(WHEEL_SETTLE_MS - 50);
    });
    fireEvent.wheel(viewport, { deltaY: -100 });
    expect(surface.style.willChange).toBe('transform');
    act(() => {
      vi.advanceTimersByTime(WHEEL_SETTLE_MS - 50);
    });
    expect(surface.style.willChange).toBe('transform');
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(surface.style.willChange).toBe('');
  });

  it('clears will-change and pending pan on sheet switch', () => {
    const view = renderCanvas();
    fireEvent.wheel(view.viewport, { deltaY: -100 });
    expect(view.surface.style.willChange).toBe('transform');
    storeHolder.state.activeSheetId = 's2';
    storeHolder.state.mappedSheets = [sheetWith('run-b', 1, 's2')];
    view.rerender(<DrawingCanvas />);
    expect(view.surface.style.willChange).toBe('');
  });
});

describe('DrawingCanvas PAAX zoom ceiling and PDF-point surface (F4)', () => {
  it('clamps zoom at the new ceiling of 32 (was 8)', () => {
    const view = renderCanvas();
    storeHolder.state.canvas.zoom = 100;
    view.rerender(<DrawingCanvas />); // re-register keyboard effect with the new zoom
    fireEvent.keyDown(window, { key: '+' }); // 100 × 1.2 = 120 → clamped
    expect(storeHolder.state.canvas.zoom).toBe(32);
  });

  it('keeps the 0.08 zoom floor', () => {
    const view = renderCanvas();
    storeHolder.state.canvas.zoom = 0.05;
    view.rerender(<DrawingCanvas />);
    fireEvent.keyDown(window, { key: '-' }); // 0.05 / 1.2 ≈ 0.042 → clamped
    expect(storeHolder.state.canvas.zoom).toBe(0.08);
  });

  it('does not clamp ordinary in-range zooms', () => {
    const view = renderCanvas();
    storeHolder.state.canvas.zoom = 4;
    view.rerender(<DrawingCanvas />);
    fireEvent.keyDown(window, { key: '+' }); // 4 × 1.2 = 4.8, within range
    expect(storeHolder.state.canvas.zoom).toBeCloseTo(4.8, 6);
  });

  it('sizes the page surface in PDF points once exact metrics arrive (1px = 1pt)', () => {
    const { surface } = renderCanvas();
    // Before metrics: fallback 1400px surface (fit/pan math unchanged).
    expect(surface.style.width).toBe('1400px');
    expect(surface.style.height).toBe('1400px');
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
    });
    // After metrics: surface maps 1 CSS px = 1 PDF pt (detail overlay 1:1).
    expect(surface.style.width).toBe('1000px');
    expect(surface.style.height).toBe('700px');
  });

  it('never lets previous-document metrics resize the new document surface', () => {
    const view = renderCanvas();
    act(() => {
      layerProps.current!.onMetrics({ width: 1000, height: 700, rotation: 0 });
    });
    expect(view.surface.style.width).toBe('1000px');
    storeHolder.state.activeSheetId = 's2';
    storeHolder.state.mappedSheets = [sheetWith('run-b', 1, 's2')];
    view.rerender(<DrawingCanvas />);
    // The switch commit must already fall back to the provisional 1400px
    // surface — run-a's 1000×700 metrics never drive run-b's surface.
    expect(view.surface.style.width).toBe('1400px');
    expect(view.surface.style.height).toBe('1400px');
  });
});

describe('DrawingCanvas viewer engine feature flag (F4: legacy | native)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to the legacy viewer and renders the demo toggle', () => {
    const view = renderCanvas();
    expect(view.surface.dataset.viewerMode).toBe('legacy');
    // Legacy path mounts the PdfPageLayer mock; no native layer.
    expect(view.container.querySelector('[data-testid="pdf-native-page-layer"]')).toBeNull();
    expect(layerProps.current).not.toBeNull();
    const toggle = view.container.querySelector('[data-testid="di-viewer-mode-toggle"] button') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.dataset.viewerMode).toBe('legacy');
  });

  it('switches to the native viewer via the flag (localStorage) and back via the toggle', () => {
    const view = renderCanvas();
    expect(view.surface.dataset.viewerMode).toBe('legacy');
    // Enable native through the persisted flag (rollback-safe default is legacy).
    layerProps.current = null; // forget the legacy call from the initial render
    act(() => {
      window.localStorage.setItem('paax.pdfViewerMode', 'native');
      window.dispatchEvent(new StorageEvent('storage', { key: 'paax.pdfViewerMode', newValue: 'native' }));
    });
    expect(view.surface.dataset.viewerMode).toBe('native');
    // Native layer mounted (real component, F2 mock adapter default);
    // legacy layer mock is NOT invoked in native mode.
    expect(view.container.querySelector('[data-testid="pdf-native-page-layer"]')).toBeTruthy();
    expect(layerProps.current).toBeNull();

    // Toggle back to legacy — the rollback path.
    const toggle = view.container.querySelector('[data-testid="di-viewer-mode-toggle"] button') as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(view.surface.dataset.viewerMode).toBe('legacy');
    expect(view.container.querySelector('[data-testid="pdf-native-page-layer"]')).toBeNull();
    expect(layerProps.current).not.toBeNull();
  });
});
