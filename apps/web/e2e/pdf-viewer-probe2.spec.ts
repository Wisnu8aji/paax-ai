import { test } from '@playwright/test';
const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';
test('probe console + network', async ({ page }) => {
  test.setTimeout(120000);
  const consoleMsgs: string[] = [];
  const failed: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${m.text()}`); });
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(12000);
  const state = await page.evaluate(() => {
    const layer = document.querySelector('[data-testid="pdf-page-layer"]');
    const status = document.querySelector('[role="status"]');
    const retry = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Retry PDF'));
    return { layer: !!layer, status: status?.textContent ?? null, retry: retry?.textContent ?? null };
  });
  console.log('STATE ' + JSON.stringify(state));
  console.log('CONSOLE ' + JSON.stringify(consoleMsgs.slice(0, 30), null, 1));
  console.log('FAILED ' + JSON.stringify(failed.slice(0, 30), null, 1));
});
