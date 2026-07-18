import type {
  ProjectGraphCorrectionResponse,
  ProjectGraphReviewQueueResponse,
  ProjectGraphRetrievalResponse,
  ProjectGraphSummaryView,
  QuantityReadinessResponse,
} from '@paax/schemas';

/**
 * Klien tipis untuk Drawing Intelligence Workspace (C9/C9b). Semua request
 * lewat proxy /api/drawing-intelligence/* (route.ts) supaya header
 * X-Internal-Key tidak pernah terekspos ke browser. TIDAK PERNAH menghitung
 * apa pun di sini — hanya fetch + mapping tampilan (Aturan Emas, CLAUDE.md §1).
 */

const PROXY_BASE = '/api/drawing-intelligence';

export async function fetchSummaryViews(projectId: string): Promise<ProjectGraphSummaryView[]> {
  const res = await fetch(`${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/summary-views?view_kind=LEVEL_OVERVIEW`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Gagal memuat summary views (status ${res.status})`);
  }
  const rows: Array<{ payload: unknown }> = await res.json();
  return rows.map((row) => row.payload as ProjectGraphSummaryView).filter(Boolean);
}

export async function retrieveProjectGraph(
  projectId: string,
  query: string,
): Promise<ProjectGraphRetrievalResponse> {
  const res = await fetch(`${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/retrieve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, use_intent: true }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Gagal melakukan retrieve project graph (status ${res.status})`);
  }
  return res.json();
}

export async function fetchReviewQueue(projectId: string): Promise<ProjectGraphReviewQueueResponse> {
  const res = await fetch(`${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/review-queue`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    if (res.status === 404) {
      return { project_id: projectId, snapshot_id: '', items: [], summary: { total: 0, by_reason: {} } };
    }
    throw new Error(`Gagal memuat antrean review (status ${res.status})`);
  }
  return res.json();
}

export async function fetchQuantityReadiness(projectId: string): Promise<QuantityReadinessResponse> {
  const res = await fetch(`${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/quantity-readiness`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    if (res.status === 404) {
      return {
        project_id: projectId,
        snapshot_id: '',
        items: [],
        summary: { total: 0, ready: 0, needs_review: 0, blocked: 0 },
      };
    }
    throw new Error(`Gagal memuat kesiapan quantity (status ${res.status})`);
  }
  return res.json();
}

/**
 * Menyelesaikan correction (accepted/rejected) yang SUDAH ada sebagai record
 * ProjectGraphCorrection eksplisit (dibuat lewat endpoint corrections POST,
 * bukan item review-queue sintetis — lihat catatan di review-tab-panel.tsx).
 * Disediakan untuk pemanggil yang sudah punya correction_id valid.
 */
export async function resolveCorrection(
  projectId: string,
  correctionId: string,
  payload: { status: 'accepted' | 'resolved' | 'rejected'; resolution_note: string },
): Promise<ProjectGraphCorrectionResponse> {
  const res = await fetch(
    `${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/corrections/${encodeURIComponent(correctionId)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    throw new Error(`Gagal menyelesaikan correction (status ${res.status})`);
  }
  return res.json();
}

export interface ProjectDemSheetResponse {
  run_id: string;
  page_index: number;
  file_name: string;
  status: string;
  sheet_title: string | null;
  thumbnail_url: string;
}

export interface DemPageResponse {
  id: string;
  run_id: string;
  page_index: number;
  status: string;
  attempt_count: number;
  failure_kind: string | null;
  error: string | null;
  input_hash: string | null;
  result: any | null;
}

export interface DemRunResponse {
  id: string;
  project_id: string | null;
  document_id: string;
  document_hash: string;
  file_name: string;
  total_pages: number;
  provider: string;
  prompt_version: string;
  status: string;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface DemRunStatusResponse {
  id: string;
  status: string;
  total_pages: number;
  pages: DemPageResponse[];
  synthesis_status?: string;
}

export async function fetchProjectDemSheets(projectId: string): Promise<ProjectDemSheetResponse[]> {
  const res = await fetch(`${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/dem/sheets`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Gagal memuat sheets (status ${res.status})`);
  }
  return res.json();
}

export async function fetchProjectDemRuns(projectId: string): Promise<DemRunResponse[]> {
  const res = await fetch(`${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/dem/runs`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Gagal memuat runs (status ${res.status})`);
  }
  return res.json();
}

export async function startDemUpload(projectId: string, file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('project_id', projectId);

  // Menggunakan proxy document-intelligence
  const res = await fetch('/api/document-intelligence/drawings/dem/start', {
    method: 'POST',
    body: formData,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Gagal mengunggah file (status ${res.status})`);
  }
  return res.json();
}

export async function fetchDemRunStatus(runId: string): Promise<DemRunStatusResponse> {
  // Menggunakan proxy document-intelligence
  const res = await fetch(`/api/document-intelligence/drawings/dem/${encodeURIComponent(runId)}/status`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Gagal mengambil status run (status ${res.status})`);
  }
  return res.json();
}

export async function triggerSynthesis(runId: string): Promise<{ run_id: string; status: string }> {
  // Menggunakan proxy document-intelligence
  const res = await fetch(`/api/document-intelligence/drawings/dem/${encodeURIComponent(runId)}/synthesize`, {
    method: 'POST',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Gagal memicu sintesis (status ${res.status})`);
  }
  return res.json();
}

export async function createCorrection(
  projectId: string,
  payload: {
    id: string;
    snapshot_id: string;
    target_type: string;
    target_id: string;
    correction_type: string;
    proposed_value: any;
    rationale: string;
  }
): Promise<any> {
  const res = await fetch(`${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/corrections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Gagal membuat usulan koreksi (status ${res.status})`);
  }
  return res.json();
}

export async function sendRabBridgeProposal(
  projectId: string,
  nodeIds: string[]
): Promise<{ status: string; snapshot_id?: string; proposal_id?: string; items: any[] }> {
  const res = await fetch(`${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/rab-bridge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_ids: nodeIds }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Gagal mengirim proposal ke RAB Bridge (status ${res.status})`);
  }
  return res.json();
}

export async function resolveRabBridgeProposal(
  projectId: string,
  proposalId: string,
  status: 'approved' | 'rejected'
): Promise<{ status: string; snapshot_id?: string; proposal_id?: string; items: any[] }> {
  const res = await fetch(
    `${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/rab-bridge/${encodeURIComponent(proposalId)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    throw new Error(`Gagal menyelesaikan proposal RAB Bridge (status ${res.status})`);
  }
  return res.json();
}

export async function materializeRabBridgeProposal(
  projectId: string,
  proposalId: string
): Promise<{ materialized_count: number; skipped_items: { name: string; reason: string }[] }> {
  const res = await fetch(
    `${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/rab-bridge/${encodeURIComponent(proposalId)}/materialize`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    throw new Error(`Gagal mematerialisasi proposal RAB Bridge ke RAB Draft (status ${res.status})`);
  }
  return res.json();
}


