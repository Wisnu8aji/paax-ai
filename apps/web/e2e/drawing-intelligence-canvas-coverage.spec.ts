/**
 * Drawing Viewer — deterministic per-frame continuity acceptance (Task 6).
 *
 * Proves in a real browser, per animation frame:
 *  - committed coverage of the active document never drops below 99% while the
 *    thumbnail fallback is hidden (no blank-viewport frame during pan, zoom,
 *    fit, sheet navigation, or context loss);
 *  - normal Chromium uses the WebGL2 compositor; forced Canvas2D uses canvas2d;
 *  - DPR 1 and DPR 2 both hold the invariant;
 *  - WebGL context loss reveals the fallback and either restores textures or
 *    fails over to Canvas2D deterministically.
 *
 * Deterministic preconditions (no reliance on persisted UI mode): every test
 * explicitly selects the Review workspace tab and asserts aria-selected, then
 * selects page 1 via the stable production selector `[data-page-number="1"]`.
 * One regression deliberately persists Quantities mode and reloads first.
 *
 * Environment: DI_E2E_URL (default http://127.0.0.1:3000/drawing-intelligence),
 * DI_E2E_PROJECT_ID (default PLHUT-SURAKARTA).
 *
 * The in-page sampler wraps `requestAnimationFrame` BEFORE any interaction and
 * records the layer's production diagnostics (coverage ratio, committed
 * generation, renderer, texture count, context-loss state) plus the fallback
 * underlay visibility for every painted frame. Initialization frames before a
 * viewer document exists (no page surface, documentKey null) are the only
 * excluded frames, as documented in the acceptance criterion.
 */
import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// One aggregate artifact summary is written from module-local records. Keep
// every scenario in one worker so parallel suites cannot overwrite it.
test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.DI_E2E_URL || 'http://127.0.0.1:3000/drawing-intelligence';
const PROJECT_ID = process.env.DI_E2E_PROJECT_ID || 'PLHUT-SURAKARTA';
const COMMIT_HASH = (() => {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: path.resolve(__dirname, '../../..') }).trim();
  } catch {
    return 'unknown';
  }
})();

interface ViewerFrameSample {
  timestamp: number;
  documentKey: string | null;
  renderer: 'webgl2' | 'canvas2d' | null;
  generation: number | null;
  coverageReady: boolean;
  coverageRatio: number;
  fallbackVisible: boolean;
  committedTileCount: number;
  materializedTileCount: number;
  textureCount: number;
  uploadFailures: number;
  contextLost: boolean;
}

interface ScenarioRecord {
  id: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  rendererMode: 'webgl2' | 'canvas2d';
  commit: string;
  startedAt: string;
  frameSamples: ViewerFrameSample[];
  relevantFrames: number;
  failingFrames: ViewerFrameSample[];
  maxUncoveredRatio: number;
  maxTextureCount: number;
  p95FrameIntervalMs: number;
  workerCount: number;
  contextLoss: { forced: boolean; observedLostFrames: number; finalRenderer: string | null; finalCoverageReady: boolean };
  finalReadback: { kind: string; nonTransparent: number; total: number } | null;
  pageErrors: string[];
  consoleErrors: string[];
  consoleWarnings: string[];
  screenshots: string[];
  scenarioFiles: string[];
}

const records: ScenarioRecord[] = [];

const VIEWER_RELEVANT_CONSOLE = /pdf|tile|canvas|webgl|context|worker|drawing/i;

/**
 * In-page instrumentation installed before navigation. Runs an independent
 * rAF loop so every painted frame is sampled even when the application did not
 * schedule its own callback, and
 * supports a one-time pixel readback requested by the test at stable
 * checkpoints (test-only; the app itself never reads pixels).
 */
