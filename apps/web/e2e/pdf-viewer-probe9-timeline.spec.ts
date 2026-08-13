/**
 * Timeline probe: measure legacy PDF layer mount latency against
 * the live runtime with granular request timing. Throwaway probe (not part of
 * the committed gate spec) used to characterize the baseline environment.
 */
import { test } from '@playwright/test';

const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';

test('timeline: sheet click -> pdf-page-layer mount (legacy)', async ({ page }) => {
  test.setTimeout(300000);
  const events: Array<{ t: number; kind: string; detail: string }> = [];
  const mark = (kind: string, detail = '') => events.push({ t: Date.now(), kind, detail });
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('thumbnail') || u.includes('artifact') || u.includes('/index') || u.includes('.pdf')) {
      mark('req', `${r.method()} ${u.replace(/^.*\/drawings/, '/drawings')}`);
    }
  });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('thumbnail') || u.includes('artifact') || u.includes('/index') || u.includes('.pdf')) {
      mark('resp', `${r.status()} ${u.replace(/^.*\/drawings/, '/drawings')}`);
    }
  });
  mark('start');
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  mark('goto-dom');
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
  mark('sheet-visible');
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  mark('surface-mounted');
  // Poll for pdf-page-layer mount, recording when it appears.
  const started = Date.now();
  let mountedAt: number | null = null;
  for (let i = 0; i < 200; i++) {
    const has = await page.evaluate(() => !!document.querySelector('[data-testid="pdf-page-layer"]'));
    if (has) { mountedAt = Date.now(); break; }
    await page.waitForTimeout(500);
  }
  mark('layer-mounted', mountedAt === null ? 'TIMEOUT' : `${mountedAt - started}ms-after-poll-start`);
  await page.waitForTimeout(4000);
  const state = await page.evaluate(() => {
    const layer = document.querySelector('[data-testid="pdf-page-layer"]');
    const underlay = document.querySelector('[data-testid="di-canvas-underlay"]');
    const status = document.querySelector('[role="status"]');
    return {
      layerAttrs: layer ? Array.from(layer.attributes).map((a) => `${a.name}=${a.value}`) : null,
      underlayVisible: underlay ? getComputedStyle(underlay).visibility : null,
      status: status?.textContent ?? null,
    };
  });
  const t0 = events[0]?.t ?? Date.now();
  const timeline = events.map((e) => ({ ...e, dt: e.t - t0 }));
  console.log('TIMELINE ' + JSON.stringify(timeline, null, 1));
  console.log('STATE ' + JSON.stringify(state, null, 1));
});
