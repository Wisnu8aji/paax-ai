import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

import { isNormalizedEvidenceBox, pagePointAtViewport, RealPageSvg } from './real-page-svg';

describe('real page canvas coordinates', () => {
  it('accepts only normalized evidence boxes from an actual page coordinate space', () => {
    expect(isNormalizedEvidenceBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toBe(true);
    expect(isNormalizedEvidenceBox({ x: 100, y: 20, w: 30, h: 40 })).toBe(false);
  });

  it('keeps page coordinate selection stable through zoom and pan', () => {
    expect(pagePointAtViewport({ x: 250, y: 150, panX: 50, panY: 30, zoom: 2, baseWidth: 100 })).toEqual({ x: 1, y: 0.6 });
  });

  it('renders a local source image and only evidence with a safe coordinate space', () => {
    const html = renderToStaticMarkup(createElement(RealPageSvg, {
      imageUrl: '/fixtures/page.png',
      selectedElementId: null,
      onSelectElement: () => undefined,
      elements: [
        { id: 'safe', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
        { id: 'unsafe', bbox: { x: 10, y: 10, w: 20, h: 20 } },
      ] as any,
    }));
    expect(html).toContain('/fixtures/page.png');
    expect(html).toContain('data-evidence-id="safe"');
    expect(html).not.toContain('data-evidence-id="unsafe"');
  });
});
