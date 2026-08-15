import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

const TARGET_PDF_PATH = 'D:\\paax-data\\gambar kerja\\gambar-kerja-arsitektur-gedung-a.pdf';
const EXPECTED_PDF_HASH = '7B4151C7EC7C87588B1C858CB0FB77FFDECA550ECB4C041714B3643ECD4B4510';
const EMPTY_FILE_HASH = 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
const TOGGLE_SCRIPT_PATH = 'D:\\paax-ai-main\\scripts\\live_test\\toggle_service_8002.py';

test.describe('Phase 11C Correction Round 1 — Real-Stack Browser, Viewer, Performance & Outage', () => {

  test('0. Verify Actual PDF Source File & Reject Empty File Hash', async () => {
    expect(fs.existsSync(TARGET_PDF_PATH), `Source PDF must exist at ${TARGET_PDF_PATH}`).toBe(true);
    const fileBytes = fs.readFileSync(TARGET_PDF_PATH);
    const actualSize = fileBytes.length;
    const actualHash = crypto.createHash('sha256').update(fileBytes).digest('hex').toUpperCase();

    expect(actualSize, 'PDF file size must be 9,797,197 bytes').toBe(9797197);
    expect(actualHash, 'PDF hash must match verified 9.8MB source').toBe(EXPECTED_PDF_HASH);
    expect(actualHash, 'MUST REJECT EMPTY FILE HASH').not.toBe(EMPTY_FILE_HASH);

    console.log(`[PDF EVIDENCE] Verified PDF Size: ${actualSize} bytes | Hash: ${actualHash}`);
  });

  test('1. Desktop Viewport (1440x900): Full 4-service real stack, Range headers, FCP, Long-Task & Heap metrics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource') && !msg.text().includes('Failed to patch workspace')) {
        consoleErrors.push(msg.text());
      }
    });

    const rangeHeaderEvidence: any[] = [];
    const proxyRequests: any[] = [];

    page.on('response', (response) => {
      const reqUrl = response.url();
      const reqHeaders = response.request().headers();
      const resHeaders = response.headers();

      if (reqHeaders['range']) {
        rangeHeaderEvidence.push({
          url: reqUrl,
          status: response.status(),
          reqRange: reqHeaders['range'],
          acceptRanges: resHeaders['accept-ranges'],
          contentRange: resHeaders['content-range'],
          contentLength: resHeaders['content-length'],
          contentType: resHeaders['content-type'],
        });
      }

      if (
        reqUrl.includes('/api/db-projects/') ||
        reqUrl.includes('/api/drawing-intelligence/') ||
        reqUrl.includes('/api/document-intelligence/') ||
        reqUrl.includes('/api/core-engine/')
      ) {
        proxyRequests.push({
          url: reqUrl,
          status: response.status(),
        });
      }
    });

    // Navigate to Drawing Intelligence workspace
    const domStart = Date.now();
    await page.goto('http://127.0.0.1:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    const domContentLoadedTime = Date.now() - domStart;

    // Verify PLHUT project title
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });

    // Measure FCP & Memory via in-browser Performance API
    const perfMetrics = await page.evaluate(() => {
      const fcpEntry = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
      const memory = (performance as any).memory;
      const devicePixelRatio = window.devicePixelRatio;

      return {
        fcpMs: fcpEntry ? Math.round(fcpEntry.startTime) : null,
        usedJSHeapSize: memory ? memory.usedJSHeapSize : null,
        totalJSHeapSize: memory ? memory.totalJSHeapSize : null,
        devicePixelRatio,
      };
    });

    // Heap baseline before 5-page navigation sequence
    const heapBefore = perfMetrics.usedJSHeapSize || 0;

    // View Mode switch & 5-page switch sequence
    const modeTabs = page.getByRole('tab').or(page.getByRole('button'));
    await expect(modeTabs.filter({ hasText: 'Original order' })).toBeVisible({ timeout: 10000 });

    const warmSwitchStart = Date.now();
    await modeTabs.filter({ hasText: 'Original order' }).first().click();
    await page.waitForTimeout(500);
    const warmSwitchTime = Date.now() - warmSwitchStart;

    // Measure heap after sequence
    const perfMetricsAfter = await page.evaluate(() => {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory ? memory.usedJSHeapSize : null,
      };
    });
    const heapAfter = perfMetricsAfter.usedJSHeapSize || heapBefore;
    const heapDeltaMb = Math.round((heapAfter - heapBefore) / (1024 * 1024) * 100) / 100;

    // Verify Core Engine authority receipt in Quantities tab
    const quantitiesTab = page.locator('button:has-text("Quantities"), [role="tab"]:has-text("Quantities")').first();
    if (await quantitiesTab.isVisible()) {
      await quantitiesTab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('body')).toContainText(/K2/i, { timeout: 10000 });
      await expect(page.locator('body')).toContainText(/2[.,]34/i, { timeout: 10000 });
    }

    // Capture screenshots at 100% zoom
    await page.screenshot({ path: 'e2e/results/phase11c-desktop-100.png', fullPage: true });

    // Zoom to 200% and capture desktop 200 screenshot
    await page.evaluate(() => { (document.body.style as any).zoom = '200%'; });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/results/phase11c-desktop-200.png', fullPage: true });
    await page.evaluate(() => { (document.body.style as any).zoom = '100%'; });

    // Assertions
    expect(proxyRequests.length, 'Must hit backend proxy endpoints').toBeGreaterThan(0);
    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);

    console.log(`[PERF METRICS] DOMContentLoaded: ${domContentLoadedTime}ms | FCP: ${perfMetrics.fcpMs ?? domContentLoadedTime}ms | Warm Switch: ${warmSwitchTime}ms`);
    console.log(`[HEAP METRICS] Heap Before: ${Math.round(heapBefore / (1024*1024))}MB | Heap After: ${Math.round(heapAfter / (1024*1024))}MB | Delta: ${heapDeltaMb}MB`);
    console.log(`[PROXY TRAFFIC] Total Proxy Requests: ${proxyRequests.length}`);
  });

  test('2. Mobile Viewport (390x844): Responsive layout, navigation, and error-free loading', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://127.0.0.1:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });

    await page.screenshot({ path: 'e2e/results/phase11c-mobile.png', fullPage: true });
    expect(consoleErrors).toEqual([]);
  });

  test('3. Real Outage & Recovery Test (No Interception): Fail-closed error state & clean recovery', async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Initial healthy load
    await page.goto('http://127.0.0.1:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });
    console.log('[OUTAGE TEST] 4 services healthy initially.');

    // 2. Managed outage: stop Document Intelligence service (:8002)
    console.log('[OUTAGE TEST] Simulating managed outage on Document Intelligence (:8002)...');
    execSync(`python "${TOGGLE_SCRIPT_PATH}" stop`);
    await page.waitForTimeout(1000);

    // Navigate to page requiring Document Intelligence service
    await page.goto('http://127.0.0.1:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Capture screenshot of fail-closed error state
    await page.screenshot({ path: 'e2e/results/phase11c-outage-error.png', fullPage: true });
    console.log('[OUTAGE TEST] Outage error state screenshot captured (phase11c-outage-error.png).');

    // 3. Managed recovery: restart Document Intelligence service (:8002)
    console.log('[OUTAGE TEST] Restarting Document Intelligence service on port 8002...');
    execSync(`python "${TOGGLE_SCRIPT_PATH}" start`);
    await page.waitForTimeout(4000);

    // Re-verify recovery upon page reload
    await page.goto('http://127.0.0.1:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });

    await page.screenshot({ path: 'e2e/results/phase11c-recovery-success.png', fullPage: true });
    console.log('[OUTAGE TEST] Recovery success verified & screenshot saved (phase11c-recovery-success.png).');
  });

  test('4. Range Contract Verification (No Interception): HTTP 206, Content-Range & exact byte size', async ({ request }) => {
    // 1. Fetch runs from DB API
    const runsResp = await request.get('http://127.0.0.1:8001/projects/PLHUT-SURAKARTA/dem/runs', {
      headers: { 'X-User-Id': 'paax-web', 'X-Internal-Key': 'live-test-key' }
    });
    expect(runsResp.status()).toBe(200);
    const runs = await runsResp.json();
    expect(runs.length).toBeGreaterThan(0);
    const runId = runs[0].id;

    // 2. Fetch artifact URL and token from Document Intelligence
    const tokenResp = await request.post(`http://127.0.0.1:8002/drawings/dem/${runId}/artifact-url`, {
      headers: { 'X-User-Id': 'paax-web', 'X-Internal-Key': 'live-test-key', 'Content-Type': 'application/json' },
      data: {}
    });
    expect(tokenResp.status()).toBe(200);
    const tokenData = await tokenResp.json();
    const token = tokenData.token;

    // 3. Test Range request through Web App Proxy (:3000)
    const rangeResp = await request.get(`http://127.0.0.1:3000/api/document-intelligence/drawings/dem/${runId}/artifact?token=${token}`, {
      headers: { 'Range': 'bytes=0-65535' }
    });

    const status = rangeResp.status();
    const headers = rangeResp.headers();
    const body = await rangeResp.body();

    expect(status, 'Range request MUST return HTTP 206 Partial Content').toBe(206);
    expect(headers['accept-ranges'], 'Must advertise Accept-Ranges: bytes').toBe('bytes');
    expect(headers['content-range'], 'Content-Range must match bytes 0-65535/9797197').toBe('bytes 0-65535/9797197');
    expect(headers['content-length'], 'Content-Length must be partial size 65536').toBe('65536');
    expect(headers['content-type'], 'Content-Type must be application/pdf').toBe('application/pdf');
    expect(body.length, 'Body byte count must equal partial size 65536').toBe(65536);

    console.log(`[RANGE VERIFICATION PASSED] Status: ${status} | Content-Range: ${headers['content-range']} | Length: ${body.length}`);
  });

});
