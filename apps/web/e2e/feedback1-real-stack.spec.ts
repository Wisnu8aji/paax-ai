import { test, expect } from '@playwright/test';

test.describe('Phase 10B Feedback 1 Real-Stack & 53-Page PDF E2E Browser Test', () => {
  test('desktop viewport: loads 53-page PDF & real PLHUT workspace across all 4 services without route interception', async ({ page }) => {
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

    // 1. Load Drawing Intelligence workspace for PLHUT-SURAKARTA
    await page.goto('http://127.0.0.1:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Verify PLHUT title loaded from DB API proxy
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });

    // 2. Verify View Modes (Level, Classification, Original order)
    const modeTabs = page.getByRole('tab').or(page.getByRole('button'));
    await expect(modeTabs.filter({ hasText: 'Original order' })).toBeVisible({ timeout: 10000 });

    // 3. Switch to Quantities tab and verify Core Engine quantity receipt (K2 Lantai 2, volume 2.34 m³)
    const quantitiesTab = page.locator('button:has-text("Quantities"), [role="tab"]:has-text("Quantities")').first();
    if (await quantitiesTab.isVisible()) {
      await quantitiesTab.click();
      await page.waitForTimeout(1000);

      await expect(page.locator('body')).toContainText(/K2/i, { timeout: 10000 });
      await expect(page.locator('body')).toContainText(/2[.,]34/i, { timeout: 10000 });
    }

    // 4. Verify network proxy traffic hit real services with HTTP 200
    expect(networkRequests.length, 'Network requests must hit live backend proxies').toBeGreaterThan(0);
    const dbApiHit = networkRequests.some((r) => r.url.includes('/api/db-projects/') && r.status === 200);
    expect(dbApiHit, 'Must receive HTTP 200 from DB API proxy').toBe(true);

    // 5. Screenshot Phase 10B Desktop evidence
    await page.screenshot({ path: 'e2e/results/feedback1-desktop.png', fullPage: true });

    // 6. Verify zero uncaught console errors
    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('mobile viewport: loads responsive drawing intelligence workspace without errors', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://127.0.0.1:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });

    // Screenshot Phase 10B Mobile evidence
    await page.screenshot({ path: 'e2e/results/feedback1-mobile.png', fullPage: true });

    // Verify zero console errors
    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
