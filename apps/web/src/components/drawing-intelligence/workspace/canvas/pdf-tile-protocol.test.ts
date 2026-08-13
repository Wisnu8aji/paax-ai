import { describe, expect, it } from 'vitest';

import {
  isRenderTileDetailMessage,
  renderTileDensity,
  type DetailRenderRequest,
  type PdfWorkerInboundMessage,
  type RenderTileDetailMessage,
  type RenderTileLegacyMessage,
  type RenderTileMessage,
} from './pdf-tile-protocol';

/** Wire-shaped legacy render-tile message (as posted by pdf-tile-pool.ts today). */
function legacyRenderTileMessage(): RenderTileLegacyMessage {
  return {
    type: 'render-tile',
    requestId: 7,
    documentKey: 'run-1:A-101',
    pageNumber: 1,
    tile: { x: 0, y: 0, width: 512, height: 512, density: 2 },
  };
}

/** Wire-shaped extended render-tile message (arbitrary scale + dark flag). */
function detailRenderTileMessage(): RenderTileDetailMessage {
  return {
    type: 'render-tile',
    requestId: 8,
    documentKey: 'run-1:A-101',
    pageNumber: 1,
    tile: { x: 512, y: 0, width: 512, height: 512 },
    scale: 16,
    dark: true,
  };
}

describe('pdf-tile-protocol — backward compatibility', () => {
  it('accepts the legacy density-based message as a valid RenderTileMessage', () => {
    const legacy: RenderTileLegacyMessage = legacyRenderTileMessage();
    expect(legacy.tile.density).toBe(2);
    const asUnion: RenderTileMessage = legacy;
    expect('scale' in asUnion).toBe(false);
  });

  it('accepts the extended {scale, dark} message as a valid RenderTileMessage', () => {
    const detail: RenderTileDetailMessage = detailRenderTileMessage();
    expect(detail.scale).toBe(16);
    expect(detail.dark).toBe(true);
    const asUnion: RenderTileMessage = detail;
    expect('scale' in asUnion).toBe(true);
  });

  it('keeps the full inbound worker union wire-compatible with today', () => {
    const inbound: PdfWorkerInboundMessage[] = [
      { type: 'open-document', documentKey: 'run-1:A-101', pageNumber: 1, data: new ArrayBuffer(8) },
      { type: 'get-page-metrics', requestId: 1, documentKey: 'run-1:A-101', pageNumber: 1 },
      legacyRenderTileMessage(),
      detailRenderTileMessage(),
      { type: 'close-document', documentKey: 'run-1:A-101' },
      { type: 'close-run', runId: 'run-1' },
      { type: 'cancel', requestId: 7, documentKey: 'run-1:A-101' },
    ];
    expect(inbound.map((m) => m.type)).toEqual([
      'open-document',
      'get-page-metrics',
      'render-tile',
      'render-tile',
      'close-document',
      'close-run',
      'cancel',
    ]);
  });
});

describe('isRenderTileDetailMessage', () => {
  it('returns false for legacy density-based messages', () => {
    expect(isRenderTileDetailMessage(legacyRenderTileMessage())).toBe(false);
  });

  it('returns true for extended scale-based messages', () => {
    expect(isRenderTileDetailMessage(detailRenderTileMessage())).toBe(true);
  });

  it('treats a detail message without dark flag as extended too', () => {
    const { dark: _dark, ...noDark } = detailRenderTileMessage();
    expect(isRenderTileDetailMessage(noDark)).toBe(true);
  });

  it('returns false for non-render-tile or malformed payloads', () => {
    expect(isRenderTileDetailMessage(null)).toBe(false);
    expect(isRenderTileDetailMessage(undefined)).toBe(false);
    expect(isRenderTileDetailMessage('render-tile')).toBe(false);
    expect(isRenderTileDetailMessage({ type: 'open-document', scale: 4 })).toBe(false);
    expect(isRenderTileDetailMessage({ type: 'render-tile', scale: 'high' })).toBe(false);
    expect(isRenderTileDetailMessage({ type: 'render-tile' })).toBe(false);
  });
});

describe('renderTileDensity', () => {
  it('resolves legacy messages through tile.density', () => {
    expect(renderTileDensity(legacyRenderTileMessage())).toBe(2);
  });

  it('resolves extended messages through the arbitrary scale', () => {
    expect(renderTileDensity(detailRenderTileMessage())).toBe(16);
  });
});

describe('DetailRenderRequest', () => {
  it('carries the logical region, arbitrary scale, and optional dark flag', () => {
    const request: DetailRenderRequest = {
      documentKey: 'run-1:A-101',
      pageNumber: 1,
      region: { x: 100, y: 50, width: 1600, height: 900 },
      scale: 16, // zoom 8 × dpr 2 — arbitrary, uncapped by the pyramid
      dark: false,
    };
    expect(request.region.width).toBe(1600);
    expect(request.scale).toBe(16);
    expect(request.dark).toBe(false);

    // Dark flag is optional for the detail path.
    const withoutDark: DetailRenderRequest = {
      documentKey: 'run-1:A-101',
      pageNumber: 1,
      region: { x: 0, y: 0, width: 512, height: 512 },
      scale: 4,
    };
    expect(withoutDark.dark).toBeUndefined();
  });
});
