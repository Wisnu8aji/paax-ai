/**
 * F5 owned — network trace probe: native sheet open with full request/response
 * timing (PDF artifact chain), thumbnails blocked test-side. Records the exact
 * point where the PDF binary fetch stalls or fails.
 */
import { test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';

test('native: network trace for PDF fetch', async ({ page }) => {
  test.setTimeout(300000);
  await page.route('**/pages/*/thumbnail?*', (route) => route.abort());
  await page.route('**/pages/*/image', (route) => route.abort());
  const t0 = Date.now();
  const trace: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('artifact') || u.includes('index') || u.includes('.pdf') || u.includes('drawings/dem')) {
      trace.push(`${Date.now() - t0}ms REQ ${r.method()} ${u.replace(/^.*\/api/, '/api')}`);
    }
  });
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('artifact') || u.includes('index') || u.includes('.pdf') || u.includes('drawings/dem')) {
      let body = '';
      try {
        const ct = r.headers()['content-type'] || '';
        if (ct.includes('json')) body = (await r.text()).slice(0, 200);
      } catch { /* ignore */ }
      trace.push(`${Date.now() - t0}ms RESP ${r.status()} ${u.replace(/^.*\/api/, '/api')} ${body}`);
    }
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.includes('artifact') || u.includes('index') || u.includes('pdf') || u.includes('drawings/dem')) {
      trace.push(`${Date.now() - t0}ms FAIL ${u.replace(/^.*\/api/, '/api')} :: ${r.failure()?.errorText}`);
    }
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') trace.push(`${Date.now() - t0}ms CONSOLE[${m.type()}] ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => trace.push(`${Date.now() - t0}ms PAGEERROR ${e.message.slice(0, 300)}`));
  page.on('worker', (w) => trace.push(`${Date.now() - t0}ms WORKER ${w.url().split('/').pop()}`));

  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  trace.push(`${Date.now() - t0}ms goto`);
  await page.evaluate(() => localStorage.setItem('paax.pdfViewerMode', 'native'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 90000 });
  trace.push(`${Date.now() - t0}ms sheet-visible`);
  await page.locator('[data-page-number="1"]').first().click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
  trace.push(`${Date.now() - t0}ms surface-mounted`);
  await page.locator('[data-testid="pdf-native-page-layer"]').waitFor({ timeout: 60000 });
  trace.push(`${Date.now() - t0}ms native-layer-mounted`);
  // Poll worker requests + status for up to 90s
  for (let i = 0; i < 180; i++) {
    const s = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pdf-native-page-layer"]');
      const status = document.querySelector('[role="status"]');
      return {
        req: el?.getAttribute('data-native-worker-requests') ?? '?',
        baseReady: el?.getAttribute('data-native-base-ready') ?? '?',
        status: status?.textContent ?? null,
      };
    });
    if (i % 10 === 0) trace.push(`${Date.now() - t0}ms poll req=${s.req} baseReady=${s.baseReady} status=${s.status}`);
    if (s.baseReady === 'true') { trace.push(`${Date.now() - t0}ms base-ready req=${s.req}`); break; }
    await page.waitForTimeout(500);
  }
  const out = path.resolve(__dirname, 'results/pdf-viewer-native-net-trace.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(trace, null, 1), 'utf8');
  console.log('TRACE_WRITTEN ' + out);
  console.log(trace.join('\n'));
});