function installSamplerScript(): void {
  const script = () => {
    const samples: any[] = [];
    (window as any).__viewerSamples = samples;
    (window as any).__paaxReadbackPending = false;
    (window as any).__paaxReadbackResult = null;
    let lastTimestamp = -1;

    const sampleFrame = (ts: number) => {
      if (ts === lastTimestamp) return;
      lastTimestamp = ts;
      const surface = document.querySelector('[data-testid="di-canvas-page-surface"]');
      const layer = document.querySelector('[data-testid="pdf-page-layer"]');
      const img = surface ? surface.querySelector('img[aria-hidden="true"]') : null;
      const fallbackVisible =
        img !== null && img.style.visibility === 'visible' && Number(img.style.opacity) !== 0;
      samples.push({
        timestamp: ts,
        documentKey: surface ? surface.getAttribute('data-document-key') || null : null,
        renderer: layer ? layer.getAttribute('data-renderer-kind') : null,
        generation: layer ? Number(layer.getAttribute('data-committed-generation')) : null,
        coverageReady: layer ? layer.getAttribute('data-coverage-ready') === 'true' : false,
        coverageRatio: layer ? Number(layer.getAttribute('data-coverage-ratio')) : 0,
        fallbackVisible,
        committedTileCount: layer ? Number(layer.getAttribute('data-committed-tile-count')) : 0,
        materializedTileCount: layer ? Number(layer.getAttribute('data-materialized-tile-count')) : 0,
        textureCount: layer ? Number(layer.getAttribute('data-texture-count')) : 0,
        uploadFailures: layer ? Number(layer.getAttribute('data-upload-failures')) : 0,
        contextLost: layer ? layer.getAttribute('data-context-lost') === 'true' : false,
      });
    };

    const readbackPixels = () => {
      const canvas = document.querySelector('[data-testid="pdf-page-layer-canvas"]') as HTMLCanvasElement | null;
      if (!canvas) return null;
      const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
      if (gl) {
        const w = Math.min(gl.drawingBufferWidth, 512);
        const h = Math.min(gl.drawingBufferHeight, 512);
        if (w <= 0 || h <= 0) return null;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let nonTransparent = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i] !== 0 || px[i + 1] !== 0 || px[i + 2] !== 0 || px[i + 3] !== 0) nonTransparent += 1;
        }
        return { kind: 'webgl2', nonTransparent, total: w * h, w, h };
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const w = Math.min(canvas.width, 512);
        const h = Math.min(canvas.height, 512);
        if (w <= 0 || h <= 0) return null;
        const data = ctx.getImageData(0, 0, w, h).data;
        let nonTransparent = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 0) nonTransparent += 1;
        }
        return { kind: 'canvas2d', nonTransparent, total: w * h, w, h };
      }
      return null;
    };

    const origRaf = window.requestAnimationFrame.bind(window);
    const tick = (ts: number) => {
      try {
        sampleFrame(ts);
        if ((window as any).__paaxReadbackPending) {
          (window as any).__paaxReadbackPending = false;
          (window as any).__paaxReadbackResult = readbackPixels();
        }
      } catch {
        // Sampling must never break the page.
      }
      origRaf(tick);
    };
    origRaf(tick);
  };
  return script;
}

function forceCanvas2DScript(): void {
  const script = () => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return original.call(this, type, ...args);
    };
  };
  return script;
}

const ARTIFACT_ROOT = path.resolve(__dirname, 'results', 'drawing-viewer-atomic-gpu');

