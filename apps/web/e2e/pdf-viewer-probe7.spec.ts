import { test } from '@playwright/test';
import * as fs from 'node:fs';
const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';
test('probe long wait for layer mount', async ({ page }) => {
  test.setTimeout(300000);
  const t0 = Date.now();
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  // Poll every 2s up to 180s for layer + coverage-ready
  let layerT = -1, coverageT = -1, detailT = -1;
  for (let i = 0; i < 90; i += 1) {
    const s = await page.evaluate(() => {
      const layer = document.querySelector('[data-testid="pdf-page-layer"]');
      if (!layer) return { layer: false, coverage: false, detail: false };
      return {
        layer: true,
        coverage: layer.getAttribute('data-coverage-ready') === 'true',
        detail: layer.getAttribute('data-detail-engaged') === 'true',
        renderer: layer.getAttribute('data-renderer-kind'),
        committed: layer.getAttribute('data-committed-tile-count'),
        effDensity: layer.getAttribute('data-effective-density'),
        coverageRatio: layer.getAttribute('data-coverage-ratio'),
      };
    });
    if (s.layer && layerT === -1) layerT = Date.now() - t0;
    if (s.coverage && coverageT === -1) coverageT = Date.now() - t0;
    if (s.detail && detailT === -1) detailT = Date.now() - t0;
    if (s.coverage && s.detail) break;
    await page.waitForTimeout(2000);
  }
  const result = { layerT, coverageT, detailT, totalMs: Date.now() - t0 };
  const final = await page.evaluate(() => {
    const layer = document.querySelector('[data-testid="pdf-page-layer"]');
    return layer ? Array.from(layer.attributes).map((a) => `${a.name}=${a.value}`) : null;
  });
  fs.writeFileSync('G:/tmp/probe7-result.json', JSON.stringify({ result, final }, null, 2));
});
