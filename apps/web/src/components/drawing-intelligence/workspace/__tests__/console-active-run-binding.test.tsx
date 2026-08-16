// @vitest-environment jsdom
//
// paax/web — AgentExecutionConsole runId binding (MP3-P2).
//
// Konsol overlay harus mengikuti run id CANONICAL dari workspace state
// (state.activeRunId), bukan lookup upload-entry yang bisa stale:
//   - activeRunId bisa terisi lewat initialRunId / set-active-run tanpa ada
//     upload entry yang membawa runId (entries kosong) → lookup entries
//     mengembalikan null → konsol menampilkan "menunggu run" padahal run
//     canonical sudah aktif (regresi binding, G2.1).
//   - entries bisa berisi runId lama setelah activeRunId pindah ke run baru
//     (retry/re-analysis) → konsol harus tetap mengikuti activeRunId.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { DrawingIntelligenceWorkspaceV2 } from '../index';

// API layer: semua function dummy — tidak ada jaringan. fetchDemRunStatus
// menggantung (never resolve) supaya analysis.running tetap true dan konsol
// tetap mounted selama assertion.
vi.mock('../../drawing-intelligence-api', () => ({
  fetchReviewQueue: vi.fn(),
  fetchQuantityReadiness: vi.fn(),
  fetchCivilWorkItems: vi.fn(),
  fetchProjectDemSheets: vi.fn(),
  fetchProjectDemRuns: vi.fn(),
  fetchSummaryViews: vi.fn(),
  fetchPackageIntelligence: vi.fn(),
  fetchActiveSheetContext: vi.fn(),
  fetchDrawingPackageIndex: vi.fn(),
  retrieveProjectGraph: vi.fn(),
  calculateDrawingIntelligenceWorkItem: vi.fn(),
  submitDrawingIntelligenceReview: vi.fn(),
  fetchDemRunStatus: vi.fn(() => new Promise(() => {})),
  publishRunStatusEvent: vi.fn(),
  triggerSynthesis: vi.fn(),
  startDemUpload: vi.fn(),
}));

// Isolasi dari session runtime-bridge singleton: konsol men-start bridge
// gateway begitu ada runId — di-noop supaya tidak ada fetch/WS nyata.
// getRuntimeStore/useRuntimeTransport tetap nyata (store & status jujur).
vi.mock('../agentic/agent-execution-console/runtime-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../agentic/agent-execution-console/runtime-bridge')>();
  return {
    ...actual,
    startRuntimeBridge: vi.fn(),
    stopRuntimeBridge: vi.fn(),
    sendRuntimeCommand: vi.fn(() => false),
    respondRuntimeApproval: vi.fn(() => false),
  };
});

import { startRuntimeBridge } from '../agentic/agent-execution-console/runtime-bridge';

const mockedStartBridge = vi.mocked(startRuntimeBridge);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('AgentExecutionConsole runId binding — canonical activeRunId', () => {
  it('konsol mengikuti activeRunId canonical (initialRunId), bukan lookup upload-entry yang stale', async () => {
    render(
      <DrawingIntelligenceWorkspaceV2
        projectName="Proyek Test"
        initialRunId="paax:run:canonical"
      />,
    );

    // Mulai analisis via topbar → analysis.running=true → konsol overlay mount.
    fireEvent.click(screen.getByRole('button', { name: /analyze selected/i }));

    await waitFor(() => {
      expect(screen.getByTestId('agent-execution-console')).toBeTruthy();
    });

    // Header konsol menampilkan run id canonical dari workspace state —
    // BUKAN "menunggu run" (lookup upload-entry kosong/stale).
    expect(screen.getByText('paax:run:canonical')).toBeTruthy();
    expect(screen.queryByText('menunggu run')).toBeNull();

    // Bridge konsol di-bind ke run canonical yang sama dengan workspace store.
    expect(mockedStartBridge).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'paax:run:canonical' }),
    );
  });

  it('tanpa activeRunId konsol tetap menunggu run (tidak menciptakan runId fiktif)', async () => {
    render(<DrawingIntelligenceWorkspaceV2 projectName="Proyek Test" />);

    fireEvent.click(screen.getByRole('button', { name: /analyze selected/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/run analisis belum tersedia/i).length).toBeGreaterThan(0);
    });
    // Tidak ada run → konsol tetap mount sebagai diagnostic surface; tidak ada
    // bridge start ke run fiktif apa pun.
    expect(screen.getByTestId('agent-execution-console')).toBeTruthy();
    expect(mockedStartBridge).not.toHaveBeenCalled();
  });
});
