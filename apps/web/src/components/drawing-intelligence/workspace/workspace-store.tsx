'use client';

/**
 * Store pusat Drawing Intelligence Workspace — React context + reducer.
 * Menyimpan seluruh state UI (mode, seleksi, canvas, dock, upload, analysis,
 * handoff). Tidak ada perhitungan teknik di sini: angka kuantitas selalu
 * berasal dari data (mock/engine) — reducer hanya memindah status & seleksi.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  AnalysisConfig,
  AnalysisLogEntry,
  AnalysisStage,
  AskPaaxMessage,
  DetectedElement,
  DrawingFile,
  ElementCategory,
  QuantityItem,
  ReviewQueueItem,
  Sheet,
  UploadEntry,
  VerificationStatus,
  WorkspaceMode,
  ActivityEntry,
} from './di-types';
import {
  ANALYSIS_LOG_SCRIPT,
  ANALYSIS_STAGES,
  MOCK_ACTIVITY,
  MOCK_ELEMENTS,
  MOCK_FILE,
  MOCK_QUANTITY_ITEMS,
  MOCK_REVIEW_QUEUE,
  MOCK_SHEETS,
} from './di-mock-data';
import {
  retrieveProjectGraph,
  startDemUpload,
  fetchDemRunStatus,
  fetchProjectDemSheets,
  fetchProjectDemRuns,
} from '../drawing-intelligence-api';
import type { ProjectGraphSummaryView, QuantityReadinessItem } from '@paax/schemas';
import type { MappedProjectSheet } from './sheet-mapping';
import { canUseWorkspaceMocks, resolveWorkspaceEnvironmentMode } from './environment';
import { mapProjectDemSheet } from './sheet-mapping';
import type { HonestWorkspaceState } from './quantity-authority';

// ── Tipe state ───────────────────────────────────────────────────────────────

export type CanvasTool =
  | 'select'
  | 'pan'
  | 'measure'
  | 'markup'
  | 'takeoff'
  | 'calibrate';

export type NavigatorTab = 'sheets' | 'classification';
export type InspectorTab = 'sheet' | 'detection' | 'properties' | 'verification' | 'ai-notes';
export type DockTab = 'detected' | 'quantities' | 'review-queue' | 'assumptions' | 'activity';
export type GalleryView = 'grid' | 'list';
export type GalleryGroupBy = 'floor' | 'discipline' | 'drawing-type' | 'file';

export interface CanvasViewState {
  zoom: number; // 1 = fit-ish baseline; UI menampilkan %
  panX: number;
  panY: number;
  tool: CanvasTool;
}

export interface WorkspaceState {
  mode: WorkspaceMode;
  projectId: string | null;
  activeSnapshotId: string | null;
  /** true bila belum ada file (empty state — gambar referensi 2) */
  hasData: boolean;

  files: DrawingFile[];
  sheets: Sheet[];
  /** DEM metadata real-only; unknown fields remain null until backend supplies them. */
  mappedSheets: MappedProjectSheet[];
  elements: DetectedElement[];
  quantities: QuantityItem[];
  reviewQueue: ReviewQueueItem[];
  activity: ActivityEntry[];

  activeSheetId: string | null;
  selectedSheetIds: string[];
  selectedElementId: string | null;
  hoveredElementId: string | null;
  selectedQuantityId: string | null;

  navigator: {
    collapsed: boolean;
    tab: NavigatorTab;
    search: string;
    disciplineFilter: string | null;
    expandedFloors: string[];
  };
  inspector: { collapsed: boolean; tab: InspectorTab };
  dock: { expanded: boolean; tab: DockTab; heightPct: number };
  gallery: { view: GalleryView; groupBy: GalleryGroupBy; search: string; showTitles: boolean };
  canvas: CanvasViewState;
  overlays: Record<string, boolean>; // per ElementCategory

  upload: {
    modalOpen: boolean;
    entries: UploadEntry[];
    running: boolean;
  };

  analysis: {
    setupOpen: boolean;
    running: boolean;
    complete: boolean;
    stages: AnalysisStage[];
    log: AnalysisLogEntry[];
    progress: number; // 0..100 progres UI simulasi
    currentMessage: string;
    config: AnalysisConfig;
  };

  handoff: {
    confirmOpen: boolean;
    sent: boolean;
    proposalId?: string | null;
    sentAt?: string | null;
    reviewPanelOpen: boolean;
    proposalItems?: any[] | null;
  };
  askPaax: { open: boolean; messages: AskPaaxMessage[]; busy: boolean };
  statusMessage: string;

  /** koneksi backend nyata (diisi integrasi; UI tetap berfungsi tanpa ini) */
  backendConnected: boolean;
  backendSyncFailed: boolean;
  backendSyncError: 'failed' | 'not-ready' | null;

  summaryViews: ProjectGraphSummaryView[];
  honestState: HonestWorkspaceState;
}

const DEFAULT_OVERLAYS: Record<string, boolean> = {
  column: true,
  beam: true,
  slab: true,
  'shear-wall': true,
  wall: true,
  stair: true,
  room: true,
  'grid-axis': true,
  dimension: true,
  door: false,
  window: false,
  'mep-point': false,
};

import { makeGeometry } from './di-mock-data';

function getFloorInfo(code: string, title: string) {
  const combined = `${code} ${title}`.toLowerCase();
  if (combined.includes('ground') || combined.includes('floor 0') || combined.includes('floorplan 0') || combined.includes('a2-100')) {
    return { floorId: 'F00', floorLabel: 'Ground Floor' };
  } else if (combined.includes('first') || combined.includes('floor 1') || combined.includes('a2-101')) {
    return { floorId: 'F01', floorLabel: 'Floor 1' };
  } else if (combined.includes('second') || combined.includes('floor 2') || combined.includes('a2-102')) {
    return { floorId: 'F02', floorLabel: 'Floor 2' };
  } else if (combined.includes('third') || combined.includes('floor 3') || combined.includes('a2-103')) {
    return { floorId: 'F03', floorLabel: 'Floor 3' };
  } else if (combined.includes('fourth') || combined.includes('floor 4') || combined.includes('a2-104')) {
    return { floorId: 'F04', floorLabel: 'Floor 4' };
  } else if (combined.includes('roof') || combined.includes('a2-105')) {
    return { floorId: 'ROOF', floorLabel: 'Roof Plan' };
  }
  return { floorId: 'F02', floorLabel: 'Floor 2' };
}

