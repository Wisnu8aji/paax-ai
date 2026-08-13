import { test } from '@playwright/test';
const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';
test('probe all requests', async ({ page }) => {
  test.setTimeout(180000);
  const reqs: string[] = [];
  page.on('request', (r) => reqs.push(`${r.method()} ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) reqs.push(`HTTP${r.status()} ${r.url()}`); });
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(15000);
  const layer = await page.evaluate(() => !!document.querySelector('[data-testid="pdf-page-layer"]'));
  console.log('LAYER_MOUNTED=' + layer);
  console.log('REQS ' + JSON.stringify(reqs.filter((r) => !r.includes('.png') && !r.includes('.jpg') && !r.includes('.svg') && !r.includes('.css') && !r.includes('.js') && !r.includes('.woff')), null, 1));
});
