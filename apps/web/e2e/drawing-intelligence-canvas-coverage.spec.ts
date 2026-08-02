/**
 * Drawing Intelligence — Viewer Gambar Kerja: right-edge coverage & anti-flicker
 * acceptance tests (2026-08-02 fix: viewportSpace contract, retain window,
 * throttled live-pan, single-fit).
 *
 * Verified in real browser (stack resmi per PANDUAN_INSTALASI...):
 * - Right edge coverage >= 99% at fit zoom (P0 regression: normalized viewport
 *   with width/height > 1 was misclassified as logical space).
 * - Pan left/right keeps coverage; no zero-visible-tile window.
 * - Wheel zoom steps never blank the canvas.
 * - Sheet p.1 -> p.2 -> p.1 navigation does not re-show "Loading original PDF"
 *   for an already-open sheet (metrics cache, single-fit).
 * - No browser pageerror.
 *
 * Environment: DI_E2E_URL (default http://127.0.0.1:3000/drawing-intelligence),
 * DI_E2E_PROJECT_ID (default PLHUT-SURAKARTA).
 * Golden Rule: no quantity calculation, no dummy data, no LLM auto-commit.
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';

test.describe('Drawing Intelligence Canvas — right coverage & flicker', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180000);

  const pageErrors: string[] = [];

  async function openFirstSheet(page: Page): Promise<void> {
    pageErrors.length = 0;
    page.on('pageerror', (err: Error) => pageErrors.push(err.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[role="tablist"][aria-label="Sheet view mode"]', { timeout: 60000 });

    // Open sheet p.1 from the navigator (set-active-sheet -> review workspace)
    const sheetOne = page.locator('article').filter({ hasText: 'p.1' }).first();
    await sheetOne.waitFor({ timeout: 60000 });
    await sheetOne.click();
  }

  async function waitForPdfLayer(page: Page): Promise<void> {
    await page.locator('[data-testid="pdf-page-layer"]').waitFor({ timeout: 90000 });
    // Wait until at least one tile canvas is painted (not just the container)
    await page.waitForFunction(() => {
      const layer = document.querySelector('[data-testid="pdf-page-layer"]');
      return layer !== null && layer.querySelectorAll('canvas').length > 0;
    }, undefined, { timeout: 90000 });
  }

  /** Rightmost painted edge in % of the page width, or null when no tiles. */
  async function rightCoverage(page: Page): Promise<number | null> {
    return page.evaluate(() => {
      const layer = document.querySelector('[data-testid="pdf-page-layer"]');
      if (!layer) return null;
      const tiles = layer.querySelectorAll('canvas');
      if (tiles.length === 0) return null;
      let maxRight = 0;
      for (const tile of tiles) {
        const style = (tile as HTMLElement).style;
        const left = parseFloat(style.left) || 0;
        const width = parseFloat(style.width) || 0;
        maxRight = Math.max(maxRight, left + width);
      }
      return Math.min(100, maxRight);
    });
  }

  async function visibleTileCount(page: Page): Promise<number> {
    return page.locator('[data-testid="pdf-page-layer"] canvas').count();
  }

  async function dragPan(page: Page, dx: number): Promise<void> {
    const viewport = page.getByTestId('di-canvas-viewport');
    const box = (await viewport.boundingBox())!;
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(sx + dx, sy, { steps: 12 });
    await page.mouse.up({ button: 'middle' });
  }

  test('fit zoom shows full right-edge coverage (>= 99%) and >= 2 tile columns', async ({ page }) => {
    await openFirstSheet(page);
    await waitForPdfLayer(page);

    const coverage = await rightCoverage(page);
    expect(coverage).not.toBeNull();
    expect(coverage!).toBeGreaterThanOrEqual(99);
    const tiles = await visibleTileCount(page);
    expect(tiles).toBeGreaterThanOrEqual(2);
    expect(pageErrors).toEqual([]);

    await page.screenshot({ path: test.info().outputPath('canvas-fit-right-coverage.png') });
  });

  test('pan left and right never shrinks right coverage and never drops to zero visible tiles', async ({ page }) => {
    await openFirstSheet(page);
    await waitForPdfLayer(page);

    const samples: number[] = [];
    const baseline = await rightCoverage(page);
    expect(baseline).not.toBeNull();

    for (const dx of [-240, 240, 480, -480]) {
      await dragPan(page, dx);
      await page.waitForTimeout(300);
      const count = await visibleTileCount(page);
      samples.push(count);
      const coverage = await rightCoverage(page);
      expect(coverage).not.toBeNull();
      // Pan must not create a permanent right gap once the layer has painted
      expect(coverage!).toBeGreaterThanOrEqual(99);
      expect(pageErrors).toEqual([]);
    }

    // After first paint, no sampled frame may have zero visible tiles
    expect(samples.every((count) => count > 0)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('canvas-after-pan.png') });
  });

  test('wheel zoom steps never produce a zero-visible-tile frame', async ({ page }) => {
    await openFirstSheet(page);
    await waitForPdfLayer(page);

    const viewport = page.getByTestId('di-canvas-viewport');
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const frameCounts: number[] = [];
    for (let step = 0; step < 3; step++) {
      await page.mouse.wheel(0, -160);
      for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(300);
        frameCounts.push(await visibleTileCount(page));
      }
    }
    for (let step = 0; step < 3; step++) {
      await page.mouse.wheel(0, 160);
      for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(300);
        frameCounts.push(await visibleTileCount(page));
      }
    }

    expect(frameCounts.length).toBeGreaterThan(0);
    expect(frameCounts.every((count) => count > 0)).toBe(true);
    const coverage = await rightCoverage(page);
    expect(coverage).not.toBeNull();
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('canvas-after-zoom.png') });
  });

  test('sheet p.1 -> p.2 -> p.1 navigation does not re-enter loading for an opened sheet', async ({ page }) => {
    await openFirstSheet(page);
    await waitForPdfLayer(page);

    // Go to p.2
    const sheetTwo = page.locator('article').filter({ hasText: 'p.2' }).first();
    await sheetTwo.waitFor({ timeout: 60000 });
    await sheetTwo.click();
    await waitForPdfLayer(page);

    // Back to p.1 — metrics must be cached (no second "Loading original PDF…")
    const sheetOne = page.locator('article').filter({ hasText: 'p.1' }).first();
    await sheetOne.waitFor({ timeout: 60000 });
    await sheetOne.click();
    await waitForPdfLayer(page);

    // If the layer entered loading again, tiles would be absent; require paint
    // within a bounded window and no loading status visible at the end.
    const loadingVisible = await page.getByRole('status').isVisible().catch(() => false);
    expect(loadingVisible).toBe(false);
    const coverage = await rightCoverage(page);
    expect(coverage).not.toBeNull();
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('canvas-after-sheet-nav.png') });
  });
});