function artifactPath(scenarioId: string, name: string): string {
  const dir = path.join(ARTIFACT_ROOT, scenarioId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

async function captureScenarioArtifacts(record: ScenarioRecord, page: Page): Promise<void> {
  const scenarioDir = path.join(ARTIFACT_ROOT, record.id);
  fs.mkdirSync(scenarioDir, { recursive: true });
  const timestamp = Date.now();
  const samplesFile = artifactPath(record.id, `frames-${timestamp}.json`);
  fs.writeFileSync(samplesFile, JSON.stringify(record.frameSamples, null, 2));
  record.scenarioFiles.push(path.relative(process.cwd(), samplesFile));

  const screenshotName = `final-${record.rendererMode}-dpr${record.deviceScaleFactor}-${timestamp}.png`;
  const screenshotPath = artifactPath(record.id, screenshotName);
  await page.screenshot({ path: screenshotPath });
  record.screenshots.push(path.relative(process.cwd(), screenshotPath));

  const recordFile = artifactPath(record.id, `record-${timestamp}.json`);
  const { frameSamples, failingFrames, ...summarizable } = record;
  fs.writeFileSync(recordFile, JSON.stringify({ ...summarizable, frameSampleCount: frameSamples.length, failingFrames }, null, 2));
  record.scenarioFiles.push(path.relative(process.cwd(), recordFile));
}

async function writeSummary(): Promise<void> {
  const summaryFile = path.join(ARTIFACT_ROOT, 'summary.json');
  const summary = {
    generatedAt: new Date().toISOString(),
    commit: COMMIT_HASH,
    scenarios: records.map((record) => ({
      id: record.id,
      viewport: record.viewport,
      deviceScaleFactor: record.deviceScaleFactor,
      rendererMode: record.rendererMode,
      startedAt: record.startedAt,
      relevantFrames: record.relevantFrames,
      failingFrames: record.failingFrames.length,
      maxUncoveredRatio: record.maxUncoveredRatio,
      maxTextureCount: record.maxTextureCount,
      p95FrameIntervalMs: record.p95FrameIntervalMs,
      workerCount: record.workerCount,
      contextLoss: record.contextLoss,
      finalReadback: record.finalReadback,
      pageErrors: record.pageErrors.length,
      consoleErrors: record.consoleErrors.length,
      consoleWarnings: record.consoleWarnings.length,
      screenshots: record.screenshots,
      scenarioFiles: record.scenarioFiles,
    })),
  };
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
}

function p95FrameIntervalMs(samples: ViewerFrameSample[]): number {
  const intervals: number[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const interval = samples[i].timestamp - samples[i - 1].timestamp;
    if (Number.isFinite(interval) && interval > 0) intervals.push(interval);
  }
  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a - b);
  return intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))];
}

/**
 * Deterministic viewer setup. Must never depend on persisted UI mode: the
 * Review tab is selected explicitly and its aria-selected asserted.
 */
async function setupViewer(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Review\b/ }).click();
  await expect(page.getByRole('tab', { name: /^Review\b/ })).toHaveAttribute('aria-selected', 'true');
  const sheetOne = page.locator('[data-page-number="1"]').first();
  await sheetOne.waitFor({ timeout: 60000 });
  await sheetOne.click();
  await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
}

async function waitForCoverageReady(page: Page, timeout = 120000): Promise<void> {
  await page.waitForFunction(
    () => {
      const layer = document.querySelector('[data-testid="pdf-page-layer"]');
      return layer !== null && layer.getAttribute('data-coverage-ready') === 'true';
    },
    undefined,
    { timeout },
  );
}

async function dragPan(page: Page, dx: number, dy = 0): Promise<void> {
  const viewport = page.getByTestId('di-canvas-viewport');
  const box = (await viewport.boundingBox())!;
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(sx + dx, sy + dy, { steps: 12 });
  await page.mouse.up({ button: 'middle' });
}

/**
 * Per-frame acceptance: every relevant frame (a viewer document exists) must
 * have committed coverage >= 99% OR a visible fallback underlay, and frames
 * where the compositor reports a lost context must have the fallback visible.
 * Initialization frames before the first viewer document (documentKey null)
 * are the only documented exclusions.
 */
function assertNoUncoveredFrames(record: ScenarioRecord, context: string): void {
  const relevant = record.frameSamples.filter((sample) => Boolean(sample.documentKey));
  record.relevantFrames = relevant.length;
  const failing = relevant.filter((sample) => {
    const uncovered = sample.coverageRatio < 0.99;
    const compositorUnready = !sample.coverageReady;
    const lostWithoutFallback = sample.contextLost && !sample.fallbackVisible;
    return (uncovered || compositorUnready || lostWithoutFallback) && !sample.fallbackVisible;
  });
  record.failingFrames = failing;
  const maxUncovered = relevant.reduce(
    (max, sample) => Math.max(max, Math.min(1, Math.max(0, 1 - sample.coverageRatio))),
    0,
  );
  record.maxUncoveredRatio = maxUncovered;
  record.maxTextureCount = relevant.reduce((max, sample) => Math.max(max, sample.textureCount), 0);
  record.p95FrameIntervalMs = p95FrameIntervalMs(record.frameSamples);
  expect(
    failing,
    `${context}: ${failing.length} of ${relevant.length} relevant frames uncovered without fallback; ` +
      `first failing sample: ${JSON.stringify(failing.slice(0, 3))}`,
  ).toEqual([]);
}

