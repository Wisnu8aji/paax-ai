// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { DrawingCanvas, WHEEL_SETTLE_MS } from './drawing-canvas';
import type { PdfCoverageChangeEvent } from './pdf-page-layer';

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
  sheet: null,
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
vi.mock('./minimap', () => ({ Minimap: () => null }));
vi.mock('./selection-context-bar', () => ({ SelectionContextBar: () => null }));
vi.mock('./real-page-svg', () => ({ RealPageSvg: () => null }));
vi.mock('./sheet-plan-svg', () => ({ SheetPlanSvg: () => null }));

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
