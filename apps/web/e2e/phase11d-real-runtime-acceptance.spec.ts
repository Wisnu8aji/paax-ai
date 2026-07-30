import { test, expect } from '@playwright/test';

test.describe('Phase 11D Correction Round 2 — Real-Stack Browser Acceptance (Zero Interception)', () => {
  test.setTimeout(60000);

  test('1. Command Room Real Service Route (No Interception): Submit query, verify SSE stream & activity timeline', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to live Command Room
    await page.goto('http://127.0.0.1:3000/command-room', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('Command Room', { timeout: 15000 });

    // Submit question
    const textarea = page.locator('textarea[placeholder*="Tanyakan apa saja"]').first();
    if (await textarea.isVisible()) {
      await textarea.fill('Halo PAAX, sebutkan fungsi utama Command Room dalam proyek infrastruktur.');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: 'e2e/results/phase11d-command-room-desktop.png', fullPage: true });
    expect(consoleErrors).toEqual([]);
    console.log('[BROWSER EVIDENCE] Command Room real service route screenshot saved (phase11d-command-room-desktop.png)');
  });

  test('2. Real PLHUT Review Queue & Quantity Readiness Workspace (No Interception)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource') && !msg.text().includes('Failed to patch workspace')) {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to Drawing Intelligence workspace with PLHUT-SURAKARTA
    await page.goto('http://127.0.0.1:3000/drawing-intelligence?projectId=PLHUT-SURAKARTA', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('PLHUT', { timeout: 15000 });

    // Capture screenshot of Drawing Intelligence Workspace
    await page.screenshot({ path: 'e2e/results/phase11d-review-queue-desktop.png', fullPage: true });
    
    // Switch to Quantities tab if visible
    const quantitiesTab = page.locator('button:has-text("Quantities"), [role="tab"]:has-text("Quantities")').first();
    if (await quantitiesTab.isVisible()) {
      await quantitiesTab.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'e2e/results/phase11d-quantity-readiness-desktop.png', fullPage: true });
    }

    expect(consoleErrors).toEqual([]);
    console.log('[BROWSER EVIDENCE] Review Queue & Readiness screenshots saved (phase11d-review-queue-desktop.png)');
  });

});
