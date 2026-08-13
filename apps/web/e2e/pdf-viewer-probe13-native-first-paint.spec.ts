/**
 * Native first-useful-paint timing probe.
 *
 * Opens a sheet in NATIVE mode and records:
 *  - sheet click → native layer mount
 *  - layer mount → base-ready (first useful paint)
 *  - layer mount → first crop commit
 *  - full diagnostics snapshot at base-ready
 *  - peak memory during the wait
 *
 * Throwaway probe (not part of the committed gate spec).
 */
import { test } from '@playwright/test';

const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';

test('native warm: first useful paint timing', async ({ page }) => {
  test.setTimeout(420000);
  const t0 = Date.now();
  const mark = (k: string, d = '') => `${Date.now() - t0}ms ${k} ${d}`;
  const log: string[] = [];
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  log.push(mark('goto'));
  await page.evaluate(() => localStorage.setItem('paax.pdfViewerMode', 'native'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 90000 });
  log.push(mark('sheet-visible'));
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  log.push(mark('surface-mounted'));
  // Poll for native layer mount
  let mountedAt = -1;
  for (let i = 0; i < 240; i++) {
    const has = await page.evaluate(() => !!document.querySelector('[data-testid="pdf-native-page-layer"]'));
    if (has) { mountedAt = Date.now() - t0; log.push(mark('native-layer-mounted')); break; }
    if (i % 20 === 0) log.push(mark('poll-mount'));
    await page.waitForTimeout(500);
  }
  if (mountedAt < 0) log.push(mark('native-layer-mounted', 'TIMEOUT'));
  // Poll for base-ready (first useful paint)
  let baseAt = -1;
  let cropAt = -1;
  for (let i = 0; i < 480; i++) {
    const s = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pdf-native-page-layer"]');
      return el
        ? {
            baseReady: el.getAttribute('data-native-base-ready'),
            cropReady: el.getAttribute('data-native-crop-ready'),
            workerRequests: el.getAttribute('data-native-worker-requests'),
            baseFirstMs: el.getAttribute('data-native-base-first-ms'),
            pending: el.getAttribute('data-native-foreground-pending'),
          }
        : null;
    });
    if (baseAt < 0 && s?.baseReady === 'true') { baseAt = Date.now() - t0; log.push(mark('base-ready', `req=${s.workerRequests} baseFirstMs=${s.baseFirstMs}`)); }
    if (cropAt < 0 && s?.cropReady === 'true') { cropAt = Date.now() - t0; log.push(mark('crop-ready', `req=${s.workerRequests}`)); }
    if (baseAt >= 0 && (cropAt >= 0 || i > 120)) break;
    if (i % 20 === 0 && baseAt < 0) log.push(mark('poll-base', `req=${s?.workerRequests ?? '?'} pending=${s?.pending ?? '?'}`));
    await page.waitForTimeout(500);
  }
  if (baseAt < 0) log.push(mark('base-ready', 'TIMEOUT'));
  if (cropAt < 0) log.push(mark('crop-ready', 'TIMEOUT'));
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pdf-native-page-layer"]');
    const mem = (performance as any).memory;
    const base = document.querySelector('[data-testid="pdf-native-base"]');
    const crops = Array.from(document.querySelectorAll('[data-testid="pdf-native-crop"]'));
    return {
      attrs: el ? Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value])) : null,
      base: base ? { w: base.getAttribute('width'), h: base.getAttribute('height') } : null,
      cropCount: crops.length,
      memory: mem ? { used: mem.usedJSHeapSize, total: mem.totalJSHeapSize } : null,
      status: document.querySelector('[role="status"]')?.textContent ?? null,
    };
  });
  console.log('LOG ' + JSON.stringify(log, null, 1));
  console.log('STATE ' + JSON.stringify(state, null, 1));
});
