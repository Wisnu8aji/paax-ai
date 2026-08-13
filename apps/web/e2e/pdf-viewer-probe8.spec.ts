import { test } from '@playwright/test';
import * as fs from 'node:fs';
const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';
test('probe layer mount with thumbnail requests blocked', async ({ page }) => {
  test.setTimeout(240000);
  // Block thumbnail + page image requests so the PDF artifact fetch isn't queued
  // behind ~36 serialized DI renders. Test-side isolation only; no runtime change.
  await page.route('**/pages/*/thumbnail?*', (route) => route.abort());
  await page.route('**/pages/*/image', (route) => route.abort());
  const t0 = Date.now();
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  let layerT = -1, coverageT = -1;
  for (let i = 0; i < 90; i += 1) {
    const s = await page.evaluate(() => {
      const layer = document.querySelector('[data-testid="pdf-page-layer"]');
      if (!layer) return { layer: false, coverage: false };
      return { layer: true, coverage: layer.getAttribute('data-coverage-ready') === 'true' };
    });
    if (s.layer && layerT === -1) layerT = Date.now() - t0;
    if (s.coverage && coverageT === -1) coverageT = Date.now() - t0;
    if (s.coverage) break;
    await page.waitForTimeout(2000);
  }
  const final = await page.evaluate(() => {
    const layer = document.querySelector('[data-testid="pdf-page-layer"]');
    return layer ? Array.from(layer.attributes).map((a) => `${a.name}=${a.value}`) : null;
  });
  fs.writeFileSync('G:/tmp/probe8-result.json', JSON.stringify({ layerT, coverageT, totalMs: Date.now() - t0, final }, null, 2));
});
