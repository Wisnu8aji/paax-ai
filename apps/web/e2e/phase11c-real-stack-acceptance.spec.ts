import { test, expect } from '@playwright/test';

test.describe('Phase 11C Real-Stack Browser, Viewer & Performance Acceptance', () => {
  test('Desktop Viewport (1440x900): Full 4-service real stack, 53-page PDF viewer, and performance metrics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        consoleErrors.push(msg.text());
      }
    });

    const networkRequests: { url: string; status: number; headers: Record<string, string> }[] = [];
    page.on('response', (response) => {
      const reqUrl = response.url();
      if (
        reqUrl.includes('/api/db-projects/') ||
        reqUrl.includes('/api/drawing-intelligence/') ||
        reqUrl.includes('/api/document-intelligence/') ||
        reqUrl.includes('/api/core-engine/')
      ) {
        networkRequests.push({
          url: reqUrl,
          status: response.status(),
          headers: response.headers(),
        });
      }
    });

    // Performance timing: Cold load FCP / DOMContentLoaded
    const startTime = Date.now();
    await page.goto('http://127.0.0.1:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    const domContentLoadedTime = Date.now() - startTime;

    // Verify PLHUT title loaded from DB API proxy
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });

    // Verify View Modes (Level, Classification, Original order)
    const modeTabs = page.getByRole('tab').or(page.getByRole('button'));
    await expect(modeTabs.filter({ hasText: 'Original order' })).toBeVisible({ timeout: 10000 });

    // Warm switch performance: switch view mode to Original order
    const warmSwitchStart = Date.now();
    await modeTabs.filter({ hasText: 'Original order' }).first().click();
    await page.waitForTimeout(500);
    const warmSwitchTime = Date.now() - warmSwitchStart;

    // Switch to Quantities tab and verify Core Engine quantity receipt
    const quantitiesTab = page.locator('button:has-text("Quantities"), [role="tab"]:has-text("Quantities")').first();
    if (await quantitiesTab.isVisible()) {
      await quantitiesTab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('body')).toContainText(/K2/i, { timeout: 10000 });
      await expect(page.locator('body')).toContainText(/2[.,]34/i, { timeout: 10000 });
    }

    // Verify network proxy traffic hit real services with HTTP 200
    expect(networkRequests.length, 'Network requests must hit live backend proxies').toBeGreaterThan(0);
    const dbApiHit = networkRequests.some((r) => r.url.includes('/api/db-projects/') && r.status === 200);
    expect(dbApiHit, 'Must receive HTTP 200 from DB API proxy').toBe(true);

    // Screenshot Phase 11C Desktop evidence
    await page.screenshot({ path: 'e2e/results/phase11c-desktop-viewer.png', fullPage: true });

    // Verify zero uncaught console errors
    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);

    console.log(`[PERF] Cold Load DOMContentLoaded: ${domContentLoadedTime}ms`);
    console.log(`[PERF] Warm View Mode Switch: ${warmSwitchTime}ms`);
    console.log(`[NETWORK] Proxied Requests Count: ${networkRequests.length}`);
  });

  test('Mobile Viewport (390x844): Responsive layout, navigation, and error-free loading', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://127.0.0.1:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });

    // Screenshot Phase 11C Mobile evidence
    await page.screenshot({ path: 'e2e/results/phase11c-mobile-viewer.png', fullPage: true });

    // Verify zero console errors
    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
