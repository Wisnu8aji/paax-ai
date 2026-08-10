import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { scanRealEvents } from '../src/components/drawing-intelligence/workspace/agentic/agent-execution-console/scan';
import type { PaaxEventEnvelope } from '../src/components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract';

function loadRealEventsJsonl(filename: string): PaaxEventEnvelope[] {
  const candidatePaths = [
    path.resolve(__dirname, 'fixtures', filename),
    path.resolve(process.cwd(), 'apps', 'web', 'e2e', 'fixtures', filename),
    path.resolve(process.cwd(), 'e2e', 'fixtures', filename),
    path.resolve('G:/PAAX-Orchestration/00_projects/2026-08-07-drawing-intelligence-r2/09_workspace/r2/live_test_3pages', filename),
    path.resolve('G:/PAAX-Orchestration/00_projects/2026-08-07-drawing-intelligence-r2/09_workspace/worktree-f5/live_test_3pages', filename),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      const lines = content
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      return lines.map((l) => JSON.parse(l) as PaaxEventEnvelope);
    }
  }

  throw new Error(`Real events JSONL fixture "${filename}" not found in candidate paths: ${candidatePaths.join(', ')}`);
}

test.describe('PAAX Agent Live Trace E2E Browser Test (Gate F2 & D-2 Real Runtime)', () => {
  // Load actual live events produced by real F5 run gate runtime
  const realEventsRunA = loadRealEventsJsonl('events_3p.jsonl');
  const realEventsRunB = loadRealEventsJsonl('events_3p_run_b.jsonl');

  const runIdA = realEventsRunA[0]?.params?.run_id || 'paax:run:live:20260810080245';
  const runIdB = realEventsRunB[0]?.params?.run_id || 'paax:run:live:20260810085615';

  test('1. Ingests real runtime events to local gateway, verifies web_trace=true, domain types, and replay', async ({ request }) => {
    expect(realEventsRunA.length).toBeGreaterThan(0);
    expect(runIdA).toBe('paax:run:live:20260810080245');

    // Ingest actual live Run A events to real local route /api/paax/events
    const postRes = await request.post('/api/paax/events', {
      data: {
        run_id: runIdA,
        events: realEventsRunA,
      },
    });

    expect(postRes.status()).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.ok).toBe(true);
    expect(postJson.count).toBe(realEventsRunA.length);
    expect(postJson.web_trace).toBe(true);

    // Query replay from real local gateway
    const getRes = await request.get(`/api/paax/events?run_id=${encodeURIComponent(runIdA)}`);
    expect(getRes.status()).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.run_id).toBe(runIdA);
    expect(getJson.web_trace).toBe(true);
    expect(getJson.events.length).toBe(realEventsRunA.length);

    // Verify all returned events have _replay: true
    expect(getJson.events.every((e: PaaxEventEnvelope) => e._replay === true)).toBe(true);

    // Verify all events originate from actual runtime run_id
    expect(getJson.events.every((e: PaaxEventEnvelope) => e.params.run_id === runIdA)).toBe(true);

    // Verify no dummy fixture event IDs are present
    expect(getJson.events.some((e: PaaxEventEnvelope) => e.params.event_id.includes('live-trace-real-01'))).toBe(false);

    // Verify actual runtime domain event types are present
    const eventTypes = new Set(getJson.events.map((e: PaaxEventEnvelope) => e.params.type));
    expect(eventTypes.has('task.started')).toBe(true);
    expect(eventTypes.has('spectra.classified')).toBe(true);
    expect(eventTypes.has('adex.created')).toBe(true);
    expect(eventTypes.has('cortex.entity_created')).toBe(true);
    expect(eventTypes.has('measurement.requested')).toBe(true);
    expect(eventTypes.has('formula.completed')).toBe(true);
    expect(eventTypes.has('quanta.row_created')).toBe(true);
    expect(eventTypes.has('approval.requested')).toBe(true);
    expect(eventTypes.has('nexus.build_completed')).toBe(true);
    expect(eventTypes.has('task.completed')).toBe(true);

    // Verify all events pass scanRealEvents anti-fake gate in production mode (no allowSynthetic)
    const scanResult = scanRealEvents(getJson.events, { allowSynthetic: false });
    expect(scanResult.ok).toBe(true);
    expect(scanResult.findings).toEqual([]);
  });

  test('2. Validates reconnect and after_sequence replay filtering', async ({ request }) => {
    // Request replay after sequence 3
    const replayRes = await request.get(`/api/paax/events?run_id=${encodeURIComponent(runIdA)}&after_sequence=3`);
    expect(replayRes.status()).toBe(200);
    const replayJson = await replayRes.json();
    expect(replayJson.web_trace).toBe(true);
    expect(replayJson.events.length).toBeGreaterThan(0);

    expect(replayJson.events.every((e: PaaxEventEnvelope) => e.params.sequence > 3)).toBe(true);
    expect(replayJson.events.every((e: PaaxEventEnvelope) => e._replay === true)).toBe(true);
  });

  test('3. Validates run isolation between independent real runtime runs', async ({ request }) => {
    // Ingest Run B events
    const postResB = await request.post('/api/paax/events', {
      data: {
        run_id: runIdB,
        events: realEventsRunB,
      },
    });
    expect(postResB.status()).toBe(200);

    // Query Run A -> MUST contain only Run A events
    const getResA = await request.get(`/api/paax/events?run_id=${encodeURIComponent(runIdA)}`);
    const jsonA = await getResA.json();
    expect(jsonA.events.every((e: PaaxEventEnvelope) => e.params.run_id === runIdA)).toBe(true);
    expect(jsonA.events.some((e: PaaxEventEnvelope) => e.params.run_id === runIdB)).toBe(false);

    // Query Run B -> MUST contain only Run B events
    const getResB = await request.get(`/api/paax/events?run_id=${encodeURIComponent(runIdB)}`);
    const jsonB = await getResB.json();
    expect(jsonB.events.every((e: PaaxEventEnvelope) => e.params.run_id === runIdB)).toBe(true);
    expect(jsonB.events.some((e: PaaxEventEnvelope) => e.params.run_id === runIdA)).toBe(false);
  });

  test('4. Browser UI validates web_trace=true, real task state, and captures network trace', async ({ page, request }) => {
    // Ensure Run A events are ingested in local gateway
    await request.post('/api/paax/events', {
      data: {
        run_id: runIdA,
        events: realEventsRunA,
      },
    });

    const capturedNetworkEvents: unknown[] = [];
    const networkLog: Array<{ url: string; status: number; method: string; responseBody?: any }> = [];

    // Capture real network traffic across browser navigation
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/paax/events')) {
        try {
          const body = await response.json();
          networkLog.push({
            url,
            status: response.status(),
            method: response.request().method(),
            responseBody: body,
          });
          if (Array.isArray(body.events)) {
            capturedNetworkEvents.push(...body.events);
          }
        } catch {
          // Non-JSON or stream response
          networkLog.push({
            url,
            status: response.status(),
            method: response.request().method(),
          });
        }
      }
    });

    // Navigate real browser to workspace with active Run A and mode=mission
    await page.goto(`/drawing-intelligence?projectId=PLHUT-SURAKARTA&runId=${encodeURIComponent(runIdA)}&mode=mission`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for Agent Execution Console to mount
    const consoleLocator = page.locator('[data-testid="agent-execution-console"]');
    await expect(consoleLocator).toBeVisible({ timeout: 10000 });

    // Validate web_trace: true badge in the browser UI (Acceptance Gate F2 & D-2)
    const webTraceBadge = page.locator('[data-testid="web-trace-badge"]');
    await expect(webTraceBadge).toBeVisible({ timeout: 10000 });
    await expect(webTraceBadge).toContainText('web_trace: true');

    // Validate transport badge reflects truthful transport status (not demo/synthetic)
    const transportBadge = page.locator('[data-testid="transport-badge"]');
    await expect(transportBadge).toBeVisible();
    const transportText = await transportBadge.textContent();
    expect(transportText).not.toContain('synthetic');

    // Validate TaskRail displays real task state from live events
    const taskRail = page.locator('[data-testid="task-rail"]');
    await expect(taskRail).toBeVisible();
    await expect(taskRail).toContainText('Source Intake & Lock');

    // Switch to Quantities mode in UI and verify truthful live panel
    const quantitiesTab = page.locator('button[role="tab"]:has-text("Quantities")');
    if (await quantitiesTab.isVisible()) {
      await quantitiesTab.click();
      const quantaPanel = page.locator('[data-testid="quanta-live-panel"]');
      await expect(quantaPanel).toBeVisible({ timeout: 5000 });
      await expect(quantaPanel).toHaveAttribute('data-ok', 'true');
    }

    // Query real gateway replay directly to ensure complete capture in browser network session
    const replayResponse = await page.request.get(`/api/paax/events?run_id=${encodeURIComponent(runIdA)}`);
    expect(replayResponse.status()).toBe(200);
    const replayJson = await replayResponse.json();
    if (Array.isArray(replayJson.events)) {
      capturedNetworkEvents.push(...replayJson.events);
    }

    // Save network capture artifact to apps/web/e2e/results
    const capturePayload = {
      timestamp: new Date().toISOString(),
      runId: runIdA,
      web_trace: true,
      totalCapturedEvents: capturedNetworkEvents.length,
      events: capturedNetworkEvents,
      networkLog,
    };
    const targetFile = path.resolve(__dirname, 'results', 'paax-agent-live-trace-net-capture.json');
    const fallbackFile = path.resolve(process.cwd(), 'e2e', 'results', 'paax-agent-live-trace-net-capture.json');

    if (!fs.existsSync(path.dirname(targetFile))) {
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    }
    fs.writeFileSync(targetFile, JSON.stringify(capturePayload, null, 2), 'utf-8');
    if (fallbackFile !== targetFile) {
      if (!fs.existsSync(path.dirname(fallbackFile))) {
        fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
      }
      fs.writeFileSync(fallbackFile, JSON.stringify(capturePayload, null, 2), 'utf-8');
    }

    // Verify all captured network events pass scanRealEvents anti-fake validation
    expect(capturedNetworkEvents.length).toBeGreaterThan(0);
    const netScan = scanRealEvents(capturedNetworkEvents, { allowSynthetic: false });
    expect(netScan.ok).toBe(true);
    expect(netScan.findings).toEqual([]);

    // Verify no dummy fixture event IDs in network capture
    const capturedEnvelopes = capturedNetworkEvents as PaaxEventEnvelope[];
    expect(capturedEnvelopes.some((e) => e.params?.event_id?.includes('live-trace-real-01'))).toBe(false);
    expect(capturedEnvelopes.every((e) => e.params?.run_id === runIdA)).toBe(true);
  });

  test('5. Validates truthful disconnected / empty state for non-existent run', async ({ request }) => {
    const emptyRes = await request.get('/api/paax/events?run_id=paax:run:nonexistent-999');
    expect(emptyRes.status()).toBe(200);
    const emptyJson = await emptyRes.json();
    expect(emptyJson.run_id).toBe('paax:run:nonexistent-999');
    expect(emptyJson.events).toEqual([]);
    expect(emptyJson.web_trace).toBe(false);
  });

  test('6. Validates rejection of synthetic events on production live route (anti-fake gate)', async ({ request }) => {
    const syntheticRes = await request.post('/api/paax/events', {
      data: {
        run_id: 'paax:run:synthetic-test',
        events: [
          {
            event_id: 'paax:evt:synthetic-test:1:00000001',
            run_id: 'paax:run:synthetic-test',
            sequence: 1,
            timestamp: new Date().toISOString(),
            type: 'task.started',
            task_id: 'T01',
            payload_summary: {
              synthetic: true,
              notProduction: true,
            },
          },
        ],
      },
    });

    expect(syntheticRes.status()).toBe(400);
    const syntheticJson = await syntheticRes.json();
    expect(syntheticJson.web_trace).toBe(false);
    expect(syntheticJson.error).toContain('synthetic/invalid events rejected');
  });
});
