/**
 * F5 owned — native mode probe: toggle feature flag to native, open a sheet,
 * capture the native layer's diagnostics + behavior against the served build.
 * Throwaway probe for environment characterization (not part of gate spec).
 */
import { test } from '@playwright/test';

const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';

test('native mode: toggle, mount, diagnostics snapshot', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  // Force native BEFORE opening any sheet (feature flag is read on mount).
  await page.evaluate(() => localStorage.setItem('paax.pdfViewerMode', 'native'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  // Poll for native layer mount
  let native = null;
  for (let i = 0; i < 120; i++) {
    native = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pdf-native-page-layer"]');
      return el ? Array.from(el.attributes).map((a) => `${a.name}=${a.value}`) : null;
    });
    if (native) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => {
    const nativeEl = document.querySelector('[data-testid="pdf-native-page-layer"]');
    const base = document.querySelector('[data-testid="pdf-native-base-canvas"]');
    const crops = Array.from(document.querySelectorAll('[data-testid="pdf-native-crop-canvas"]'));
    const surface = document.querySelector('[data-testid="di-canvas-page-surface"]');
    const underlay = document.querySelector('[data-testid="di-canvas-underlay"]');
    const toggle = document.querySelector('[data-testid="di-viewer-mode-toggle"]');
    return {
      nativeAttrs: nativeEl ? Array.from(nativeEl.attributes).map((a) => `${a.name}=${a.value}`) : null,
      base: base ? { w: base.getAttribute('width'), h: base.getAttribute('height'), style: base.getAttribute('style')?.slice(0, 120) } : null,
      cropCount: crops.length,
      crops: crops.map((c) => Array.from(c.attributes).map((a) => `${a.name}=${a.value}`).filter((a) => a.startsWith('data-'))),
      surfaceMode: surface?.getAttribute('data-viewer-mode'),
      underlayVisibility: underlay ? getComputedStyle(underlay).visibility : null,
      toggleText: toggle?.textContent?.trim() ?? null,
      status: document.querySelector('[role="status"]')?.textContent ?? null,
    };
  });
  console.log('NATIVE_ATTRS ' + JSON.stringify(native, null, 1));
  console.log('STATE ' + JSON.stringify(state, null, 1));
});
