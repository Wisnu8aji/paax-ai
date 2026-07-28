import { test, expect } from '@playwright/test';

test('first page paint does not wait for every page', async ({ page }) => {
  await page.goto(process.env.DI_E2E_URL || 'http://127.0.0.1:3000/gambar-kerja-ai');
  const firstPaint = page.getByTestId('pdf-page-layer');
  await expect(firstPaint).toBeVisible();
  const thumbnails = page.getByRole('img');
  expect(await thumbnails.count()).toBeGreaterThan(0);
});
