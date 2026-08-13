import { test } from '@playwright/test';
const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';
test('probe artifact-url + index bodies', async ({ page }) => {
  test.setTimeout(180000);
  const bodies: string[] = [];
  page.on('response', async (r) => {
    const url = r.url();
    if (url.includes('artifact-url') || url.includes('/index') || url.includes('/dem/runs')) {
      try {
        const ct = r.headers()['content-type'] || '';
        let body = '';
        if (ct.includes('json')) body = (await r.json().catch(() => '')).toString().slice(0, 600);
        else body = `[${ct}] ${(await r.body().catch(() => new Uint8Array(0))).byteLength}B`;
        bodies.push(`${r.status()} ${r.request().method()} ${url} :: ${body}`);
      } catch { bodies.push(`${r.status()} ${url} :: ERRREAD`); }
    }
  });
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(20000);
  const layer = await page.evaluate(() => !!document.querySelector('[data-testid="pdf-page-layer"]'));
  console.log('LAYER_MOUNTED=' + layer);
  console.log('BODIES ' + JSON.stringify(bodies, null, 1));
});