function assertCompositorPainted(record: ScenarioRecord, context: string): void {
  expect(record.finalReadback, `${context}: stable compositor readback missing`).not.toBeNull();
  expect(record.finalReadback?.total ?? 0, `${context}: empty compositor readback`).toBeGreaterThan(0);
  expect(
    record.finalReadback?.nonTransparent ?? 0,
    `${context}: compositor is entirely transparent at the stable checkpoint`,
  ).toBeGreaterThan(0);

  const invalidReadySamples = record.frameSamples.filter(
    (sample) =>
      Boolean(sample.documentKey) &&
      sample.coverageReady &&
      (sample.committedTileCount <= 0 || sample.materializedTileCount < sample.committedTileCount),
  );
  expect(
    invalidReadySamples,
    `${context}: coverage-ready was reported without a fully materialized committed manifest`,
  ).toEqual([]);
}

function beginScenario(record: ScenarioRecord, page: Page): void {
  record.startedAt = new Date().toISOString();
  page.on('pageerror', (error: Error) => record.pageErrors.push(error.message));
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      record.consoleErrors.push(message.text());
    } else if (message.type() === 'warning') {
      record.consoleWarnings.push(message.text());
    }
  });
}

async function workerCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hardware = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 2;
    return Math.max(1, Math.min(3, hardware - 1));
  });
}

async function finalReadback(page: Page): Promise<{ kind: string; nonTransparent: number; total: number } | null> {
  return page.evaluate(
    () =>
      new Promise<{ kind: string; nonTransparent: number; total: number } | null>((resolve) => {
        (window as any).__paaxReadbackPending = true;
        (window as any).__paaxReadbackResult = null;
        requestAnimationFrame(() => requestAnimationFrame(() => resolve((window as any).__paaxReadbackResult)));
      }),
  );
}

function assertViewerConsoleClean(record: ScenarioRecord, context: string): void {
  expect(record.pageErrors, `${context}: unexpected page errors: ${JSON.stringify(record.pageErrors)}`).toEqual([]);
  const relevantErrors = record.consoleErrors.filter((text) => VIEWER_RELEVANT_CONSOLE.test(text));
  expect(
    relevantErrors,
    `${context}: viewer-relevant console errors: ${JSON.stringify(relevantErrors)}`,
  ).toEqual([]);
}

async function runInteractiveScenario(
  page: Page,
  interactions: (page: Page) => Promise<void>,
): Promise<void> {
  await setupViewer(page);
  await waitForCoverageReady(page);
  await interactions(page);
  await page.waitForTimeout(400);
}

