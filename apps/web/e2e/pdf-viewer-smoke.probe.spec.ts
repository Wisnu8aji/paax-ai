/**
 * PAAX PDF Viewer — Wave 0 smoke probe (F5 owned).
 *
 * Validates the viewer interaction surface against the live runtime BEFORE the
 * full baseline harness runs. This is a throwaway probe: it confirms selectors
 * and interaction semantics on the CURRENT (legacy) viewer so the baseline
 * recorder measures real behavior, not test artifacts.
 *
 * Environment: DI_E2E_URL (default http://127.0.0.1:3000/drawing-intelligence),
 * DI_E2E_PROJECT_ID (default PLHUT-SURAKARTA).
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';

test('smoke: viewer surface, sheet select, diagnostics attributes', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await expect(page.getByRole('tab', { name: /^Review\b/ })).toHaveAttribute('aria-selected', 'true');
  const sheetOne = page.locator('[data-page-number="1"]').first();
  await sheetOne.waitFor({ timeout: 60000 });
  await sheetOne.click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(5000);

  const layerInfo = await page.evaluate(() => {
    const layer = document.querySelector('[data-testid="pdf-page-layer"]');
    const surface = document.querySelector('[data-testid="di-canvas-page-surface"]');
    const viewport = document.querySelector('[data-testid="di-canvas-viewport"]');
    const allTestIds = Array.from(document.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid'));
    const zoomButtons = Array.from(document.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') || b.textContent?.trim()).filter(Boolean).slice(0, 30);
    return {
      layerAttrs: layer ? Array.from(layer.attributes).map((a) => `${a.name}=${a.value}`) : null,
      surfaceAttrs: surface ? Array.from(surface.attributes).map((a) => `${a.name}=${a.value}`) : null,
      hasViewport: !!viewport,
      allTestIds,
      zoomButtons,
      memory: (performance as any).memory ? { used: (performance as any).memory.usedJSHeapSize, total: (performance as any).memory.totalJSHeapSize } : null,
    };
  });
  console.log('LAYER_INFO ' + JSON.stringify(layerInfo, null, 2));
  expect(layerInfo.layerAttrs).not.toBeNull();
});
