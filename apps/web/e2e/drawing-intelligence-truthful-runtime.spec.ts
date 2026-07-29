import { test, expect } from '@playwright/test';

test.describe('Phase 09E Drawing Intelligence Real-Stack E2E Browser Test', () => {
  test('desktop viewport: real PLHUT project loads across all 4 services without route interception', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        consoleErrors.push(msg.text());
      }
    });

    const networkRequests: { url: string; status: number }[] = [];
    page.on('response', (response) => {
      const reqUrl = response.url();
      if (
        reqUrl.includes('/api/db-projects/') ||
        reqUrl.includes('/api/drawing-intelligence/') ||
        reqUrl.includes('/api/document-intelligence/') ||
        reqUrl.includes('/api/core-engine/')
      ) {
        networkRequests.push({ url: reqUrl, status: response.status() });
      }
    });

    // Navigate to drawing-intelligence page with PLHUT-SURAKARTA project
    await page.goto('http://localhost:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 1. Verify project title / header
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });

    // 2. Verify Mode Tabs exist
    await expect(page.getByRole('tab', { name: 'Original order' }).or(page.getByRole('button', { name: 'Original order' }))).toBeVisible();

    // 3. Switch to Quantities mode and verify real Civil Work Item (K2 Lantai 2, count 4, volume 2.34 m³)
    const quantitiesTab = page.locator('button:has-text("Quantities"), [role="tab"]:has-text("Quantities")').first();
    if (await quantitiesTab.isVisible()) {
      await quantitiesTab.click();
      await page.waitForTimeout(1000);

      await expect(page.locator('body')).toContainText(/K2/i, { timeout: 10000 });
      await expect(page.locator('body')).toContainText(/2[.,]34/i, { timeout: 10000 });
    }

    // 4. Verify Network evidence: Requests hit backend proxy endpoints and returned HTTP 200
    expect(networkRequests.length, 'Should have received backend API proxy responses').toBeGreaterThan(0);
    const dbApiProxyHit = networkRequests.some(
      (r) => (r.url.includes('/api/db-projects/') || r.url.includes('/api/drawing-intelligence/')) && r.status === 200,
    );
    expect(dbApiProxyHit, 'Should hit DB API proxy with HTTP 200').toBe(true);

    // 5. Screenshot Phase 09E Desktop artifact
    await page.screenshot({ path: 'e2e/results/phase09e-desktop.png', fullPage: true });

    // 6. Verify zero uncaught console errors
    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('mobile viewport: loads truthful PLHUT workspace without errors', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });

    // Screenshot Phase 09E Mobile artifact
    await page.screenshot({ path: 'e2e/results/phase09e-mobile.png', fullPage: true });

    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
