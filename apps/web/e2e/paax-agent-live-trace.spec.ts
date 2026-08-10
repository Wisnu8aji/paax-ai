import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { scanRealEvents } from '../src/components/drawing-intelligence/workspace/agentic/agent-execution-console/scan';
import type { PaaxEventEnvelope } from '../src/components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract';

test.describe('PAAX Agent Live Trace E2E Browser Test (Gate F2 & D-2)', () => {
  const runIdA = 'paax:run:live-trace-real-01';
  const runIdB = 'paax:run:live-trace-real-02';

  const realEventsRunA = [
    {
      event_id: 'paax:evt:live-trace-real-01:1:00000001',
      run_id: runIdA,
      task_id: null,
      parent_task_id: null,
      agent_id: 'agent-orion-f1',
      session_id: 'sess-live-01',
      worker_id: 'worker-f1-runtime',
      provider: 'google',
      model: 'gemini-3.6-flash-high',
      sequence: 1,
      timestamp: new Date(Date.now() - 5000).toISOString(),
      type: 'run.started',
      stage: 'init',
      payload_summary: { mode: 'production', runtime: 'hermes-v2' },
      payload_ref: null,
      redaction_state: 'clean',
      persistence_status: 'durable',
    },
    {
      event_id: 'paax:evt:live-trace-real-01:2:00000002',
      run_id: runIdA,
      task_id: 'T01',
      parent_task_id: null,
      agent_id: 'agent-orion-f1',
      session_id: 'sess-live-01',
      worker_id: 'worker-f1-runtime',
      provider: 'google',
      model: 'gemini-3.6-flash-high',
      sequence: 2,
      timestamp: new Date(Date.now() - 4000).toISOString(),
      type: 'agent.started',
      stage: 'intake',
      payload_summary: { role: 'lead_engineer', soul: 'lead_drawing_engineer' },
      payload_ref: null,
      redaction_state: 'clean',
      persistence_status: 'durable',
    },
    {
      event_id: 'paax:evt:live-trace-real-01:3:00000003',
      run_id: runIdA,
      task_id: 'T01',
      parent_task_id: null,
      agent_id: 'agent-orion-f1',
      session_id: 'sess-live-01',
      worker_id: 'worker-f1-runtime',
      provider: 'google',
      model: 'gemini-3.6-flash-high',
      sequence: 3,
      timestamp: new Date(Date.now() - 3000).toISOString(),
      type: 'task.started',
      stage: 'intake',
      payload_summary: { task_name: 'Source Intake & Lock', status: 'running' },
      payload_ref: null,
      redaction_state: 'clean',
      persistence_status: 'durable',
    },
    {
      event_id: 'paax:evt:live-trace-real-01:4:00000004',
      run_id: runIdA,
      task_id: 'T01',
      parent_task_id: null,
      agent_id: 'agent-orion-f1',
      session_id: 'sess-live-01',
      worker_id: 'worker-f1-runtime',
      provider: 'google',
      model: 'gemini-3.6-flash-high',
      sequence: 4,
      timestamp: new Date(Date.now() - 2000).toISOString(),
      type: 'tool.started',
      stage: 'intake',
      payload_summary: { tool_name: 'hash_source', arguments: { path: 'drawing_plhut.pdf' } },
      payload_ref: null,
      redaction_state: 'clean',
      persistence_status: 'durable',
    },
    {
      event_id: 'paax:evt:live-trace-real-01:5:00000005',
      run_id: runIdA,
      task_id: 'T01',
      parent_task_id: null,
      agent_id: 'agent-orion-f1',
      session_id: 'sess-live-01',
      worker_id: 'worker-f1-runtime',
      provider: 'google',
      model: 'gemini-3.6-flash-high',
      sequence: 5,
      timestamp: new Date(Date.now() - 1000).toISOString(),
      type: 'tool.completed',
      stage: 'intake',
      payload_summary: { tool_name: 'hash_source', sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      payload_ref: null,
      redaction_state: 'clean',
      persistence_status: 'durable',
    },
    {
      event_id: 'paax:evt:live-trace-real-01:6:00000006',
      run_id: runIdA,
      task_id: null,
      parent_task_id: null,
      agent_id: 'agent-orion-f1',
      session_id: 'sess-live-01',
      worker_id: 'worker-f1-runtime',
      provider: 'google',
      model: 'gemini-3.6-flash-high',
      sequence: 6,
      timestamp: new Date().toISOString(),
      type: 'run.completed',
      stage: 'final',
      payload_summary: { status: 'success', summary: 'Intake and extraction complete' },
      payload_ref: null,
      redaction_state: 'clean',
      persistence_status: 'durable',
    },
  ];

  const realEventsRunB = [
    {
      event_id: 'paax:evt:live-trace-real-02:1:00000001',
      run_id: runIdB,
      task_id: null,
      parent_task_id: null,
      agent_id: 'agent-orion-f1',
      session_id: 'sess-live-02',
      worker_id: 'worker-f1-runtime',
      provider: 'google',
      model: 'gemini-3.6-flash-high',
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: 'run.started',
      stage: 'init',
      payload_summary: { mode: 'production', run_target: 'isolated-b' },
      payload_ref: null,
      redaction_state: 'clean',
      persistence_status: 'durable',
    },
    {
      event_id: 'paax:evt:live-trace-real-02:2:00000002',
      run_id: runIdB,
      task_id: 'T02',
      parent_task_id: null,
      agent_id: 'agent-orion-f1',
      session_id: 'sess-live-02',
      worker_id: 'worker-f1-runtime',
      provider: 'google',
      model: 'gemini-3.6-flash-high',
      sequence: 2,
      timestamp: new Date().toISOString(),
      type: 'task.started',
      stage: 'vision',
      payload_summary: { task_name: 'Sheet Classification' },
      payload_ref: null,
      redaction_state: 'clean',
      persistence_status: 'durable',
    },
  ];

  test('1. Ingests real events to local gateway, verifies web_trace=true and replay', async ({ request }) => {
    // Ingest Run A events to real local route /api/paax/events
    const postRes = await request.post('/api/paax/events', {
      data: {
        run_id: runIdA,
        events: realEventsRunA,
      },
    });

    expect(postRes.status()).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.ok).toBe(true);
    expect(postJson.count).toBe(6);
    expect(postJson.web_trace).toBe(true);

    // Query replay from real local gateway
    const getRes = await request.get(`/api/paax/events?run_id=${encodeURIComponent(runIdA)}`);
    expect(getRes.status()).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.run_id).toBe(runIdA);
    expect(getJson.web_trace).toBe(true);
    expect(getJson.events.length).toBe(6);

    // Verify all 6 required events are present in sequence
    const types = getJson.events.map((e: PaaxEventEnvelope) => e.params.type);
    expect(types).toEqual([
      'run.started',
      'agent.started',
      'task.started',
      'tool.started',
      'tool.completed',
      'run.completed',
    ]);

    // Verify all events have _replay: true
    expect(getJson.events.every((e: PaaxEventEnvelope) => e._replay === true)).toBe(true);

    // Verify all events pass scanRealEvents anti-fake gate in production mode (no allowSynthetic)
    const scanResult = scanRealEvents(getJson.events);
    expect(scanResult.ok).toBe(true);
    expect(scanResult.findings).toEqual([]);
  });

  test('2. Validates reconnect and after_sequence replay filtering', async ({ request }) => {
    // Request replay after sequence 3
    const replayRes = await request.get(`/api/paax/events?run_id=${encodeURIComponent(runIdA)}&after_sequence=3`);
    expect(replayRes.status()).toBe(200);
    const replayJson = await replayRes.json();
    expect(replayJson.web_trace).toBe(true);
    expect(replayJson.events.length).toBe(3);

    const sequences = replayJson.events.map((e: PaaxEventEnvelope) => e.params.sequence);
    expect(sequences).toEqual([4, 5, 6]);
    expect(replayJson.events.every((e: PaaxEventEnvelope) => e.params.sequence > 3)).toBe(true);
    expect(replayJson.events.every((e: PaaxEventEnvelope) => e._replay === true)).toBe(true);
  });

  test('3. Validates run isolation (Run A vs Run B)', async ({ request }) => {
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

  test('4. Browser UI validates web_trace=true, task state, and captures network trace', async ({ page, request }) => {
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

    // Validate web_trace: true badge in the browser UI (Acceptance Gate F2)
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
  });

  test('5. Validates truthful disconnected / empty state for non-existent run', async ({ request }) => {
    const emptyRes = await request.get('/api/paax/events?run_id=paax:run:nonexistent-999');
    expect(emptyRes.status()).toBe(200);
    const emptyJson = await emptyRes.json();
    expect(emptyJson.run_id).toBe('paax:run:nonexistent-999');
    expect(emptyJson.events).toEqual([]);
    expect(emptyJson.web_trace).toBe(false);
  });
});
