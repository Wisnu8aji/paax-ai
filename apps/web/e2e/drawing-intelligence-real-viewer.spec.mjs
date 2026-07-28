/** Playwright contract for the real Feedback 1 stack.
 * Run only in an environment with @playwright/test and the authorized 53-page fixture.
 */
import { test, expect } from '@playwright/test';

test('real viewer has no page errors and exposes canonical navigation', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(process.env.DI_E2E_URL || 'http://127.0.0.1:3000/gambar-kerja-ai');
  await expect(page.getByRole('tab', { name: 'Level' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Classification' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Original order' })).toBeVisible();
  await expect(page.getByRole('button', { name: /toggle minimap/i })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
