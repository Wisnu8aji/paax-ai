// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';
import { WorkspaceProvider, useWorkspace } from '../workspace-store';
import { Minimap } from './minimap';
import { CanvasToolbar } from './canvas-toolbar';
import type { Sheet } from '../di-types';

const MOCK_SHEET: Sheet = {
  id: 'sheet-1',
  fileId: 'file-1',
  code: 'A1-01',
  title: 'Ground Floor Plan',
  originalPageName: 'Page 1',
  pageNumber: 1,
  floorId: 'F01',
  floorLabel: 'Lantai 1',
  disciplines: ['ARC'],
  drawingType: 'Floor Plan',
  scale: '1:100',
  scaleConfirmed: true,
  revision: 'A',
  status: 'ready',
  reviewIssueCount: 0,
  sheetSize: 'A1',
  analyzedOn: '2026-07-26',
  aiConfidence: 95,
  geometry: {
    widthMm: 841,
    heightMm: 594,
    gridX: [],
    gridY: [],
    rooms: [],
  },
};

function StoreStateInspector({ onState }: { onState: (state: any) => void }) {
  const { state } = useWorkspace();
  React.useEffect(() => {
    onState(state);
  }, [state, onState]);
  return null;
}

describe('Minimap State & Controls', () => {
  let currentState: any = null;

  beforeEach(() => {
    currentState = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes canvas state with safe minimap defaults', () => {
    render(
      <WorkspaceProvider withMockData={false}>
        <StoreStateInspector onState={(s) => (currentState = s)} />
      </WorkspaceProvider>
    );

    expect(currentState.canvas.minimap).toEqual({
      visible: true,
      minimized: false,
      position: { x: 16, y: 16 },
    });
  });

  it('toggles minimap visibility from canvas toolbar button with accessible aria attributes', () => {
    render(
      <WorkspaceProvider withMockData={false}>
        <CanvasToolbar />
        <StoreStateInspector onState={(s) => (currentState = s)} />
      </WorkspaceProvider>
    );

    const toggleBtn = screen.getByRole('button', { name: /toggle minimap/i });
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');

    // Click to hide
    fireEvent.click(toggleBtn);
    expect(currentState.canvas.minimap.visible).toBe(false);
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('false');

    // Click to show again
    fireEvent.click(toggleBtn);
    expect(currentState.canvas.minimap.visible).toBe(true);
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('hides minimap on close without mutating page viewport (zoom/panX/panY)', () => {
    render(
      <WorkspaceProvider withMockData={false}>
        <Minimap
          sheet={MOCK_SHEET}
          elements={[]}
          overlays={{}}
          viewport={{ x: 0, y: 0, w: 1, h: 1 }}
          onNavigate={() => {}}
        />
        <StoreStateInspector onState={(s) => (currentState = s)} />
      </WorkspaceProvider>
    );

    const initialZoom = currentState.canvas.zoom;
    const initialPanX = currentState.canvas.panX;
    const initialPanY = currentState.canvas.panY;

    const closeBtn = screen.getByRole('button', { name: /close minimap/i });
    fireEvent.click(closeBtn);

    expect(currentState.canvas.minimap.visible).toBe(false);
    expect(currentState.canvas.zoom).toBe(initialZoom);
    expect(currentState.canvas.panX).toBe(initialPanX);
    expect(currentState.canvas.panY).toBe(initialPanY);
  });

  it('can minimize and restore minimap', () => {
    render(
      <WorkspaceProvider withMockData={false}>
        <Minimap
          sheet={MOCK_SHEET}
          elements={[]}
          overlays={{}}
          viewport={{ x: 0, y: 0, w: 1, h: 1 }}
          onNavigate={() => {}}
        />
        <StoreStateInspector onState={(s) => (currentState = s)} />
      </WorkspaceProvider>
    );

    const minimizeBtn = screen.getByRole('button', { name: /minimize minimap/i });
    fireEvent.click(minimizeBtn);
    expect(currentState.canvas.minimap.minimized).toBe(true);

    const restoreBtn = screen.getByRole('button', { name: /restore minimap/i });
    fireEvent.click(restoreBtn);
    expect(currentState.canvas.minimap.minimized).toBe(false);
  });

  it('persists minimized state while hidden and reopened', () => {
    render(
      <WorkspaceProvider withMockData={false}>
        <CanvasToolbar />
        <Minimap
          sheet={MOCK_SHEET}
          elements={[]}
          overlays={{}}
          viewport={{ x: 0, y: 0, w: 1, h: 1 }}
          onNavigate={() => {}}
        />
        <StoreStateInspector onState={(s) => (currentState = s)} />
      </WorkspaceProvider>
    );

    // Minimize
    const minimizeBtn = screen.getByRole('button', { name: /minimize minimap/i });
    fireEvent.click(minimizeBtn);
    expect(currentState.canvas.minimap.minimized).toBe(true);

    // Close minimap
    const closeBtn = screen.getByRole('button', { name: /close minimap/i });
    fireEvent.click(closeBtn);
    expect(currentState.canvas.minimap.visible).toBe(false);
    expect(currentState.canvas.minimap.minimized).toBe(true);

    // Reopen from toolbar
    const toggleBtn = screen.getByRole('button', { name: /toggle minimap/i });
    fireEvent.click(toggleBtn);

    // Assert minimized state persisted
    expect(currentState.canvas.minimap.visible).toBe(true);
    expect(currentState.canvas.minimap.minimized).toBe(true);
  });

  it('drags minimap to update position, clamps inside canvas bounds, and cleans up pointer handlers', () => {
    const setPointerCaptureMock = vi.fn();
    const releasePointerCaptureMock = vi.fn();

    const { container } = render(
      <WorkspaceProvider withMockData={false}>
        <div style={{ width: 800, height: 600, position: 'relative' }}>
          <Minimap
            sheet={MOCK_SHEET}
            elements={[]}
            overlays={{}}
            viewport={{ x: 0, y: 0, w: 1, h: 1 }}
            onNavigate={() => {}}
          />
        </div>
        <StoreStateInspector onState={(s) => (currentState = s)} />
      </WorkspaceProvider>
    );

    const minimapHeader = screen.getByText(/viewport navigator/i);
    const minimapPanel = minimapHeader.closest('.di-panel') as HTMLElement;
    minimapPanel.setPointerCapture = setPointerCaptureMock;
    minimapPanel.releasePointerCapture = releasePointerCaptureMock;

    // Simulate drag pointer down on header
    fireEvent.pointerDown(minimapHeader, {
      pointerId: 1,
      clientX: 500,
      clientY: 500,
      buttons: 1,
    });

    expect(setPointerCaptureMock).toHaveBeenCalledWith(1);

    // Drag pointer move
    fireEvent.pointerMove(window, {
      pointerId: 1,
      clientX: 400,
      clientY: 400,
    });

    // Position updated & clamped
    expect(currentState.canvas.minimap.position).toBeDefined();
    expect(typeof currentState.canvas.minimap.position.x).toBe('number');
    expect(typeof currentState.canvas.minimap.position.y).toBe('number');

    // Pointer up
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(releasePointerCaptureMock).toHaveBeenCalledWith(1);
  });
});
