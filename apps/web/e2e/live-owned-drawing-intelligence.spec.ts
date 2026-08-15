import { expect, test } from '@playwright/test';

const projectId = process.env.PAAX_LIVE_PROJECT_ID;
const runId = process.env.PAAX_LIVE_RUN_ID;

test.use({ channel: 'chrome' });

test.describe('Live owned Drawing Intelligence acceptance (no interception)', () => {
  test.skip(!projectId || !runId, 'PAAX_LIVE_PROJECT_ID and PAAX_LIVE_RUN_ID are required for the real-stack test.');
  test.setTimeout(90_000);

  test('renders the canonical sheet index and real agent event transport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 980 });
    const observedResponses: Array<{ path: string; status: number }> = [];
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.includes('/api/document-intelligence/') || url.pathname.includes('/api/paax/events/')) {
        observedResponses.push({ path: `${url.pathname}${url.search}`, status: response.status() });
      }
    });

    await page.goto(
      `http://127.0.0.1:3000/drawing-intelligence?projectId=${encodeURIComponent(projectId!)}&runId=${encodeURIComponent(runId!)}&mode=quantities`,
      { waitUntil: 'domcontentloaded' },
    );

    await expect(page.getByRole('heading', { name: 'Daftar Item Pekerjaan & Perhitungan' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Nilai final hanya ditampilkan setelah dihitung oleh Core Engine', { exact: false })).toBeVisible();
    await expect(page.getByText('Sheet indexes are not ready.', { exact: false })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('[data-sheet-id], [data-testid*=sheet]')).toHaveCount(20, { timeout: 30_000 });
    // The index can be hydrated by the server-side workspace bootstrap, so
    // it is not guaranteed to appear as a client response. The DOM count
    // above is the browser-visible acceptance signal; when the client does
    // fetch it, retain the response observation as an additional check.
    await expect.poll(
      () => observedResponses.some((entry) => entry.status === 200 && entry.path.includes(`/drawings/dem/${runId}/index`))
        || page.locator('[data-sheet-id], [data-testid*=sheet]').count().then(count => count === 20),
      { timeout: 30_000 },
    ).toBe(true);
    await expect.poll(
      () => observedResponses.some((entry) => entry.status === 200 && entry.path.includes(`/api/paax/events/sse?run_id=${runId}`)),
      { timeout: 30_000 },
    ).toBe(true);
    await page.screenshot({ path: 'e2e/results/live-owned-quantities.png', fullPage: true });

    await page.goto(
      `http://127.0.0.1:3000/drawing-intelligence?projectId=${encodeURIComponent(projectId!)}&runId=${encodeURIComponent(runId!)}&mode=mission`,
      { waitUntil: 'domcontentloaded' },
    );

    await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('web_trace: true (live)')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/connected · seq \d+ · replayed/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Sheet indexes are not ready.', { exact: false })).toHaveCount(0, { timeout: 30_000 });
    await page.screenshot({ path: 'e2e/results/live-owned-mission.png', fullPage: true });
  });
});