test.describe('Drawing Viewer per-frame continuity — chromium (WebGL2, DPR 1)', () => {
  test.setTimeout(300000);

  test('setup selects Review deterministically even after persisting Quantities mode', async ({ page }) => {
    const record: ScenarioRecord = {
      id: 'persisted-quantities-regression',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      rendererMode: 'webgl2',
      commit: COMMIT_HASH,
      startedAt: '',
      frameSamples: [],
      relevantFrames: 0,
      failingFrames: [],
      maxUncoveredRatio: 0,
      maxTextureCount: 0,
      p95FrameIntervalMs: 0,
      workerCount: 0,
      contextLoss: { forced: false, observedLostFrames: 0, finalRenderer: null, finalCoverageReady: false },
      finalReadback: null,
      pageErrors: [],
      consoleErrors: [],
      consoleWarnings: [],
      screenshots: [],
      scenarioFiles: [],
    };
    beginScenario(record, page);
    await page.addInitScript(installSamplerScript() as unknown as () => void);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Persist Quantities mode, then reload: no test may pass because the
    // persisted UI mode happened to be Review.
    await page.goto(`${BASE_URL}?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /^Quantities\b/ }).click();
    await expect(page.getByRole('tab', { name: /^Quantities\b/ })).toHaveAttribute('aria-selected', 'true');
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.getByRole('tab', { name: /^Review\b/ }).click();
    await expect(page.getByRole('tab', { name: /^Review\b/ })).toHaveAttribute('aria-selected', 'true');
    await page.locator('[data-page-number="1"]').first().waitFor({ timeout: 60000 });
    await page.locator('[data-page-number="1"]').first().click();
    await page.locator('[data-testid="di-canvas-page-surface"]').waitFor({ timeout: 60000 });
    await waitForCoverageReady(page);

    // A quick continuity check after the persisted-mode reload.
    await dragPan(page, -240);
    await dragPan(page, 240);
    await page.waitForTimeout(300);
    const samples = await page.evaluate(() => (window as any).__viewerSamples as ViewerFrameSample[]);
    record.frameSamples = samples ?? [];
    record.workerCount = await workerCount(page);
    assertNoUncoveredFrames(record, 'persisted Quantities reload');
    assertViewerConsoleClean(record, 'persisted Quantities reload');
    await captureScenarioArtifacts(record, page);
    records.push(record);
  });

  test('twelve pans never leave an uncovered frame without the fallback', async ({ page }) => {
    const record: ScenarioRecord = {
      id: 'pans-dpr1',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      rendererMode: 'webgl2',
      commit: COMMIT_HASH,
      startedAt: '',
      frameSamples: [],
      relevantFrames: 0,
      failingFrames: [],
      maxUncoveredRatio: 0,
      maxTextureCount: 0,
      p95FrameIntervalMs: 0,
      workerCount: 0,
      contextLoss: { forced: false, observedLostFrames: 0, finalRenderer: null, finalCoverageReady: false },
      finalReadback: null,
      pageErrors: [],
      consoleErrors: [],
      consoleWarnings: [],
      screenshots: [],
      scenarioFiles: [],
    };
    beginScenario(record, page);
    await page.addInitScript(installSamplerScript() as unknown as () => void);
    await page.setViewportSize({ width: 1440, height: 900 });

    await runInteractiveScenario(
      page,
      async (p) => {
        for (let i = 0; i < 3; i += 1) {
          await dragPan(p, 240);
          await dragPan(p, -240);
          await dragPan(p, 480);
          await dragPan(p, -480);
        }
      },
    );

    const samples = await page.evaluate(() => (window as any).__viewerSamples as ViewerFrameSample[]);
    record.frameSamples = samples ?? [];
    record.workerCount = await workerCount(page);
    const rendererSeen = new Set(samples?.map((s) => s.renderer) ?? []);
    expect(rendererSeen.has('webgl2'), `WebGL2 renderer required on normal Chromium, saw: ${[...rendererSeen]}`).toBe(true);
    record.finalReadback = await finalReadback(page);
    assertCompositorPainted(record, '12 pans (DPR 1)');
    assertNoUncoveredFrames(record, '12 pans (DPR 1)');
    assertViewerConsoleClean(record, '12 pans (DPR 1)');
    await captureScenarioArtifacts(record, page);
    records.push(record);
  });

  test('six zoom steps plus fit never leave an uncovered frame without the fallback', async ({ page }) => {
    const record: ScenarioRecord = {
      id: 'zoom-fit-dpr1',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      rendererMode: 'webgl2',
      commit: COMMIT_HASH,
      startedAt: '',
      frameSamples: [],
      relevantFrames: 0,
      failingFrames: [],
      maxUncoveredRatio: 0,
      maxTextureCount: 0,
      p95FrameIntervalMs: 0,
      workerCount: 0,
      contextLoss: { forced: false, observedLostFrames: 0, finalRenderer: null, finalCoverageReady: false },
      finalReadback: null,
      pageErrors: [],
      consoleErrors: [],
      consoleWarnings: [],
      screenshots: [],
      scenarioFiles: [],
    };
    beginScenario(record, page);
    await page.addInitScript(installSamplerScript() as unknown as () => void);
    await page.setViewportSize({ width: 1440, height: 900 });

    await runInteractiveScenario(
      page,
      async (p) => {
        const viewport = p.getByTestId('di-canvas-viewport');
        const box = (await viewport.boundingBox())!;
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let step = 0; step < 3; step += 1) {
          await p.mouse.wheel(0, -160);
          await p.waitForTimeout(150);
        }
        for (let step = 0; step < 3; step += 1) {
          await p.mouse.wheel(0, 160);
          await p.waitForTimeout(150);
        }
        await p.getByTestId('di-canvas-viewport').dblclick();
        await p.waitForTimeout(200);
      },
    );

    const samples = await page.evaluate(() => (window as any).__viewerSamples as ViewerFrameSample[]);
    record.frameSamples = samples ?? [];
    record.workerCount = await workerCount(page);
    record.finalReadback = await finalReadback(page);
    assertCompositorPainted(record, 'six zoom steps + fit (DPR 1)');
    assertNoUncoveredFrames(record, 'six zoom steps + fit (DPR 1)');
    assertViewerConsoleClean(record, 'six zoom steps + fit (DPR 1)');
    await captureScenarioArtifacts(record, page);
    records.push(record);
  });

  test('sheet A→B→A navigation never leaves an uncovered frame without the fallback', async ({ page }) => {
    const record: ScenarioRecord = {
      id: 'navigation-abdba-dpr1',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      rendererMode: 'webgl2',
      commit: COMMIT_HASH,
      startedAt: '',
      frameSamples: [],
      relevantFrames: 0,
      failingFrames: [],
      maxUncoveredRatio: 0,
      maxTextureCount: 0,
      p95FrameIntervalMs: 0,
      workerCount: 0,
      contextLoss: { forced: false, observedLostFrames: 0, finalRenderer: null, finalCoverageReady: false },
      finalReadback: null,
      pageErrors: [],
      consoleErrors: [],
      consoleWarnings: [],
      screenshots: [],
      scenarioFiles: [],
    };
    beginScenario(record, page);
    await page.addInitScript(installSamplerScript() as unknown as () => void);
    await page.setViewportSize({ width: 1440, height: 900 });

    await setupViewer(page);
    await waitForCoverageReady(page);
    await page.locator('[data-page-number="2"]').first().waitFor({ timeout: 60000 });
    await page.locator('[data-page-number="2"]').first().click();
    await waitForCoverageReady(page);
    await page.locator('[data-page-number="1"]').first().click();
    await waitForCoverageReady(page);
    await page.waitForTimeout(400);

    const samples = await page.evaluate(() => (window as any).__viewerSamples as ViewerFrameSample[]);
    record.frameSamples = samples ?? [];
    record.workerCount = await workerCount(page);
    record.finalReadback = await finalReadback(page);
    assertCompositorPainted(record, 'A→B→A navigation (DPR 1)');
    assertNoUncoveredFrames(record, 'A→B→A navigation (DPR 1)');
    assertViewerConsoleClean(record, 'A→B→A navigation (DPR 1)');
    await captureScenarioArtifacts(record, page);
    records.push(record);
  });

  test('WebGL context loss reveals the fallback and restores or fails over deterministically', async ({ page }) => {
    const record: ScenarioRecord = {
      id: 'context-loss-dpr1',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      rendererMode: 'webgl2',
      commit: COMMIT_HASH,
      startedAt: '',
      frameSamples: [],
      relevantFrames: 0,
      failingFrames: [],
      maxUncoveredRatio: 0,
      maxTextureCount: 0,
      p95FrameIntervalMs: 0,
      workerCount: 0,
      contextLoss: { forced: false, observedLostFrames: 0, finalRenderer: null, finalCoverageReady: false },
      finalReadback: null,
      pageErrors: [],
      consoleErrors: [],
      consoleWarnings: [],
      screenshots: [],
      scenarioFiles: [],
    };
    beginScenario(record, page);
    await page.addInitScript(installSamplerScript() as unknown as () => void);
    await page.setViewportSize({ width: 1440, height: 900 });

    await setupViewer(page);
    await waitForCoverageReady(page);
    record.contextLoss.forced = true;

    // Force the first context loss through the standard WEBGL_lose_context
    // extension on the application's own context.
    const firstLossObserved = await page.evaluate(async () => {
      const canvas = document.querySelector('[data-testid="pdf-page-layer-canvas"]') as HTMLCanvasElement | null;
      if (!canvas) return false;
      const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
      const extension = gl && gl.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      extension.loseContext();
      return true;
    });
    expect(firstLossObserved, 'WEBGL_lose_context must be available to force loss').toBe(true);

    await page.waitForFunction(
      () => document.querySelector('[data-testid="pdf-page-layer"]')?.getAttribute('data-context-lost') === 'true',
      undefined,
      { timeout: 30000 },
    );

    // While lost, the fallback must be visible on every sampled frame.
    const duringLoss = await page.evaluate(() => (window as any).__viewerSamples as ViewerFrameSample[]);
    const lostFrames = (duringLoss ?? []).filter(
      (sample) => sample.documentKey !== null && sample.contextLost,
    );
    record.contextLoss.observedLostFrames = lostFrames.length;
    record.frameSamples = duringLoss ?? [];
    record.workerCount = await workerCount(page);
    const lostWithoutFallback = lostFrames.filter((sample) => !sample.fallbackVisible);
    expect(
      lostWithoutFallback,
      `lost-context frames without fallback: ${JSON.stringify(lostWithoutFallback.slice(0, 3))}`,
    ).toEqual([]);

    // Attempt restore; accept restore-to-webgl2 OR deterministic Canvas2D failover.
    await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="pdf-page-layer-canvas"]') as HTMLCanvasElement | null;
      const gl = canvas && canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
      gl && gl.getExtension('WEBGL_lose_context')?.restoreContext();
    });
    await page.waitForFunction(
      () => {
        const layer = document.querySelector('[data-testid="pdf-page-layer"]');
        const lost = layer?.getAttribute('data-context-lost') === 'true';
        const renderer = layer?.getAttribute('data-renderer-kind');
        const ready = layer?.getAttribute('data-coverage-ready') === 'true';
        return (renderer === 'webgl2' && !lost && ready) || renderer === 'canvas2d';
      },
      undefined,
      { timeout: 30000 },
    );
    await page.waitForTimeout(400);

    const finalState = await page.evaluate(() => {
      const layer = document.querySelector('[data-testid="pdf-page-layer"]');
      return {
        renderer: layer?.getAttribute('data-renderer-kind') ?? null,
        lost: layer?.getAttribute('data-context-lost'),
        coverageReady: layer?.getAttribute('data-coverage-ready'),
        coverageRatio: layer?.getAttribute('data-coverage-ratio'),
      };
    });
    record.contextLoss.finalRenderer = finalState.renderer;
    record.contextLoss.finalCoverageReady = finalState.coverageReady === 'true';
    expect(
      finalState.coverageReady === 'true',
      `context-loss end state must be coverage-ready, got: ${JSON.stringify(finalState)}`,
    ).toBe(true);

    const afterRestore = await page.evaluate(() => (window as any).__viewerSamples as ViewerFrameSample[]);
    record.frameSamples = afterRestore ?? [];
    record.finalReadback = await finalReadback(page);
    assertCompositorPainted(record, 'context loss/restore (DPR 1)');
    assertNoUncoveredFrames(record, 'context loss/restore (DPR 1)');
    assertViewerConsoleClean(record, 'context loss/restore (DPR 1)');
    await captureScenarioArtifacts(record, page);
    records.push(record);
  });
});

test.describe('Drawing Viewer per-frame continuity — DPR 2 (WebGL2)', () => {
  test.use({ deviceScaleFactor: 2 });
  test.setTimeout(300000);

  test('pan, zoom, fit, and A→B→A hold the invariant at device pixel ratio 2', async ({ page }) => {
    const record: ScenarioRecord = {
      id: 'combined-dpr2',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      rendererMode: 'webgl2',
      commit: COMMIT_HASH,
      startedAt: '',
      frameSamples: [],
      relevantFrames: 0,
      failingFrames: [],
      maxUncoveredRatio: 0,
      maxTextureCount: 0,
      p95FrameIntervalMs: 0,
      workerCount: 0,
      contextLoss: { forced: false, observedLostFrames: 0, finalRenderer: null, finalCoverageReady: false },
      finalReadback: null,
      pageErrors: [],
      consoleErrors: [],
      consoleWarnings: [],
      screenshots: [],
      scenarioFiles: [],
    };
    beginScenario(record, page);
    await page.addInitScript(installSamplerScript() as unknown as () => void);
    await page.setViewportSize({ width: 1440, height: 900 });

    await setupViewer(page);
    await waitForCoverageReady(page);
    for (let i = 0; i < 3; i += 1) {
      await dragPan(page, 240);
      await dragPan(page, -240);
    }
    const viewport = page.getByTestId('di-canvas-viewport');
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let step = 0; step < 3; step += 1) {
      await page.mouse.wheel(0, -160);
      await page.waitForTimeout(150);
    }
    for (let step = 0; step < 3; step += 1) {
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(150);
    }
    await page.getByTestId('di-canvas-viewport').dblclick();
    await page.waitForTimeout(200);
    await page.locator('[data-page-number="2"]').first().click();
    await waitForCoverageReady(page);
    await page.locator('[data-page-number="1"]').first().click();
    await waitForCoverageReady(page);
    await page.waitForTimeout(400);

    const samples = await page.evaluate(() => (window as any).__viewerSamples as ViewerFrameSample[]);
    record.frameSamples = samples ?? [];
    record.workerCount = await workerCount(page);
    const rendererSeen = new Set(samples?.map((s) => s.renderer) ?? []);
    expect(rendererSeen.has('webgl2'), `WebGL2 required at DPR 2, saw: ${[...rendererSeen]}`).toBe(true);
    record.finalReadback = await finalReadback(page);
    assertCompositorPainted(record, 'combined scenario (DPR 2)');
    assertNoUncoveredFrames(record, 'combined scenario (DPR 2)');
    assertViewerConsoleClean(record, 'combined scenario (DPR 2)');
    await captureScenarioArtifacts(record, page);
    records.push(record);
  });
});

test.describe('Drawing Viewer per-frame continuity — forced Canvas2D fallback', () => {
  test.setTimeout(300000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(forceCanvas2DScript() as unknown as () => void);
  });

  test('pan, zoom, fit, and A→B→A hold the invariant on the forced Canvas2D renderer', async ({ page }) => {
    const record: ScenarioRecord = {
      id: 'combined-canvas2d',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      rendererMode: 'canvas2d',
      commit: COMMIT_HASH,
      startedAt: '',
      frameSamples: [],
      relevantFrames: 0,
      failingFrames: [],
      maxUncoveredRatio: 0,
      maxTextureCount: 0,
      p95FrameIntervalMs: 0,
      workerCount: 0,
      contextLoss: { forced: false, observedLostFrames: 0, finalRenderer: null, finalCoverageReady: false },
      finalReadback: null,
      pageErrors: [],
      consoleErrors: [],
      consoleWarnings: [],
      screenshots: [],
      scenarioFiles: [],
    };
    beginScenario(record, page);
    await page.addInitScript(installSamplerScript() as unknown as () => void);
    await page.setViewportSize({ width: 1440, height: 900 });

    await setupViewer(page);
    await waitForCoverageReady(page);
    const viewport = page.getByTestId('di-canvas-viewport');
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 3; i += 1) {
      await dragPan(page, 240);
      await dragPan(page, -240);
    }
    for (let step = 0; step < 3; step += 1) {
      await page.mouse.wheel(0, -160);
      await page.waitForTimeout(150);
    }
    for (let step = 0; step < 3; step += 1) {
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(150);
    }
    await page.getByTestId('di-canvas-viewport').dblclick();
    await page.waitForTimeout(200);
    await page.locator('[data-page-number="2"]').first().click();
    await waitForCoverageReady(page);
    await page.locator('[data-page-number="1"]').first().click();
    await waitForCoverageReady(page);
    await page.waitForTimeout(400);

    const samples = await page.evaluate(() => (window as any).__viewerSamples as ViewerFrameSample[]);
    record.frameSamples = samples ?? [];
    record.workerCount = await workerCount(page);
    const rendererSeen = new Set(samples?.map((s) => s.renderer) ?? []);
    expect(rendererSeen.has('canvas2d'), `forced Canvas2D renderer required, saw: ${[...rendererSeen]}`).toBe(true);
    record.finalReadback = await finalReadback(page);
    assertCompositorPainted(record, 'combined scenario (Canvas2D)');
    assertNoUncoveredFrames(record, 'combined scenario (Canvas2D)');
    assertViewerConsoleClean(record, 'combined scenario (Canvas2D)');
    await captureScenarioArtifacts(record, page);
    records.push(record);
  });
});

test.afterAll(async () => {
  await writeSummary();
  console.log(`Task 6 E2E summary written to ${path.join(ARTIFACT_ROOT, 'summary.json')}`);
});
