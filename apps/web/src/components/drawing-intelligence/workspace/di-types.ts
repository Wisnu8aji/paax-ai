/**
 * Drawing Intelligence Workspace — view-model types.
 *
 * Semua angka kuantitas pada tipe ini adalah SALINAN dari engine/mock —
 * frontend tidak pernah menghitung (Aturan Emas, CLAUDE.md §1).
 * State model mengikuti blueprint §27 (sheet & quantity lifecycle).
 */

import type { ElementTypeIndexEntry, ProjectGraphSummaryView } from '@paax/schemas';

// ── Mode workspace (blueprint §4) ────────────────────────────────────────────

export type WorkspaceMode =
  | 'files'
  | 'sheets'
  | 'analyze'
  | 'review'
  | 'quantities'
  | 'handoff';

// ── Klasifikasi ──────────────────────────────────────────────────────────────

export type Discipline = 'STR' | 'ARC' | 'MEP' | 'CIV' | 'OTH';

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  STR: 'Structural',
  ARC: 'Architectural',
  MEP: 'MEP',
  CIV: 'Civil / Site',
  OTH: 'Other',
};

export type DrawingType =
  | 'Cover / Index'
  | 'General Notes'
  | 'Site Plan'
  | 'Floor Plan'
  | 'Foundation Plan'
  | 'Framing Plan'
  | 'Roof Plan'
  | 'Elevation'
  | 'Section'
  | 'Detail'
  | 'Schedule'
  | 'Diagram / Schematic';

// ── File & sheet lifecycle (blueprint §27) ───────────────────────────────────

export type FileStatus =
  | 'local'
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'validating'
  | 'generating-previews'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'partially_failed'
  | 'cancelled';

export type SheetStatus =
  | 'ready'
  | 'needs-classification'
  | 'duplicate-suspected'
  | 'low-quality'
  | 'queued'
  | 'processing'
  | 'analyzed'
  | 'needs-review'
  | 'verified';

export interface DrawingFile {
  id: string;
  name: string;
  sizeBytes: number;
  kind: 'PDF' | 'DWG' | 'DXF' | 'PNG' | 'JPG' | 'TIFF';
  status: FileStatus;
  sheetCount: number;
  uploadedAt?: string;
}

export interface UploadEntry {
  id: string;
  fileName: string;
  sizeBytes: number;
  kind: DrawingFile['kind'];
  progress: number; // 0..100 — status simulasi UI, bukan angka teknik
  status: FileStatus;
  statusLabel: string; // 'Uploading' | 'Validating' | 'Generating previews' | 'Completed' | ...
  runId?: string;
}

// ── Geometri sheet (koordinat gambar dalam mm) ──────────────────────────────

export interface GridLine {
  label: string;
  mm: number;
}

export interface RoomShape {
  code: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** zona pewarnaan overlay ruangan (desaturasi, blueprint §6.2) */
  zone: 'office' | 'meeting' | 'open' | 'service' | 'circulation' | 'pantry' | 'void';
}

export interface SheetGeometry {
  widthMm: number;
  heightMm: number;
  gridX: GridLine[]; // sumbu 1..8
  gridY: GridLine[]; // sumbu A..E
  rooms: RoomShape[];
}

export interface Sheet {
  id: string;
  fileId: string;
  runId?: string;
  pageIndex?: number;
  code: string; // ex: A2-102
  title: string; // ex: Second Floor Plan
  originalPageName: string;
  pageNumber: number;
  floorId: string; // ex: F02
  floorLabel: string; // ex: Floor 2
  disciplines: Discipline[];
  drawingType: DrawingType;
  scale: string | null; // ex: '1:100'
  scaleConfirmed: boolean;
  revision: string | null;
  status: SheetStatus;
  reviewIssueCount: number;
  sheetSize: string; // ex: 'A1 (841 x 594 mm)'
  analyzedOn: string | null;
  aiConfidence: number | null; // 0..100 — dari pipeline, bukan dihitung UI
  geometry: SheetGeometry;
}

// ── Elemen terdeteksi ────────────────────────────────────────────────────────

export type ElementCategory =
  | 'column'
  | 'beam'
  | 'slab'
  | 'shear-wall'
  | 'wall'
  | 'stair'
  | 'door'
  | 'window'
  | 'room'
  | 'grid-axis'
  | 'dimension'
  | 'mep-point';

export const ELEMENT_CATEGORY_LABELS: Record<ElementCategory, string> = {
  column: 'Columns',
  beam: 'Beams',
  slab: 'Slabs',
  'shear-wall': 'Shear Walls',
  wall: 'Walls',
  stair: 'Stairs',
  door: 'Doors',
  window: 'Windows',
  room: 'Rooms',
  'grid-axis': 'Grid axes',
  dimension: 'Dimensions',
  'mep-point': 'MEP points',
};

export type VerificationStatus =
  | 'detected'
  | 'verified'
  | 'needs-review'
  | 'rejected'
  | 'unsupported'
  | 'missing-source';

export interface ElementProperty {
  label: string;
  value: string;
  /** provenance nilai (blueprint §15.3) */
  origin: 'extracted' | 'inferred' | 'user-corrected' | 'inherited';
}