function mapDemSheetToSheet(item: any): Sheet {
  const match = item.sheet_title ? item.sheet_title.match(/^([A-Za-z0-9\-]+)\s*[-–]\s*(.*)$/) : null;
  const code = match ? match[1].trim() : (item.sheet_title ? 'A2-' + (100 + item.page_index) : 'A2-' + (100 + item.page_index));
  const title = match ? match[2].trim() : (item.sheet_title || `Page ${item.page_index + 1}`);
  const floorInfo = getFloorInfo(code, title);
  const isRoof = title.toLowerCase().includes('roof');
  
  return {
    id: `${item.run_id}-page-${item.page_index}`,
    fileId: item.run_id,
    code,
    title,
    originalPageName: item.file_name,
    pageNumber: item.page_index + 1,
    floorId: floorInfo.floorId,
    floorLabel: floorInfo.floorLabel,
    disciplines: isRoof ? ['STR', 'ARC', 'MEP'] : ['STR', 'ARC', 'MEP', 'CIV'],
    drawingType: isRoof ? 'Roof Plan' : 'Floor Plan',
    scale: null,        // WP5: backend tidak mengembalikan scale — tampilkan null, jangan hardcode '1:100'
    scaleConfirmed: false,
    revision: null,     // WP5: backend tidak mengembalikan revision — tampilkan null, jangan hardcode 'R1'
    status: item.status === 'complete' ? 'analyzed' : 'queued',
    reviewIssueCount: 0,
    sheetSize: 'A1 (841 x 594 mm)',
    analyzedOn: '2026-07-17',
    aiConfidence: null, // WP5: confidence dihitung backend — tampilkan null saat belum tersedia
    geometry: makeGeometry(item.page_index, isRoof),
  };
}

function mapDemRunToDrawingFile(run: any): DrawingFile {
  let status: DrawingFile['status'] = 'processing';
  if (run.status === 'created') status = 'uploading';
  else if (run.status === 'dem_complete' || run.status === 'synthesis_complete') status = 'completed';
  else if (run.status === 'failed' || run.status === 'synthesis_failed') status = 'failed';
  else if (run.status === 'partially_failed') status = 'partially_failed';

  return {
    id: run.id,
    name: run.file_name,
    sizeBytes: 2.4 * 1024 * 1024,
    kind: (run.file_name.split('.').pop()?.toUpperCase() as any) || 'PDF',
    status,
    sheetCount: run.total_pages,
    uploadedAt: run.created_at,
  };
}

const DEFAULT_CONFIG: AnalysisConfig = {
  scope: 'superstructure',
  mode: 'balanced',
  outputs: {
    classifySheets: true,
    detectItems: true,
    extractQuantities: true,
    buildFloorGrouping: true,
  },
  flagLowConfidence: true,
  requireReviewerApproval: true,
  autoAssignReviewers: false,
  confidenceThreshold: 80,
};

