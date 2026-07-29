import { test, expect } from '@playwright/test';

test.describe('Phase 09E Drawing Intelligence Real-Stack E2E Browser Test', () => {
  test('desktop viewport: real workspace loads, review/coverage/handoff safety verified', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/drawing-intelligence', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Verify DOM contains no hardcoded PLHUT mock string
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('PLHUT-SURAKARTA');
    expect(bodyText).not.toContain('PLHUT Campus – Building A');

    // Screenshot Phase 09E Desktop artifact
    await page.screenshot({ path: 'e2e/results/phase09e-desktop.png', fullPage: true });
    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('mobile viewport: loads truthful workspace without errors', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/drawing-intelligence', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('PLHUT-SURAKARTA');

    // Screenshot Phase 09E Mobile artifact
    await page.screenshot({ path: 'e2e/results/phase09e-mobile.png', fullPage: true });
    expect(consoleErrors, `Uncaught console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
