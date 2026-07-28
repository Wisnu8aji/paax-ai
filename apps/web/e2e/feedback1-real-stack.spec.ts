import { test, expect } from '@playwright/test';

const url = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';

test.describe('Feedback 1 real local stack', () => {
  test('viewer, canonical sheet indexes, and minimap have no browser errors', async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'Level' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Classification' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Original order' })).toBeVisible();
    for (const label of ['Level', 'Classification', 'Original order']) {
      await page.getByRole('tab', { name: label }).click();
      await expect(page.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true');
    }
    const pageLayer = page.getByTestId('pdf-page-layer');
    await expect(pageLayer).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('feedback1-desktop.png'), fullPage: true });
    expect(pageErrors).toEqual([]);
  });

  test('narrow layout remains usable', async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'Original order' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('feedback1-narrow.png'), fullPage: true });
    expect(pageErrors).toEqual([]);
  });
});
