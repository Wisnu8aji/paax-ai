/**
 * Native first-useful-paint timing probe, DI-isolated.
 *
 * Same measurement as probe13, but thumbnail + page-image requests are
 * blocked TEST-SIDE (route.abort, no runtime change) so the PDF binary fetch
 * is not queued behind ~36 serialized DI thumbnail renders. This isolates the
 * viewer engine's own performance from the pre-existing DI service defect.
 */
import { test } from '@playwright/test';

const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';

test('native warm (DI-isolated): first useful paint timing', async ({ page }) => {
  test.setTimeout(300000);
  await page.route('**/pages/*/thumbnail?*', (route) => route.abort());
  await page.route('**/pages/*/image', (route) => route.abort());
  const t0 = Date.now();
  const log: string[] = [];
  const mark = (k: string, d = '') => `${Date.now() - t0}ms ${k} ${d}`;
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
  let mountedAt = -1;
  for (let i = 0; i < 240; i++) {
    const has = await page.evaluate(() => !!document.querySelector('[data-testid="pdf-native-page-layer"]'));
    if (has) { mountedAt = Date.now() - t0; log.push(mark('native-layer-mounted')); break; }
    if (i % 20 === 0) log.push(mark('poll-mount'));
    await page.waitForTimeout(500);
  }
  if (mountedAt < 0) log.push(mark('native-layer-mounted', 'TIMEOUT'));
  let baseAt = -1;
  let cropAt = -1;
  for (let i = 0; i < 240; i++) {
    const s = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pdf-native-page-layer"]');
      return el
        ? {
            baseReady: el.getAttribute('data-native-base-ready'),
            cropReady: el.getAttribute('data-native-crop-ready'),
            workerRequests: el.getAttribute('data-native-worker-requests'),
            baseFirstMs: el.getAttribute('data-native-base-first-ms'),
            pending: el.getAttribute('data-native-foreground-pending'),
            cacheBytes: el.getAttribute('data-native-cache-bytes'),
          }
        : null;
    });
    if (baseAt < 0 && s?.baseReady === 'true') { baseAt = Date.now() - t0; log.push(mark('base-ready', `req=${s.workerRequests} baseFirstMs=${s.baseFirstMs}`)); }
    if (cropAt < 0 && s?.cropReady === 'true') { cropAt = Date.now() - t0; log.push(mark('crop-ready', `req=${s.workerRequests} cacheBytes=${s.cacheBytes}`)); }
    if (baseAt >= 0 && (cropAt >= 0 || i > 90)) break;
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
