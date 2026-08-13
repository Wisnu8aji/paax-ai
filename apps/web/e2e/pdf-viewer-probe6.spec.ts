import { test } from '@playwright/test';
import * as fs from 'node:fs';
const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';
test('probe full timeline', async ({ page }) => {
  test.setTimeout(180000);
  const log: string[] = [];
  const t0 = Date.now();
  page.on('request', (r) => { if (!r.url().includes('.png') && !r.url().includes('.js') && !r.url().includes('.css')) log.push(`+${Date.now()-t0}ms REQ ${r.method()} ${r.url().replace('http://127.0.0.1:3000','')}`); });
  page.on('response', (r) => { if (!r.url().includes('.png') && !r.url().includes('.js') && !r.url().includes('.css')) log.push(`+${Date.now()-t0}ms RESP ${r.status()} ${r.url().replace('http://127.0.0.1:3000','')}`); });
  page.on('worker', (w) => { log.push(`+${Date.now()-t0}ms WORKER ${w.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`+${Date.now()-t0}ms CONSOLE[${m.type()}] ${m.text().slice(0,300)}`); });
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
  const clickT = Date.now();
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(30000);
  const state = await page.evaluate(() => {
    const layer = document.querySelector('[data-testid="pdf-page-layer"]');
    const status = document.querySelector('[role="status"]');
    const retry = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Retry PDF'));
    return { layer: !!layer, status: status?.textContent ?? null, retry: retry?.textContent ?? null };
  });
  log.push(`CLICK->+${Date.now()-clickT}ms STATE ${JSON.stringify(state)}`);
  fs.writeFileSync('G:/tmp/probe6-log.json', JSON.stringify(log, null, 1));
});
