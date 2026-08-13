import { test } from '@playwright/test';
import * as fs from 'node:fs';
const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';
test('probe bodies to file', async ({ page }) => {
  test.setTimeout(180000);
  const bodies: string[] = [];
  page.on('response', async (r) => {
    const url = r.url();
    if (url.includes('artifact-url') || url.includes('/index') || url.includes('pdf') || url.includes('binary')) {
      try {
        const ct = r.headers()['content-type'] || '';
        let body = '';
        if (ct.includes('json')) { const j = await r.json().catch(() => null); body = JSON.stringify(j).slice(0, 800); }
        else { const b = await r.body().catch(() => new Uint8Array(0)); body = `[${ct}] ${b.byteLength}B magic=${Array.from(new Uint8Array(b.slice(0,8))).join(',')}`; }
        bodies.push(`${r.status()} ${r.request().method()} ${url} :: ${body}`);
      } catch (e: any) { bodies.push(`${r.status()} ${url} :: ERR ${e.message}`); }
    }
  });
  page.on('request', (r) => {
    if (r.url().includes('artifact-url') || r.url().toLowerCase().includes('.pdf') || r.url().includes('binary')) {
      bodies.push(`REQ ${r.method()} ${r.url()}`);
    }
  });
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(25000);
  fs.writeFileSync('/tmp/probe5-bodies.json', JSON.stringify(bodies, null, 2));
  const layer = await page.evaluate(() => !!document.querySelector('[data-testid="pdf-page-layer"]'));
  fs.writeFileSync('/tmp/probe5-layer.txt', 'LAYER_MOUNTED=' + layer);
});