export interface DetectedElement {
  id: string;
  sheetId: string;
  code: string; // ex: K1
  aiId: string; // ex: COL-K1-002
  category: ElementCategory;
  label: string; // ex: 'RC COLUMN 300x600'
  floorId: string;
  grid: string | null; // ex: 'B-3'
  dimensions: string | null; // ex: '300 × 600 mm'
  material: string | null;
  /** bbox dalam koordinat mm sheet */
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number | null; // 0..100 dari pipeline
  verification: VerificationStatus;
  properties: ElementProperty[];
  sourcePages: { sheetCode: string; label: string }[];
  aiNotes: string[];
  reviewerNote?: string;
}

// ── Quantity (blueprint §16) ────────────────────────────────────────────────

export type QuantityRowStatus =
  | 'verified'
  | 'draft'
  | 'needs-review'
  | 'conflict'
  | 'unsupported'
  | 'excluded'
  | 'ai-detected';

export interface QuantityItem {
  id: string;
  itemCode: string; // ex: STR-COL-RC-001
  workItem: string; // ex: Reinforced Concrete Column
  floorId: string;
  floorLabel: string;
  lbsPath: string[]; // Location Breakdown ex: ['Building A','Floor 2','Grid B-3']
  wbsSection: string; // ex: '03 30 00 – Superstructure'
  wbsGroup: string; // ex: 'Superstructure / Floor 2'
  category: ElementCategory;
  formulaBasis: 'Count' | 'Length' | 'Area' | 'Volume';
  formula: string; // teks rumus dari engine — hanya ditampilkan
  formulaEvidence: string[]; // baris bukti expand (blueprint §16.6)
  unit: string;
  qty: string; // string terformat dari engine — UI tidak menghitung
  status: QuantityRowStatus;
  source: string; // ex: 'A2-102: S2.1'
  sourceSheetId: string | null;
  linkedElementIds: string[];
  confidence: number | null;
  ahspCandidate: string | null;
  reviewerNote: string | null;
}

// ── Analysis (blueprint §12–13) ─────────────────────────────────────────────

export type AnalysisScope = 'substructure' | 'superstructure' | 'architecture' | 'mep';
export type DetectionMode = 'fast' | 'balanced' | 'deep';

export interface AnalysisConfig {
  scope: AnalysisScope;
  mode: DetectionMode;
  outputs: {
    classifySheets: boolean;
    detectItems: boolean;
    extractQuantities: boolean;
    buildFloorGrouping: boolean;
  };
  flagLowConfidence: boolean;
  requireReviewerApproval: boolean;
  autoAssignReviewers: boolean;
  confidenceThreshold: number;
}

export interface AnalysisStage {
  id: number;
  label: string; // ex: 'Grid detection'
  status: 'pending' | 'active' | 'done';
}

export interface AnalysisLogEntry {
  time: string; // HH:mm:ss
  message: string;
  status: 'done' | 'active' | 'pending';
}

// ── Review queue / verification notes ───────────────────────────────────────

export interface ReviewQueueItem {
  id: string;
  title: string;
  reason: string;
  severity: 'issue' | 'review' | 'info';
  sheetId: string | null;
  elementId: string | null;
  resolved: boolean;
}

export interface ActivityEntry {
  time: string;
  message: string;
  kind: 'verify' | 'analysis' | 'upload' | 'correction' | 'handoff';
}

export interface AssumptionEntry {
  id: string;
  topic: string;
  assumption: string;
  affects: string;
}

// ── Ask PAAX ─────────────────────────────────────────────────────────────────

export interface AskPaaxMessage {
  role: 'user' | 'assistant';
  text: string;
  refs?: { label: string; sheetId?: string; elementId?: string }[];
}

// ── Util formatting (tampilan murni, bukan perhitungan teknik) ──────────────

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ── Tree Types (dari V1 level-tree-panel) ───────────────────────────────────

export interface DisciplineGroup {
  discipline: string;
  elementTypes: ElementTypeIndexEntry[];
  occurrenceTotal: number;
}

export interface LevelTreeNode {
  levelId: string;
  levelName: string;
  disciplines: DisciplineGroup[];
  totalOccurrences: number;
  confirmedCount: number;
  ambiguousBindingCount: number;
  conflictCount: number;
}

export function buildLevelTree(views: ProjectGraphSummaryView[]): LevelTreeNode[] {
  return views
    .map((view) => {
      const disciplineNames = view.summary.discipline_counts.map((d) => d.discipline);
      const disciplines: DisciplineGroup[] = disciplineNames.length
        ? disciplineNames.map((discipline) => ({
            discipline,
            elementTypes: view.summary.element_type_index,
            occurrenceTotal:
              view.summary.discipline_counts.find((d) => d.discipline === discipline)?.occurrence_count ?? 0,
          }))
        : [
            {
               discipline: 'Tanpa disiplin tercatat',
               elementTypes: view.summary.element_type_index,
               occurrenceTotal: view.summary.element_type_index.reduce((sum, e) => sum + e.occurrence_count, 0),
            },
          ];

      return {
        levelId: view.grain.level_id ?? view.snapshot_id,
        levelName: view.summary.level_name,
        disciplines,
        totalOccurrences: view.summary.element_type_index.reduce((sum, e) => sum + e.occurrence_count, 0),
        confirmedCount: view.quality.confirmed_count,
        ambiguousBindingCount: view.quality.ambiguous_binding_count,
        conflictCount: view.quality.conflict_count,
      };
    })
    .sort((a, b) => a.levelName.localeCompare(b.levelName, 'id-ID'));
}
