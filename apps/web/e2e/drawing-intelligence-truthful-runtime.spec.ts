import { test, expect } from '@playwright/test';

test.describe('Phase 09D Drawing Intelligence Real Browser Smoke Test', () => {
  test('desktop viewport loads truthful workspace state without PLHUT sample fallback', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/drawing-intelligence', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Verify no hardcoded PLHUT fallback text or sample title exists in the DOM
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('PLHUT-SURAKARTA');
    expect(bodyText).not.toContain('PLHUT Campus – Building A');

    // Screenshot desktop artifact
    await page.screenshot({ path: 'e2e/results/truthful-runtime-desktop.png', fullPage: true });
    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('mobile viewport loads truthful workspace state without console errors', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/drawing-intelligence', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('PLHUT-SURAKARTA');

    // Screenshot mobile artifact
    await page.screenshot({ path: 'e2e/results/truthful-runtime-mobile.png', fullPage: true });
    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