export function initialWorkspaceState(withData: boolean): WorkspaceState {
  const useMocks = withData && canUseWorkspaceMocks(resolveWorkspaceEnvironmentMode());
  return {
    mode: useMocks ? 'review' : 'files',
    projectId: null,
    activeSnapshotId: null,
    hasData: useMocks,
    files: useMocks ? [MOCK_FILE] : [],
    sheets: useMocks ? MOCK_SHEETS : [],
    mappedSheets: [],
    elements: useMocks ? MOCK_ELEMENTS : [],
    quantities: useMocks ? MOCK_QUANTITY_ITEMS : [],
    reviewQueue: useMocks ? MOCK_REVIEW_QUEUE : [],
    activity: useMocks ? MOCK_ACTIVITY : [],
    activeSheetId: useMocks ? 'sheet-f02' : null,
    selectedSheetIds: useMocks ? ['sheet-f02'] : [],
    selectedElementId: null,
    hoveredElementId: null,
    selectedQuantityId: null,
    navigator: {
      collapsed: false,
      tab: 'sheets',
      search: '',
      disciplineFilter: null,
      expandedFloors: useMocks ? ['F02'] : [],
    },
    inspector: { collapsed: false, tab: 'sheet' },
    dock: { expanded: useMocks, tab: 'quantities', heightPct: 32 },
    gallery: { view: 'grid', groupBy: 'floor', search: '', showTitles: true },
    canvas: { zoom: 0.67, panX: 0, panY: 0, tool: 'select' },
    overlays: { ...DEFAULT_OVERLAYS },
    upload: { modalOpen: false, entries: [], running: false },
    analysis: {
      setupOpen: false,
      running: false,
      complete: useMocks,
      stages: ANALYSIS_STAGES.map((s) => ({ ...s, status: useMocks ? 'done' : 'pending' })),
      log: [],
      progress: useMocks ? 100 : 0,
      currentMessage: '',
      config: { ...DEFAULT_CONFIG },
    },
    handoff: { confirmOpen: false, sent: false, proposalId: null, sentAt: null, reviewPanelOpen: false, proposalItems: null },
    askPaax: { open: false, messages: [], busy: false },
    statusMessage: useMocks ? 'Review workspace ready' : 'Waiting for drawing files',
    backendConnected: false,
    backendSyncFailed: false,
    backendSyncError: null,
    honestState: useMocks ? 'ready' : 'extraction-pending',
    summaryViews: [],
  };
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type WorkspaceAction =
  | { type: 'set-mode'; mode: WorkspaceMode }
  | { type: 'set-status'; message: string }
  | { type: 'navigator'; patch: Partial<WorkspaceState['navigator']> }
  | { type: 'inspector'; patch: Partial<WorkspaceState['inspector']> }
  | { type: 'dock'; patch: Partial<WorkspaceState['dock']> }
  | { type: 'gallery'; patch: Partial<WorkspaceState['gallery']> }
  | { type: 'canvas'; patch: Partial<CanvasViewState> }
  | { type: 'toggle-overlay'; category: string }
  | { type: 'set-overlays'; overlays: Record<string, boolean> }
  | { type: 'set-active-sheet'; sheetId: string | null }
  | { type: 'toggle-sheet-selection'; sheetId: string }
  | { type: 'set-sheet-selection'; sheetIds: string[] }
  | { type: 'select-element'; elementId: string | null }
  | { type: 'hover-element'; elementId: string | null }
  | { type: 'select-quantity'; quantityId: string | null }
  | { type: 'set-element-verification'; elementId: string; status: VerificationStatus; note?: string }
  | { type: 'set-quantity-status'; quantityId: string; status: QuantityItem['status']; note?: string }
  | { type: 'resolve-review-item'; itemId: string }
  | { type: 'push-activity'; entry: ActivityEntry }
  | { type: 'upload'; patch: Partial<WorkspaceState['upload']> }
  | { type: 'upload-entries'; entries: UploadEntry[] }
  | { type: 'load-mock-data' }
  | { type: 'analysis'; patch: Partial<WorkspaceState['analysis']> }
  | { type: 'analysis-config'; patch: Partial<AnalysisConfig> }
  | { type: 'analysis-outputs'; patch: Partial<AnalysisConfig['outputs']> }
  | { type: 'handoff'; patch: Partial<WorkspaceState['handoff']> }
  | { type: 'ask-paax'; patch: Partial<WorkspaceState['askPaax']> }
  | { type: 'ask-paax-push'; message: AskPaaxMessage }
  | { type: 'backend-connected'; connected: boolean }
  | { type: 'backend-sync-failed'; error: 'failed' | 'not-ready' | null }
  | { type: 'clear-project-data' }
  | { type: 'replace-quantities'; quantities: QuantityItem[] }
  | { type: 'replace-review-queue'; items: ReviewQueueItem[] }
  | { type: 'replace-summary-views'; summaryViews: ProjectGraphSummaryView[] }
  | { type: 'replace-elements'; elements: DetectedElement[] }
  | { type: 'replace-mapped-sheets'; sheets: MappedProjectSheet[] }
  | { type: 'replace-sheets'; sheets: Sheet[] }
  | { type: 'replace-files'; files: DrawingFile[] }
  | { type: 'set-active-snapshot-id'; snapshotId: string | null }
  | { type: 'set-project-id'; projectId: string | null }
  | { type: 'set-honest-state'; state: HonestWorkspaceState };

function reducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'set-mode': {
      const statusByMode: Record<WorkspaceMode, string> = {
        files: state.hasData ? 'Files ready' : 'Waiting for drawing files',
        sheets: 'Sheet manager',
        analyze: 'Analysis setup',
        review: 'Review workspace ready',
        quantities: 'Extraction results ready',
        handoff: 'Ready for handoff',
      };
      return {
        ...state,
        mode: action.mode,
        statusMessage: statusByMode[action.mode],
        analysis: { ...state.analysis, setupOpen: action.mode === 'analyze' ? true : state.analysis.setupOpen },
      };
    }
    case 'set-status':
      return { ...state, statusMessage: action.message };
    case 'set-honest-state':
      return { ...state, honestState: action.state };
    case 'navigator':
      return { ...state, navigator: { ...state.navigator, ...action.patch } };
    case 'inspector':
      return { ...state, inspector: { ...state.inspector, ...action.patch } };
    case 'dock':
      return { ...state, dock: { ...state.dock, ...action.patch } };
    case 'gallery':
      return { ...state, gallery: { ...state.gallery, ...action.patch } };
    case 'canvas':
      return { ...state, canvas: { ...state.canvas, ...action.patch } };
    case 'toggle-overlay':
      return {
        ...state,
        overlays: { ...state.overlays, [action.category]: !state.overlays[action.category] },
      };
    case 'set-overlays':
      return { ...state, overlays: action.overlays };
    case 'set-active-sheet':
      return {
        ...state,
        activeSheetId: action.sheetId,
        selectedElementId: null,
        canvas: { ...state.canvas, panX: 0, panY: 0 },
      };
    case 'toggle-sheet-selection': {
      const has = state.selectedSheetIds.includes(action.sheetId);
      return {
        ...state,
        selectedSheetIds: has
          ? state.selectedSheetIds.filter((id) => id !== action.sheetId)
          : [...state.selectedSheetIds, action.sheetId],
      };
    }
    case 'set-sheet-selection':
      return { ...state, selectedSheetIds: action.sheetIds };
    case 'select-element':
      return {
        ...state,
        selectedElementId: action.elementId,
        inspector: action.elementId
          ? { ...state.inspector, collapsed: false, tab: 'properties' }
          : state.inspector,
      };
    case 'hover-element':
      return { ...state, hoveredElementId: action.elementId };
    case 'select-quantity': {
      const qty = state.quantities.find((q) => q.id === action.quantityId) ?? null;
      return {
        ...state,
        selectedQuantityId: action.quantityId,
        // sinkron: klik baris → sorot geometri sumber (blueprint §16.2)
        activeSheetId: qty?.sourceSheetId ?? state.activeSheetId,
        selectedElementId: qty?.linkedElementIds[0] ?? state.selectedElementId,
      };
    }
    case 'set-element-verification': {
      const elements = state.elements.map((e) =>
        e.id === action.elementId
          ? { ...e, verification: action.status, reviewerNote: action.note ?? e.reviewerNote }
          : e,
      );
      return { ...state, elements };
    }
    case 'set-quantity-status': {
      const quantities = state.quantities.map((q) =>
        q.id === action.quantityId
          ? { ...q, status: action.status, reviewerNote: action.note ?? q.reviewerNote }
          : q,
      );
      return { ...state, quantities };
    }
    case 'resolve-review-item':
      return {
        ...state,
        reviewQueue: state.reviewQueue.map((r) => (r.id === action.itemId ? { ...r, resolved: true } : r)),
      };
    case 'push-activity':
      return { ...state, activity: [action.entry, ...state.activity].slice(0, 40) };
    case 'upload':
      return { ...state, upload: { ...state.upload, ...action.patch } };
    case 'upload-entries':
      return { ...state, upload: { ...state.upload, entries: action.entries } };
    case 'load-mock-data': {
      if (!canUseWorkspaceMocks(resolveWorkspaceEnvironmentMode())) {
        return {
          ...state,
          statusMessage: 'Mock data is disabled in production. Connect a project backend to load drawings.',
          upload: { ...state.upload, running: false },
        };
      }
      const loaded = initialWorkspaceState(true);
      return {
        ...loaded,
        mode: 'sheets',
        statusMessage: 'Upload complete. 6 sheets are ready for classification and analysis.',
        upload: { modalOpen: false, entries: state.upload.entries, running: false },
        backendConnected: state.backendConnected,
      };
    }
    case 'analysis':
      return { ...state, analysis: { ...state.analysis, ...action.patch } };
    case 'analysis-config':
      return {
        ...state,
        analysis: { ...state.analysis, config: { ...state.analysis.config, ...action.patch } },
      };
    case 'analysis-outputs':
      return {
        ...state,
        analysis: {
          ...state.analysis,
          config: {
            ...state.analysis.config,
            outputs: { ...state.analysis.config.outputs, ...action.patch },
          },
        },
      };
    case 'handoff':
      return { ...state, handoff: { ...state.handoff, ...action.patch } };
    case 'ask-paax':
      return { ...state, askPaax: { ...state.askPaax, ...action.patch } };
    case 'ask-paax-push':
      return {
        ...state,
        askPaax: { ...state.askPaax, messages: [...state.askPaax.messages, action.message] },
      };
    case 'backend-connected':
      return {
        ...state,
        backendConnected: action.connected,
        backendSyncFailed: action.connected ? false : state.backendSyncFailed,
        backendSyncError: action.connected ? null : state.backendSyncError,
      };
    case 'backend-sync-failed':
      return {
        ...state,
        hasData: false,
        files: [],
        sheets: [],
        mappedSheets: [],
        elements: [],
        quantities: [],
        reviewQueue: [],
        activity: [],
        activeSheetId: null,
        selectedSheetIds: [],
        selectedElementId: null,
        hoveredElementId: null,
        selectedQuantityId: null,
        backendConnected: false,
        backendSyncFailed: true,
        backendSyncError: action.error,
        honestState: action.error === 'not-ready' ? 'graph-not-ready' : 'evidence-incomplete',
        statusMessage: action.error === 'not-ready'
          ? 'Project graph is empty. Please upload drawing files.'
          : 'Failed to connect to backend services.',
        mode: 'files',
      };
    case 'clear-project-data':
      return {
        ...state,
        hasData: false,
        files: [],
        sheets: [],
        mappedSheets: [],
        elements: [],
        quantities: [],
        reviewQueue: [],
        activity: [],
        activeSheetId: null,
        selectedSheetIds: [],
        selectedElementId: null,
        hoveredElementId: null,
        selectedQuantityId: null,
        backendSyncFailed: false,
        backendSyncError: null,
        honestState: 'extraction-pending',
        mode: 'files',
      };
    case 'replace-quantities':
      return {
        ...state,
        quantities: action.quantities,
        honestState: action.quantities.some((item) => item.sourceAuthority === 'none' || !item.sourceAuthority)
          ? 'quantity-blocked'
          : 'ready',
      };
    case 'replace-review-queue':
      return { ...state, reviewQueue: action.items };
    case 'replace-summary-views':
      return { ...state, summaryViews: action.summaryViews };
    case 'replace-elements':
      return { ...state, elements: action.elements };
    case 'replace-mapped-sheets':
      return {
        ...state,
        mappedSheets: action.sheets,
        activeSheetId: state.activeSheetId ?? action.sheets[0]?.id ?? null,
        selectedSheetIds: state.selectedSheetIds.length ? state.selectedSheetIds : (action.sheets[0] ? [action.sheets[0].id] : []),
      };
    case 'replace-sheets': {
      const activeSheetId = state.activeSheetId || (action.sheets.length > 0 ? action.sheets[0].id : null);
      const selectedSheetIds = state.selectedSheetIds.length > 0 ? state.selectedSheetIds : (activeSheetId ? [activeSheetId] : []);
      return {
        ...state,
        sheets: action.sheets,
        hasData: action.sheets.length > 0,
        activeSheetId,
        selectedSheetIds,
      };
    }
    case 'replace-files':
      return { ...state, files: action.files };
    case 'set-active-snapshot-id':
      return { ...state, activeSnapshotId: action.snapshotId };
    case 'set-project-id':
      return { ...state, projectId: action.projectId };
    default:
      return state;
  }
}

