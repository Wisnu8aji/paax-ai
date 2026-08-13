import { test } from '@playwright/test';
const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';
test('legacy warm: mount latency + worker activity', async ({ page }) => {
  test.setTimeout(420000);
  const t0 = Date.now();
  const log: string[] = [];
  const mark = (k: string, d = '') => log.push(`${Date.now() - t0}ms ${k} ${d}`);
  // Instrument Worker.prototype.postMessage to count render-tile requests
  await page.addInitScript(() => {
    const w = window as any;
    w.__pwWorkerCount = 0;
    w.__pwWorkerByType = {};
    const Orig = w.Worker;
    if (!Orig) return;
    w.Worker = new Proxy(Orig, {
      construct(target, args) {
        const worker = new target(...args);
        const origPost = worker.postMessage.bind(worker);
        worker.postMessage = (msg: any, transfer?: any) => {
          const type = msg?.type ?? 'unknown';
          w.__pwWorkerCount++;
          w.__pwWorkerByType[type] = (w.__pwWorkerByType[type] ?? 0) + 1;
          return origPost(msg, transfer);
        };
        return worker;
      },
    });
  });
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  mark('goto');
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 90000 });
  mark('sheet-visible');
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  mark('surface-mounted');
  let mountedAt = -1;
  for (let i = 0; i < 400; i++) {
    const r = await page.evaluate(() => ({
      layer: !!document.querySelector('[data-testid="pdf-page-layer"]'),
      workerCount: (window as any).__pwWorkerCount ?? 0,
      byType: (window as any).__pwWorkerByType ?? {},
    }));
    if (r.layer) { mountedAt = Date.now() - t0; mark('layer-mounted', `workers=${r.workerCount} byType=${JSON.stringify(r.byType)}`); break; }
    if (i % 20 === 0) mark('poll', `workers=${r.workerCount}`);
    await page.waitForTimeout(500);
  }
  if (mountedAt < 0) mark('layer-mounted', 'TIMEOUT');
  // Wait for canvas paint + first tile commit
  await page.waitForTimeout(6000);
  const state = await page.evaluate(() => {
    const layer = document.querySelector('[data-testid="pdf-page-layer"]');
    const canvas = document.querySelector('[data-testid="pdf-page-layer-canvas"]');
    const status = document.querySelector('[role="status"]');
    const mem = (performance as any).memory;
    return {
      layerAttrs: layer ? Array.from(layer.attributes).map((a) => `${a.name}=${a.value}`) : null,
      canvas: canvas ? { w: canvas.getAttribute('width'), h: canvas.getAttribute('height'), cssW: (canvas as HTMLElement).style.width, cssH: (canvas as HTMLElement).style.height } : null,
      status: status?.textContent ?? null,
      workerCount: (window as any).__pwWorkerCount ?? 0,
      byType: (window as any).__pwWorkerByType ?? {},
      memory: mem ? { used: mem.usedJSHeapSize, total: mem.totalJSHeapSize } : null,
    };
  });
  console.log('LOG ' + JSON.stringify(log, null, 1));
  console.log('STATE ' + JSON.stringify(state, null, 1));
});
