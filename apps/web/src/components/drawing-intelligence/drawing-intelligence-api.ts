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

export interface CivilWorkItemResponse {
  id: string;
  display_name: string;
  technical_code: string;
  discipline: string;
  lbs_path: string[];
  wbs_section: string;
  wbs_group: string;
  category: string;
  location: string;
  unit: string;
  dimensions_display: string;
  count: number;
  formula: string;
  result: number;
  result_display: string;
  status: string;
  source_authority: 'none' | 'measurement_fact' | 'core_engine';
  source_pages: number[];
  source_refs: Array<{ role: string; page: number; label: string }>;
  evidence_refs: string[];
  readiness: string;
  conflicts: unknown[];
  notes: string[];
}

export interface CivilWorkItemsResponse {
  schema_version: string;
  project_id: string;
  source_document_sha256: string;
  generated_from: string;
  items: CivilWorkItemResponse[];
  summary: { total: number; ready: number; needs_review: number; by_location: Record<string, number> };
}

export async function fetchCivilWorkItems(projectId: string): Promise<CivilWorkItemsResponse | null> {
  const res = await fetch(`${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/civil-work-items`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Gagal memuat Civil Work Items (status ${res.status})`);
  return res.json();
}

export function civilWorkItemsExportUrl(projectId: string): string {
  return `${PROXY_BASE}/projects/${encodeURIComponent(projectId)}/project-graph/civil-work-items/export.xlsx`;
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
  sheet_title?: string | null;
  sheet_number?: string | null;
  discipline?: string | null;
  level?: string | null;
  scale?: string | null;
  revision?: string | null;
  confidence?: number | null;
  width_px?: number | null;
  height_px?: number | null;
  thumbnail_url?: string | null;
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

export interface PdfArtifactUrlResponse {
  url: string;
  expiresAt: string;
}

/** Issues an in-memory-only signed browser-proxy URL for an original PDF. */
export async function fetchPdfArtifactUrl(runId: string): Promise<PdfArtifactUrlResponse> {
  const res = await fetch(`/api/document-intelligence/drawings/dem/${encodeURIComponent(runId)}/artifact-url`, {
    method: 'POST',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Gagal membuat URL PDF sementara (status ${res.status})`);
  const payload: { url?: string; artifact_url?: string; token?: string; expires_at?: string | number; expiresAt?: string | number } = await res.json();
  const expiresAt = payload.expiresAt ?? payload.expires_at;
  const url = payload.url ?? payload.artifact_url ?? (payload.token
    ? `/api/document-intelligence/drawings/dem/${encodeURIComponent(runId)}/artifact?token=${encodeURIComponent(payload.token)}`
    : undefined);
  if (!url || expiresAt === undefined) throw new Error('URL PDF sementara tidak lengkap');
  const normalizedExpiry = typeof expiresAt === 'number' ? new Date(expiresAt * 1000).toISOString() : expiresAt;
  if (Number.isNaN(new Date(normalizedExpiry).getTime())) throw new Error('Masa berlaku URL PDF tidak valid');
  return { url, expiresAt: normalizedExpiry };
}