// ── Context ─────────────────────────────────────────────────────────────────

interface WorkspaceContextValue {
  state: WorkspaceState;
  dispatch: (action: WorkspaceAction) => void;
  /** Simulasi upload per-file (dummy) → selesai → load mock sheets. */
  startUploadSimulation: (files: { file?: File; name: string; sizeBytes: number; kind: UploadEntry['kind'] }[]) => void;
  /** Simulasi progres analisis (stepper §13) → selesai → mode review. */
  startAnalysis: () => void;
  /** Kirim pertanyaan Ask PAAX — memanggil retrieveProjectGraph backend nyata. */
  askPaax: (question: string) => void;
  triggerProjectSynthesis: (runId: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

const UPLOAD_PHASES: { label: string; at: number }[] = [
  { label: 'Uploading', at: 0 },
  { label: 'Validating', at: 55 },
  { label: 'Generating previews', at: 75 },
  { label: 'Completed', at: 100 },
];

export function WorkspaceProvider({
  children,
  withMockData = true,
  projectId = null,
}: {
  children: ReactNode;
  withMockData?: boolean;
  /** id proyek nyata — dipakai oleh askPaax untuk memanggil backend retrieve */
  projectId?: string | null;
}) {
  const [state, dispatch] = useReducer(reducer, withMockData, initialWorkspaceState);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearInterval);
  }, []);

  useEffect(() => {
    dispatch({ type: 'set-project-id', projectId });
  }, [projectId]);

  const startUploadSimulation = useCallback(
    (files: { file?: File; name: string; sizeBytes: number; kind: UploadEntry['kind'] }[]) => {
      if (files.length === 0) return;
      const entries: UploadEntry[] = files.map((f, i) => ({
        id: `up-${Date.now()}-${i}`,
        fileName: f.name,
        sizeBytes: f.sizeBytes,
        kind: f.kind,
        progress: 0,
        status: 'uploading',
        statusLabel: 'Queued',
      }));
      dispatch({ type: 'upload', patch: { entries, running: true } });
      dispatch({ type: 'set-status', message: `Uploading ${entries.length} files` });

      const hasRealFiles = files.some(f => f.file !== undefined);

      if (hasRealFiles && projectId) {
        let completedUploads = 0;
        files.forEach(async (f, i) => {
          if (!f.file) return;
          const entryId = entries[i].id;
          
          const updateEntryStatus = (prog: number, status: UploadEntry['status'], label: string, runId?: string) => {
            dispatch({
              type: 'upload-entries',
              entries: entries.map(e => e.id === entryId ? { ...e, progress: prog, status, statusLabel: label, runId } : e)
            });
          };

          try {
            updateEntryStatus(10, 'uploading', 'Uploading file...');
            const uploadRes = await startDemUpload(projectId, f.file);
            const runId = uploadRes.run_id;
            
            updateEntryStatus(30, 'uploading', 'Processing DEM extraction...', runId);
            
            const poll = setInterval(async () => {
              try {
                const statusData = await fetchDemRunStatus(runId);
                const totalPages = statusData.total_pages;
                const pages = statusData.pages || [];
                const completedCount = pages.filter((p: any) => p.status === 'complete' || p.status === 'failed').length;
                
                const extractionProgress = totalPages > 0 ? Math.round((completedCount / totalPages) * 70) : 0;
                const currentProgress = 30 + extractionProgress;
                
                const statusStr = statusData.status === 'dem_complete' || statusData.status === 'partially_failed' ? 'completed' : 'uploading';
                const labelStr = statusData.status === 'dem_complete' || statusData.status === 'partially_failed'
                  ? 'Extraction completed'
                  : `Extracting pages (${completedCount}/${totalPages})`;

                updateEntryStatus(
                  currentProgress >= 100 ? 99 : currentProgress, // hold at 99 until fully complete
                  statusStr,
                  labelStr,
                  runId
                );
                
                if (statusData.status === 'dem_complete' || statusData.status === 'partially_failed' || completedCount === totalPages) {
                  clearInterval(poll);
                  completedUploads += 1;
                  
                  updateEntryStatus(100, 'completed', statusData.status === 'dem_complete' ? 'Extraction completed' : 'Partially failed', runId);

                  if (completedUploads === files.length) {
                    dispatch({ type: 'upload', patch: { running: false } });
                    dispatch({
                      type: 'push-activity',
                      entry: { time: 'Now', message: `${files.length} file(s) extraction complete.`, kind: 'upload' },
                    });
                    
                    try {
                      const sheetsData = await fetchProjectDemSheets(projectId);
                      dispatch({ type: 'replace-mapped-sheets', sheets: sheetsData.map(mapProjectDemSheet) });
                      
                      const runsData = await fetchProjectDemRuns(projectId);
                      const mappedFiles = runsData.map(mapDemRunToDrawingFile);
                      dispatch({ type: 'replace-files', files: mappedFiles });
                    } catch (e) {
                      console.error("Gagal refresh data setelah upload:", e);
                    }
                  }
                }
              } catch (err) {
                clearInterval(poll);
                updateEntryStatus(100, 'failed' as any, 'Failed to check status');
              }
            }, 2000);
            timers.current.push(poll);
            
          } catch (err: any) {
            console.error("Gagal upload file:", err);
            updateEntryStatus(100, 'failed' as any, err?.message || 'Upload failed');
            dispatch({ type: 'upload', patch: { running: false } });
          }
        });
      } else {
        // --- SIMULASI ---
        let tick = 0;
        const interval = setInterval(() => {
          tick += 1;
          let allDone = true;
          const next = entries.map((e, i) => {
            const progress = Math.min(100, Math.max(0, tick * 7 - i * 12));
            const phase = [...UPLOAD_PHASES].reverse().find((p) => progress >= p.at)!;
            if (progress < 100) allDone = false;
            return {
              ...e,
              progress,
              status: (progress >= 100 ? 'completed' : 'uploading') as UploadEntry['status'],
              statusLabel: progress <= 0 ? 'Queued' : phase.label,
            };
          });
          dispatch({ type: 'upload-entries', entries: next });
          if (allDone) {
            clearInterval(interval);
            dispatch({ type: 'upload', patch: { running: false } });
            dispatch({ type: 'load-mock-data' });
            dispatch({
              type: 'push-activity',
              entry: { time: 'Now', message: `${entries.length} file(s) uploaded — 6 sheets prepared`, kind: 'upload' },
            });
          }
        }, 220);
        timers.current.push(interval);
      }
    },
    [projectId, dispatch]
  );



  const askPaax = useCallback(
    (question: string) => {
      dispatch({ type: 'ask-paax-push', message: { role: 'user', text: question } });
      dispatch({ type: 'ask-paax', patch: { busy: true } });

      if (!projectId) {
        // Tidak ada projectId → tidak bisa panggil backend, sampaikan jujur
        dispatch({
          type: 'ask-paax-push',
          message: {
            role: 'assistant',
            text: 'Tidak ada proyek aktif yang dipilih. Silakan pilih proyek terlebih dahulu agar PAAX bisa menjawab pertanyaan berdasarkan data gambar proyek Anda.',
          },
        });
        dispatch({ type: 'ask-paax', patch: { busy: false } });
        return;
      }

      retrieveProjectGraph(projectId, question)
        .then((resp) => {
          const refs: AskPaaxMessage['refs'] = [];

          // Bangun refs dari evidence yang dikembalikan backend (sitasi per klaim)
          const evidenceList = resp.evidence ?? [];
          for (const ev of evidenceList) {
            const sheetId = (ev as Record<string, unknown>)['sheet_id'] as string | undefined;
            const page = (ev as Record<string, unknown>)['page'] as number | string | undefined;
            const label =
              (ev as Record<string, unknown>)['label'] as string |
              undefined ??
              (sheetId ? `Sheet ${sheetId}${page != null ? `, hal. ${page}` : ''}` : undefined);
            if (label) {
              refs.push({ label, sheetId: sheetId ?? undefined });
            }
          }

          let text: string;

          // ── Kasus khusus data_status ─────────────────────────────────────
          if (resp.data_status === 'calculation_required') {
            // Aturan Emas: JANGAN menghitung di frontend — teruskan guidance backend
            const guidanceText = resp.guidance
              ? `\n\nPanduan: ${resp.guidance}`
              : '';
            const notesText = resp.notes?.length
              ? `\n\nCatatan: ${resp.notes.join('; ')}`
              : '';
            text =
              `Pertanyaan ini memerlukan kalkulasi yang hanya bisa dilakukan oleh Core Engine PAAX — ` +
              `bukan di sini (Aturan Emas: AI tidak pernah menghitung angka final).` +
              guidanceText +
              notesText +
              `\n\nUntuk mendapatkan angka ini, silakan buka tab RAB di halaman proyek dan jalankan perhitungan melalui Core Engine.`;

          } else if (
            resp.data_status === 'unknown_level' ||
            resp.data_status === 'not_ready' ||
            (resp.data_status === 'empty' && (!resp.nodes || resp.nodes.length === 0))
          ) {
            // Tidak ditemukan / belum siap — jangan menebak
            const notesText = resp.notes?.length
              ? ` Catatan dari sistem: ${resp.notes.join('; ')}.`
              : '';
            text =
              `Data tidak ditemukan untuk pertanyaan ini dalam graf proyek yang aktif.${notesText}` +
              ` Pastikan gambar kerja sudah diunggah dan proses ekstraksi (DEM → PCKM) sudah selesai.`;

          } else if (!resp.nodes || resp.nodes.length === 0) {
            // Nodes kosong tapi status bukan salah satu di atas
            const notesText = resp.notes?.length
              ? ` ${resp.notes.join(' ')}`
              : '';
            text = `Tidak ditemukan data yang relevan untuk pertanyaan ini dalam graf proyek.${notesText}`;

          } else {
            // ── Kasus normal: ada nodes, buat ringkasan bersitasi ───────────
            const nodeCount = resp.nodes.length;
            const nodeNames = resp.nodes
              .slice(0, 5)
              .map((n) => {
                const node = n as Record<string, unknown>;
                return (
                  (node['canonical_name'] as string | undefined) ??
                  (node['name'] as string | undefined) ??
                  (node['id'] as string | undefined) ??
                  'elemen'
                );
              })
              .filter(Boolean)
              .join(', ');
            const moreSuffix = nodeCount > 5 ? ` (dan ${nodeCount - 5} lainnya)` : '';

            const citationText = refs.length > 0
              ? ` [Sumber: ${refs.map((r) => r.label).join(', ')}]`
              : '';

            const notesText = resp.notes?.length
              ? `\n\nCatatan tambahan: ${resp.notes.join('; ')}`
              : '';

            const guidanceText = resp.guidance
              ? `\n\n${resp.guidance}`
              : '';

            text =
              `Ditemukan ${nodeCount} elemen yang relevan: ${nodeNames}${moreSuffix}.${citationText}` +
              notesText +
              guidanceText;
          }

          dispatch({ type: 'ask-paax-push', message: { role: 'assistant', text, refs } });
          dispatch({ type: 'ask-paax', patch: { busy: false } });
        })
        .catch((err: unknown) => {
          const message =
            err instanceof Error ? err.message : 'Terjadi kesalahan tidak diketahui';
          dispatch({
            type: 'ask-paax-push',
            message: {
              role: 'assistant',
              text: `Gagal mengambil jawaban dari backend PAAX: ${message}. Coba lagi dalam beberapa saat.`,
            },
          });
          dispatch({ type: 'ask-paax', patch: { busy: false } });
        });
    },
    [projectId],
  );

  const triggerProjectSynthesis = useCallback(
    async (runId: string) => {
      dispatch({
        type: 'analysis',
        patch: {
          running: true,
          complete: false,
          progress: 0,
          currentMessage: 'Starting PCKM synthesis...',
        },
      });

      try {
        const { triggerSynthesis, fetchDemRunStatus, fetchReviewQueue, fetchQuantityReadiness, fetchProjectDemSheets, fetchProjectDemRuns } = await import('../drawing-intelligence-api');
        await triggerSynthesis(runId);
        dispatch({ type: 'set-status', message: 'Synthesis triggered' });

        const poll = setInterval(async () => {
          try {
            const statusData = await fetchDemRunStatus(runId);
            const synStatus = statusData.synthesis_status || 'pending';

            if (synStatus === 'synthesis_in_progress') {
              dispatch({
                type: 'analysis',
                patch: {
                  progress: 50,
                  currentMessage: 'PCKM synthesis in progress...',
                },
              });
              dispatch({ type: 'set-status', message: 'PCKM synthesis in progress...' });
            } else if (synStatus === 'synthesis_complete') {
              clearInterval(poll);
              dispatch({
                type: 'analysis',
                patch: {
                  running: false,
                  complete: true,
                  progress: 100,
                  currentMessage: 'Synthesis completed successfully',
                  stages: ANALYSIS_STAGES.map((s) => ({ ...s, status: 'done' })),
                },
              });
              dispatch({ type: 'set-mode', mode: 'review' });
              dispatch({
                type: 'push-activity',
                entry: { time: 'Now', message: 'Analysis completed — review workspace ready', kind: 'analysis' },
              });
              dispatch({ type: 'set-status', message: 'PCKM synthesis completed successfully' });

              if (projectId) {
                const [queue, readiness, sheetsData, runsData] = await Promise.all([
                  fetchReviewQueue(projectId),
                  fetchQuantityReadiness(projectId),
                  fetchProjectDemSheets(projectId),
                  fetchProjectDemRuns(projectId),
                ]);
                dispatch({ type: 'backend-connected', connected: true });

                const snapshotId = queue.snapshot_id || readiness.snapshot_id || null;
                if (snapshotId) {
                  dispatch({ type: 'set-active-snapshot-id', snapshotId });
                }

                const mappedFiles = runsData.map(mapDemRunToDrawingFile);
                const realMappedSheets = sheetsData.map(mapProjectDemSheet);
                dispatch({ type: 'replace-mapped-sheets', sheets: realMappedSheets });
                if (mappedFiles.length > 0) dispatch({ type: 'replace-files', files: mappedFiles });

                if (queue.items.length > 0) {
                  const CATEGORY_LABELS: Record<string, string> = {
                    conflict: 'Dimension conflict',
                    missing_dimension: 'Missing dimension',
                    ambiguous_level: 'Ambiguous level binding',
                    possibly_same: 'Possible duplicate element',
                    needs_review: 'Needs review',
                  };
                  const findSheetIdForEvidence = (evidenceId: string | null): string | null => {
                    if (!evidenceId) return null;
                    const match = evidenceId.match(/page[-_]index[-_](\d+)|EV[-_](\d+)|page[-_](\d+)/i);
                    if (match) {
                      const pageIndexStr = match[1] || match[2] || match[3];
                      const pageIndex = parseInt(pageIndexStr, 10);
                      const found = realMappedSheets.find((s) => s.id.endsWith(`-page-${pageIndex}`));
                      if (found) return found.id;
                    }
                    return null;
                  };
                  const mappedQueue: ReviewQueueItem[] = queue.items.map((item) => {
                    let sheetId: string | null = null;
                    // target_type can only be 'node' | 'edge' per schema;
                    // always attempt evidence_refs lookup for sheet resolution
                    if (item.evidence_refs && item.evidence_refs.length > 0) {
                      for (const ref of item.evidence_refs) {
                        const sid = findSheetIdForEvidence(ref);
                        if (sid) {
                          sheetId = sid;
                          break;
                        }
                      }
                    }
                    return {
                      id: item.id,
                      title: `${CATEGORY_LABELS[item.category] ?? item.category} — ${item.target_id}`,
                      reason:
                        item.reasons.map((r: any) => r.message).join('; ') ||
                        item.reason_codes.join(', ') ||
                        'Flagged by project graph integrity checks.',
                      severity: item.category === 'conflict' ? 'issue' : 'review',
                      sheetId,
                      elementId: item.target_type === 'node' ? item.target_id : null,
                      resolved: false,
                    };
                  });
                  dispatch({ type: 'replace-review-queue', items: mappedQueue });
                }

                if (readiness.items.length > 0) {
                  const mappedQuantities: any[] = readiness.items.map((item: any) => {
                    const nameLower = item.name.toLowerCase();
                    const isBeam = nameLower.includes('beam') || nameLower.includes('balok');
                    const isSlab = nameLower.includes('slab') || nameLower.includes('plat');
                    const category = isBeam ? 'beam' : isSlab ? 'slab' : 'column';

                    return {
                      id: item.element_type_id,
                      itemCode: item.element_type_id,
                      workItem: item.name,
                      floorId: 'F02',
                      floorLabel: 'Floor 2',
                      lbsPath: ['Building A', 'Floor 2'],
                      wbsSection: '03 30 00 – Superstructure',
                      wbsGroup: 'Superstructure / Floor 2',
                      category,
                      formulaBasis: 'Count',
                      // WP2: occurrence_count = jumlah referensi dalam project graph —
                      // BUKAN kuantitas fisik (pcs/ea). Label "Detected References" agar
                      // tidak disalahartikan sebagai hasil pengukuran teknik.
                      formula: `${item.occurrence_count ?? 0} Detected References`,
                      formulaEvidence: item.reasons.map((r: any) => r.message),
                      unit: 'ref', // bukan satuan fisik — konteks group
                      qty: String(item.occurrence_count ?? 0),
                      status: item.readiness === 'ready' ? 'verified' : item.readiness === 'needs_review' ? 'needs-review' : 'conflict',
                      source: item.reasons?.[0]?.evidence_refs?.[0] || 'Unknown',
                      sourceSheetId: null,
                      linkedElementIds: [],
                      confidence: 90,
                      ahspCandidate: null,
                      reviewerNote: item.reasons.map((r: any) => r.message).join('; '),
                    };
                  });
                  dispatch({ type: 'replace-quantities', quantities: mappedQuantities });
                }
              }
            } else if (synStatus === 'synthesis_failed') {
              clearInterval(poll);
              dispatch({
                type: 'analysis',
                patch: {
                  running: false,
                  complete: false,
                  progress: 100,
                  currentMessage: 'PCKM synthesis failed',
                },
              });
              dispatch({ type: 'set-status', message: 'PCKM synthesis failed' });
            }
          } catch (err) {
            clearInterval(poll);
            dispatch({
              type: 'analysis',
              patch: { running: false, currentMessage: 'Failed to poll synthesis status' },
            });
          }
        }, 2000);
        timers.current.push(poll);
      } catch (err: any) {
        console.error('Gagal memicu sintesis:', err);
        dispatch({
          type: 'analysis',
          patch: { running: false, currentMessage: err?.message || 'Synthesis trigger failed' },
        });
      }
    },
    [projectId, dispatch]
  );
  const startAnalysis = useCallback(() => {
    const runId = state.upload.entries.find(e => e.runId)?.runId;
    if (!runId) {
      dispatch({ type: 'set-status', message: 'No run ID available for synthesis' });
      return;
    }
    dispatch({ type: 'analysis', patch: { setupOpen: false } });
    triggerProjectSynthesis(runId);
  }, [state.upload.entries, dispatch, triggerProjectSynthesis]);


  const value = useMemo(
    () => ({ state, dispatch, startUploadSimulation, startAnalysis, askPaax, triggerProjectSynthesis }),
    [state, startUploadSimulation, startAnalysis, askPaax, triggerProjectSynthesis],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

// ── Selector kecil yang sering dipakai ──────────────────────────────────────

export function useActiveSheet(): Sheet | null {
  const { state } = useWorkspace();
  return state.sheets.find((s) => s.id === state.activeSheetId) ?? null;
}

export function useSelectedElement(): DetectedElement | null {
  const { state } = useWorkspace();
  return state.elements.find((e) => e.id === state.selectedElementId) ?? null;
}

export function categoryCountsForSheet(
  elements: DetectedElement[],
  sheetId: string,
): { category: ElementCategory; count: number }[] {
  const counts = new Map<ElementCategory, number>();
  for (const e of elements) {
    if (e.sheetId !== sheetId) continue;
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  return Array.from(counts, ([category, count]) => ({ category, count }));
}

// ── Data Mappers untuk Sinkronisasi Backend ─────────────────────────────────

export function mapQuantityReadinessToItems(items: any[]): QuantityItem[] {
  return items.map((item: any) => {
    let status: QuantityItem['status'] = 'draft';
    if (item.readiness === 'ready') status = 'verified';
    else if (item.readiness === 'needs_review') status = 'needs-review';
    else if (item.readiness === 'blocked') status = 'conflict';

    let cat: ElementCategory = 'column';
    const n = (item.name || '').toLowerCase();
    if (n.includes('beam')) cat = 'beam';
    else if (n.includes('slab')) cat = 'slab';
    else if (n.includes('wall')) cat = 'wall';
    else if (n.includes('door')) cat = 'door';
    else if (n.includes('window')) cat = 'window';
    else if (n.includes('room')) cat = 'room';
    else if (n.includes('shear')) cat = 'shear-wall';

    return {
      id: item.element_type_id,
      itemCode: item.element_type_id,
      workItem: item.name,
      floorId: 'N/A', // Lossy
      floorLabel: 'Multiple / N/A', // Lossy
      lbsPath: [],
      wbsSection: 'Unknown', // Lossy
      wbsGroup: 'Unknown', // Lossy
      category: cat,
      formulaBasis: 'Count', // Lossy
      // WP2: occurrence_count = jumlah referensi dalam project graph —
      // BUKAN kuantitas fisik. Unit 'ref' agar tidak disalahartikan sebagai
      // satuan teknik (pcs/ea). Jangan teruskan ke RAB tanpa Measurement Fact.
      formula: `${item.occurrence_count ?? 0} Detected References`,
      formulaEvidence: [],
      unit: 'ref', // bukan satuan fisik — konteks group
      qty: String(item.occurrence_count ?? 0),
      status,
      source: 'Project Graph',
      sourceSheetId: null,
      linkedElementIds: [],
      confidence: null,
      ahspCandidate: null,
      reviewerNote: (item.reason_codes || []).join(', ') || null,
      sourceAuthority: 'none',
    };
  });
}

export function mapGraphNodesToElements(nodes: any[], sheetId: string): DetectedElement[] {
  return nodes.map((n: any) => {
    const id = n.id || n.node_id;
    const type = n.type || n.node_type || '';
    const props = n.properties_json || {};
    const bboxStr = props.bbox || '';
    let bbox = { x: 0, y: 0, w: 100, h: 100 };
    if (typeof bboxStr === 'string' && bboxStr.includes(',')) {
      const parts = bboxStr.split(',').map(Number);
      if (parts.length === 4) bbox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
    } else if (typeof props.bbox === 'object' && props.bbox !== null) {
      bbox = { x: props.bbox.x || 0, y: props.bbox.y || 0, w: props.bbox.w || 100, h: props.bbox.h || 100 };
    }
    
    let cat: ElementCategory = 'column';
    const t = type.toLowerCase();
    if (t.includes('beam')) cat = 'beam';
    else if (t.includes('slab')) cat = 'slab';
    else if (t.includes('wall')) cat = 'wall';
    else if (t.includes('door')) cat = 'door';
    else if (t.includes('window')) cat = 'window';
    else if (t.includes('room')) cat = 'room';
    else if (t.includes('shear')) cat = 'shear-wall';

    return {
      id: id,
      sheetId: sheetId,
      code: n.name || id,
      aiId: id,
      category: cat,
      label: n.name || type,
      floorId: props.level_id || 'N/A',
      grid: props.grid_location || null,
      dimensions: props.dimensions || null,
      material: props.material || null,
      bbox: bbox,
      confidence: null, // WP5: confidence tidak ada di node — jangan hardcode 90
      verification: 'detected', // Lossy
      properties: Object.entries(props).map(([k, v]) => ({ label: k, value: String(v), origin: 'extracted' })),
      sourcePages: [],
      aiNotes: []
    };
  });
}

