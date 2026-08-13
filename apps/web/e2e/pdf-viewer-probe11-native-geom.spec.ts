import { test } from '@playwright/test';
const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';
test('native geometry + zoom behavior', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('paax.pdfViewerMode', 'native'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  await page.locator('[data-testid="pdf-native-page-layer"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  const before = await page.evaluate(() => {
    const surface = document.querySelector('[data-testid="di-canvas-page-surface"]');
    const base = document.querySelector('[data-testid="pdf-native-base"]');
    const layer = document.querySelector('[data-testid="pdf-native-page-layer"]');
    const crops = Array.from(document.querySelectorAll('[data-testid="pdf-native-crop"]'));
    return {
      surface: surface ? { w: surface.getAttribute('style')?.match(/width: ([^;]+)/)?.[1], h: surface.getAttribute('style')?.match(/height: ([^;]+)/)?.[1], transform: surface.getAttribute('style')?.match(/transform: ([^;]+)/)?.[1] } : null,
      base: base ? { w: base.getAttribute('width'), h: base.getAttribute('height'), cssW: base.style.width, cssH: base.style.height } : null,
      layerAttrs: layer ? Array.from(layer.attributes).map((a) => `${a.name}=${a.value}`) : null,
      cropCount: crops.length,
      crops: crops.map((c) => ({ attrs: Array.from(c.attributes).map((a) => `${a.name}=${a.value}`).filter((a) => a.startsWith('data-')), w: c.getAttribute('width'), h: c.getAttribute('height') })),
    };
  });
  // Wheel zoom in on the surface
  const viewport = page.locator('[data-testid="di-canvas-viewport"]');
  const box = await viewport.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -240);
    await page.waitForTimeout(2000);
  }
  const after = await page.evaluate(() => {
    const layer = document.querySelector('[data-testid="pdf-native-page-layer"]');
    const crops = Array.from(document.querySelectorAll('[data-testid="pdf-native-crop"]'));
    return {
      layerAttrs: layer ? Array.from(layer.attributes).map((a) => `${a.name}=${a.value}`) : null,
      cropCount: crops.length,
      crops: crops.map((c) => ({ attrs: Array.from(c.attributes).map((a) => `${a.name}=${a.value}`).filter((a) => a.startsWith('data-')), w: c.getAttribute('width'), h: c.getAttribute('height') })),
    };
  });
  console.log('BEFORE ' + JSON.stringify(before, null, 1));
  console.log('AFTER_ZOOM ' + JSON.stringify(after, null, 1));
});