export async function triggerSynthesis(
  runId: string,
  analysisMode: 'fast' | 'balanced' | 'deep' = 'fast',
): Promise<{ run_id: string; status: string; analysis_mode?: string }> {
  // Menggunakan proxy document-intelligence
  const res = await fetch(`/api/document-intelligence/drawings/dem/${encodeURIComponent(runId)}/synthesize?analysis_mode=${encodeURIComponent(analysisMode)}`, {
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




export interface PackageIntelligenceSourceSheet {
  page_index: number;
  page_number: number;
  sheet_number: string | null;
  title: string | null;
  discipline: string;
  drawing_type: string;
  level: string | null;
  readiness: 'ready' | 'review' | 'blocked';
}


export interface DrawingConflictSourceValue {
  value_id: string;
  field: 'count' | 'dimensions' | 'elevation' | 'height' | 'classification' | 'revision';
  value: unknown;
  unit: string | null;
  page_index: number;
  sheet_title: string | null;
  evidence_refs: string[];
  source_channel: 'native_pdf' | 'dem' | 'schedule' | 'legend' | 'section' | 'user' | 'engine';
  confidence: number;
  authority_rank: number;
}

export interface DrawingConflict {
  conflict_id: string;
  work_item_id: string;
  field: 'count' | 'dimensions' | 'elevation' | 'height' | 'classification' | 'revision';
  title: string;
  explanation: string;
  source_values: DrawingConflictSourceValue[];
  affected_page_indices: number[];
  affected_pages?: PackageIntelligenceSourceSheet[];
  status: 'open' | 'system_resolved' | 'human_resolved' | 'superseded';
  selected_value_id: string | null;
  resolution_note: string | null;
}

export interface DrawingMeasurementFact {
  measurement_id: string;
  work_item_id: string;
  field: 'count' | 'width' | 'depth' | 'height' | 'elevation' | 'area' | 'length' | 'volume';
  value: number;
  unit: string;
  source_method: string;
  verification_status: string;
  evidence_refs: string[];
  source_page_indices: number[];
  formula_input: string | null;
}

export interface DrawingWorkItemCalculation {
  calculation_id: string;
  work_item_id: string;
  calculation_type: string;
  status: 'complete' | 'blocked' | 'needs_input' | 'stale';
  formula: string | null;
  substituted_formula: string | null;
  result: number | null;
  unit: string | null;
  measurement_fact_ids: string[];
  warnings: string[];
  engine_version: string | null;
}

export interface PackageIntelligenceWorkItem {
  work_item_id: string;
  category: string;
  source_category?: string;
  discipline: string;
  code: string | null;
  display_name: string;
  technical_name: string;
  plain_name: string;
  plain_description: string;
  level: string | null;
  level_label: string;
  status: string;
  status_label: string;
  maturity: string;
  readiness_score: number;
  confidence: number;
  confidence_percent: number;
  observed_label_count: number;
  verified_physical_count: number | null;
  count_authority: 'candidate' | 'engine_confirmed' | 'human_confirmed' | 'conflicting';
  count_label: string;
  count_is_final: boolean;
  dimensions_text: string | null;
  geometry_kind: string;
  known_facts: string[];
  blockers: string[];
  recommended_actions: string[];
  page_indices?: number[];
  source_sheets: PackageIntelligenceSourceSheet[];
  occurrences: Array<Record<string, unknown>>;
  evidence_count: number;
  evidence_refs: string[];
  review_task_ids: string[];
  attributes: Record<string, unknown>;
  conflicts: DrawingConflict[];
  conflict_status: 'open' | 'none';
  measurement_facts: DrawingMeasurementFact[];
  calculation_readiness: 'blocked' | 'needs_input' | 'ready' | 'calculated';
  calculation: DrawingWorkItemCalculation | null;
  reupload_page_indices?: number[];
  user_accepted: boolean;
}

export interface PackageIntelligenceWorkGroup {
  group_id: string;
  discipline: string;
  level: string | null;
  level_label: string;
  item_count: number;
  observed_label_count: number;
  average_readiness_score: number;
  category_summary: Record<string, number>;
  items: PackageIntelligenceWorkItem[];
}

export interface PackageIntelligenceReviewSummary {
  recognized_work_items: number;
  needs_clarification: number;
  suppressed_audit_candidates: number;
  open_review_tasks: number;
  accepted_drawing_objects: number;
  disciplines: Record<string, number>;
  levels: Record<string, number>;
  average_readiness_score: number;
  review_batches: number;
}

export interface PackageIntelligenceReviewBatch {
  batch_id: string;
  severity: 'info' | 'review' | 'blocking';
  issue: string;
  title: string;
  task_count: number;
  page_indices: number[];
  page_numbers: number[];
  recommended_action: string;
  task_ids: string[];
  sample_titles: string[];
}

export interface PackageIntelligenceSummary {
  schema_version: string;
  package_id: string;
  document_name: string;
  metrics: Record<string, any>;
  phase_status: Record<string, string>;
  warnings: string[];
  work_items: PackageIntelligenceWorkItem[];
  work_groups: PackageIntelligenceWorkGroup[];
  needs_clarification: PackageIntelligenceWorkItem[];
  suppressed_candidate_count?: number;
  review_summary: PackageIntelligenceReviewSummary;
  review_batches: PackageIntelligenceReviewBatch[];
  accepted_drawing_objects: Array<Record<string, unknown>>;
  review_task_count: number;
  review_ledger: { version?: number; event_count?: number };
}

export async function fetchPackageIntelligence(runId: string): Promise<PackageIntelligenceSummary | null> {
  const res = await fetch(
    `/api/document-intelligence/drawings/dem/${encodeURIComponent(runId)}/intelligence?view=summary`,
    { cache: 'no-store' },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Gagal memuat package intelligence (status ${res.status})`);
  return res.json();
}

export interface DrawingReviewDecision {
  work_item_id: string;
  action: 'accept' | 'reject' | 'edit' | 'reopen' | 'resolve_conflict' | 'request_reupload';
  expected_version: number;
  reason: string;
  corrected_category?: string;
  corrected_code?: string;
  corrected_label?: string;
  corrected_level?: string;
  verified_physical_count?: number;
  conflict_id?: string;
  selected_source_value_id?: string;
  corrected_width?: number;
  corrected_depth?: number;
  corrected_dimension_unit?: string;
  corrected_height?: number;
  corrected_height_unit?: string;
  corrected_elevation?: number;
  corrected_elevation_unit?: string;
  reupload_page_indices?: number[];
}

export async function submitDrawingIntelligenceReview(
  runId: string,
  decision: DrawingReviewDecision,
): Promise<{ status: string; ledger_version: number; event: Record<string, unknown>; accepted_drawing_objects: Array<Record<string, unknown>> }> {
  const res = await fetch(
    `/api/document-intelligence/drawings/dem/${encodeURIComponent(runId)}/intelligence/reviews`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(decision),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`Gagal menyimpan review Drawing Intelligence (status ${res.status})`);
  return res.json();
}

export async function calculateDrawingIntelligenceWorkItem(
  runId: string,
  workItemId: string,
): Promise<DrawingWorkItemCalculation> {
  const res = await fetch(
    `/api/document-intelligence/drawings/dem/${encodeURIComponent(runId)}/intelligence/items/${encodeURIComponent(workItemId)}/calculate`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store' },
  );
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail || `Gagal menghitung item pekerjaan (status ${res.status})`);
  }
  return res.json();
}

export interface InteractiveMeasurementCandidate {
  measurement_id: string;
  page_index: number;
  kind: 'area' | 'line';
  geometry: [number, number][];
  geometry_space: 'normalized' | 'pdf_point' | 'pixel';
  raw_value: number | null;
  raw_unit: string | null;
  scaled_value: number | null;
  scaled_unit: string | null;
  confidence: number;
  status: 'candidate' | 'needs_review' | 'accepted' | 'rejected';
  review_reason: string | null;
  authority: 'measurement_candidate';
  final_quantity: false;
}

async function postRunTool<T>(runId: string, tool: string, body: unknown): Promise<T> {
  const res = await fetch(
    `/api/document-intelligence/drawings/dem/${encodeURIComponent(runId)}/tools/${tool}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(`Drawing tool ${tool} failed (status ${res.status})`);
  return res.json();
}

export function runOneClickArea(
  runId: string,
  pageIndex: number,
  positivePoints: [number, number][],
  negativePoints: [number, number][] = [],
): Promise<InteractiveMeasurementCandidate> {
  return postRunTool(runId, 'one-click-area', {
    page_index: pageIndex,
    positive_points: positivePoints,
    negative_points: negativePoints,
  });
}

export function runOneClickLine(
  runId: string,
  pageIndex: number,
  point: [number, number],
): Promise<InteractiveMeasurementCandidate> {
  return postRunTool(runId, 'one-click-line', { page_index: pageIndex, point });
}

export interface FindSimilarCandidateResponse {
  page_index: number;
  threshold: number;
  count_semantics: 'candidate_detection_not_verified_physical_count';
  candidates: Array<Record<string, unknown>>;
}

export function runFindSimilar(
  runId: string,
  pageIndex: number,
  positiveBboxes: Array<{ x0: number; y0: number; x1: number; y1: number; space: 'normalized' }>,
  negativeBboxes: Array<{ x0: number; y0: number; x1: number; y1: number; space: 'normalized' }> = [],
  threshold = 0.78,
): Promise<FindSimilarCandidateResponse> {
  return postRunTool(runId, 'find-similar', {
    page_index: pageIndex,
    positive_bboxes: positiveBboxes,
    negative_bboxes: negativeBboxes,
    threshold,
  });
}
