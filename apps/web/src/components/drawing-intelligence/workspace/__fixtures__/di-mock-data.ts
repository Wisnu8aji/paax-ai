/**
 * Mock data Drawing Intelligence — proyek "PLHUT Campus – Building A".
 *
 * Data DUMMY yang realistis untuk jalur yang backend-nya belum tersedia
 * (upload, sheet, deteksi elemen, quantity). Semua angka teknik di sini
 * adalah KONSTANTA data (seolah keluaran engine), BUKAN hasil perhitungan
 * frontend (Aturan Emas §1). PLHUT dipakai sebagai fixture, bukan template
 * (aturan owner: pipeline harus generalisasi).
 */

import type {
  AnalysisLogEntry,
  AnalysisStage,
  AssumptionEntry,
  ActivityEntry,
  DetectedElement,
  DrawingFile,
  ElementCategory,
  GridLine,
  QuantityItem,
  QuantityRowStatus,
  ReviewQueueItem,
  RoomShape,
  Sheet,
  SheetGeometry,
} from '../di-types';

// ── Grid & geometri dasar (konsisten untuk denah tipikal) ────────────────────

const GRID_X_SPACING = [3600, 7800, 7800, 7800, 7800, 7800, 3600]; // 8 sumbu 1..8
const GRID_Y_SPACING = [7200, 6000, 2400, 7200]; // 5 sumbu A..E

function cumulative(spacings: number[]): number[] {
  const out = [0];
  for (const s of spacings) out.push(out[out.length - 1] + s);
  return out;
}

const GX = cumulative(GRID_X_SPACING); // total 46200
const GY = cumulative(GRID_Y_SPACING); // total 22800

export const SHEET_WIDTH_MM = GX[GX.length - 1];
export const SHEET_HEIGHT_MM = GY[GY.length - 1];

const gridX: GridLine[] = GX.map((mm, i) => ({ label: String(i + 1), mm }));
const gridY: GridLine[] = GY.map((mm, i) => ({ label: String.fromCharCode(65 + i), mm }));

/** Denah lantai tipikal — susunan ruang mengikuti referensi (office di atas,
 * lift lobby & core di tengah, pantry/breakout di bawah kiri). */
function typicalRooms(floorNo: number): RoomShape[] {
  const suffix = (n: number) => `${floorNo}${String(n).padStart(2, '0')}`;
  return [
    { code: suffix(1), name: 'OFFICE', x: GX[1], y: GY[0], w: GX[2] - GX[1], h: GY[1] - GY[0], zone: 'office' },
    { code: suffix(2), name: 'OFFICE', x: GX[2], y: GY[0], w: GX[3] - GX[2], h: GY[1] - GY[0], zone: 'office' },
    { code: suffix(3), name: 'MEETING', x: GX[3], y: GY[0], w: GX[4] - GX[3], h: GY[1] - GY[0], zone: 'meeting' },
    { code: suffix(4), name: 'CONFERENCE', x: GX[4], y: GY[0], w: GX[5] - GX[4], h: GY[1] - GY[0], zone: 'meeting' },
    { code: suffix(5), name: 'OFFICE', x: GX[5], y: GY[0], w: GX[6] - GX[5], h: GY[1] - GY[0], zone: 'office' },
    { code: suffix(9), name: 'OPEN OFFICE', x: GX[1], y: GY[1], w: GX[3] - GX[1], h: GY[3] - GY[1], zone: 'open' },
    { code: suffix(10), name: 'LIFT LOBBY', x: GX[3], y: GY[1], w: GX[4] - GX[3], h: GY[2] - GY[1], zone: 'circulation' },
    { code: suffix(11), name: 'CORE', x: GX[4], y: GY[1], w: GX[5] - GX[4], h: GY[2] - GY[1], zone: 'service' },
    { code: suffix(12), name: 'CORRIDOR', x: GX[3], y: GY[2], w: GX[6] - GX[3], h: GY[3] - GY[2], zone: 'circulation' },
    { code: suffix(6), name: 'OFFICE', x: GX[5], y: GY[1], w: GX[6] - GX[5], h: GY[2] - GY[1], zone: 'office' },
    { code: suffix(7), name: 'PANTRY', x: GX[1], y: GY[3], w: GX[2] - GX[1], h: GY[4] - GY[3], zone: 'pantry' },
    { code: suffix(8), name: 'BREAKOUT', x: GX[2], y: GY[3], w: GX[3] - GX[2], h: GY[4] - GY[3], zone: 'pantry' },
    { code: suffix(13), name: 'OPEN OFFICE', x: GX[3], y: GY[3], w: GX[5] - GX[3], h: GY[4] - GY[3], zone: 'open' },
    { code: suffix(14), name: 'LOUNGE', x: GX[5], y: GY[3], w: GX[6] - GX[5], h: GY[4] - GY[3], zone: 'office' },
  ];
}

function roofRooms(): RoomShape[] {
  return [
    { code: 'R01', name: 'ROOF DECK', x: GX[1], y: GY[0], w: GX[6] - GX[1], h: GY[4] - GY[0], zone: 'void' },
    { code: 'R02', name: 'LMR', x: GX[3], y: GY[1], w: GX[4] - GX[3], h: GY[2] - GY[1], zone: 'service' },
  ];
}

export function makeGeometry(floorNo: number, isRoof = false): SheetGeometry {
  return {
    widthMm: SHEET_WIDTH_MM,
    heightMm: SHEET_HEIGHT_MM,
    gridX,
    gridY,
    rooms: isRoof ? roofRooms() : typicalRooms(floorNo),
  };
}

// ── File & sheets ────────────────────────────────────────────────────────────

export const MOCK_FILE: DrawingFile = {
  id: 'file-floorplan',
  name: 'Floor Plan.pdf',
  sizeBytes: 24.4 * 1024 * 1024,
  kind: 'PDF',
  status: 'completed',
  sheetCount: 6,
  uploadedAt: '2026-07-16T09:12:00+07:00',
};

interface SheetSeed {
  id: string;
  code: string;
  title: string;
  floorId: string;
  floorLabel: string;
  page: number;
  isRoof?: boolean;
  issues?: number;
}

const SHEET_SEEDS: SheetSeed[] = [
  { id: 'sheet-f00', code: 'A2-100', title: 'Ground Floor Plan', floorId: 'F00', floorLabel: 'Ground Floor', page: 1 },
  { id: 'sheet-f01', code: 'A2-101', title: 'Floor 1 Plan', floorId: 'F01', floorLabel: 'Floor 1', page: 2 },
  { id: 'sheet-f02', code: 'A2-102', title: 'Second Floor Plan', floorId: 'F02', floorLabel: 'Floor 2', page: 3, issues: 4 },
  { id: 'sheet-f03', code: 'A2-103', title: 'Floor 3 Plan', floorId: 'F03', floorLabel: 'Floor 3', page: 4 },
  { id: 'sheet-f04', code: 'A2-104', title: 'Floor 4 Plan', floorId: 'F04', floorLabel: 'Floor 4', page: 5 },
  { id: 'sheet-roof', code: 'A2-105', title: 'Roof Plan', floorId: 'ROOF', floorLabel: 'Roof Plan', page: 6, isRoof: true },
];

export const MOCK_SHEETS: Sheet[] = SHEET_SEEDS.map((s, i) => ({
  id: s.id,
  fileId: MOCK_FILE.id,
  code: s.code,
  title: s.title,
  originalPageName: `Floor Plan.pdf — page ${s.page}`,
  pageNumber: s.page,
  floorId: s.floorId,
  floorLabel: s.floorLabel,
  disciplines: s.isRoof ? ['STR', 'ARC', 'MEP'] : ['STR', 'ARC', 'MEP', 'CIV'],
  drawingType: s.isRoof ? 'Roof Plan' : 'Floor Plan',
  scale: '1:100',
  scaleConfirmed: s.floorId !== 'F03',
  revision: 'R1',
  status: 'analyzed',
  reviewIssueCount: s.issues ?? (i % 2 === 0 ? 1 : 0),
  sheetSize: 'A1 (841 x 594 mm)',
  analyzedOn: 'May 15, 2026 · 10:24 AM',
  aiConfidence: s.floorId === 'F02' ? 92 : 88 + (i % 3) * 2,
  geometry: makeGeometry(i, s.isRoof),
}));

// ── Elemen terdeteksi per sheet ──────────────────────────────────────────────

const COLUMN_ROWS = [0, 1, 4]; // sumbu A, B, E → 24 kolom per lantai

function elementsForSheet(sheet: Sheet): DetectedElement[] {
  if (sheet.floorId === 'ROOF') return roofElements(sheet);
  const out: DetectedElement[] = [];
  const f = sheet.floorId;
  let colIdx = 0;

  // Kolom K1 300×600 pada grid persimpangan (rows A, B, E)
  for (const r of COLUMN_ROWS) {
    for (let c = 0; c < GX.length; c++) {
      colIdx += 1;
      const gridRef = `${gridY[r].label}-${gridX[c].label}`;
      const isB3 = gridRef === 'B-3';
      const verification =
        colIdx % 11 === 0 ? 'needs-review' : colIdx % 3 === 0 ? 'detected' : 'verified';
      out.push({
        id: `${sheet.id}-col-${colIdx}`,
        sheetId: sheet.id,
        code: 'K1',
        aiId: `COL-K1-${String(colIdx).padStart(3, '0')}`,
        category: 'column',
        label: 'RC COLUMN 300x600',
        floorId: f,
        grid: gridRef,
        dimensions: '300 × 600 mm',
        material: "fc' 25 MPa",
        bbox: { x: GX[c] - 300, y: GY[r] - 300, w: 600, h: 600 },
        confidence: isB3 ? 94 : 86 + ((colIdx * 7) % 12),
        verification: isB3 ? 'detected' : verification,
        properties: [
          { label: 'Code', value: 'K1', origin: 'extracted' },
          { label: 'Category', value: 'Column', origin: 'extracted' },
          { label: 'Level', value: sheet.floorLabel, origin: 'extracted' },
          { label: 'Grid', value: gridRef, origin: 'extracted' },
          { label: 'Dimensions', value: '300 x 600 mm', origin: 'extracted' },
          { label: 'Material', value: "fc' 25 MPa", origin: 'inherited' },
          { label: 'Formula basis', value: 'Count (by grid intersection)', origin: 'inferred' },
          { label: 'Elevation', value: '+6.600 m', origin: 'inferred' },
        ],
        sourcePages: [
          { sheetCode: `${sheet.code}: S2.1`, label: 'General Arrangement' },
          { sheetCode: 'S2.6', label: 'Column Schedule' },
          { sheetCode: 'S5.2', label: 'Typical Details' },
        ],
        aiNotes: isB3
          ? ['Dimension differs from column schedule S2.6 (300×600 vs 400×600) — confirm governing document.']
          : [],
      });
    }
  }

  // Balok pada sumbu memanjang (row B & D antar kolom)
  let beamIdx = 0;
  for (const r of [1, 3]) {
    for (let c = 0; c < GX.length - 1; c++) {
      beamIdx += 1;
      out.push({
        id: `${sheet.id}-beam-${beamIdx}`,
        sheetId: sheet.id,
        code: 'B1',
        aiId: `BEAM-B1-${String(beamIdx).padStart(3, '0')}`,
        category: 'beam',
        label: 'RC BEAM 300x600',
        floorId: f,
        grid: `${gridY[r].label}${gridX[c].label}–${gridY[r].label}${gridX[c + 1].label}`,
        dimensions: '300 × 600 mm',
        material: "fc' 25 MPa",
        bbox: { x: GX[c] + 300, y: GY[r] - 150, w: GX[c + 1] - GX[c] - 600, h: 300 },
        confidence: 84 + ((beamIdx * 5) % 14),
        verification: beamIdx % 5 === 0 ? 'needs-review' : 'detected',
        properties: [
          { label: 'Code', value: 'B1', origin: 'extracted' },
          { label: 'Category', value: 'Beam', origin: 'extracted' },
          { label: 'Level', value: sheet.floorLabel, origin: 'extracted' },
          { label: 'Dimensions', value: '300 x 600 mm', origin: 'extracted' },
          { label: 'Material', value: "fc' 25 MPa", origin: 'inherited' },
        ],
        sourcePages: [{ sheetCode: `${sheet.code}: S2.2`, label: 'Framing Plan' }],
        aiNotes: [],
      });
    }
  }

  // Slab per zona besar
  const slabZones = [
    { x: GX[1], y: GY[0], w: GX[6] - GX[1], h: GY[1] - GY[0] },
    { x: GX[1], y: GY[1], w: GX[3] - GX[1], h: GY[4] - GY[1] },
    { x: GX[3], y: GY[1], w: GX[6] - GX[3], h: GY[3] - GY[1] },
    { x: GX[3], y: GY[3], w: GX[6] - GX[3], h: GY[4] - GY[3] },
  ];
  slabZones.forEach((z, i) => {
    out.push({
      id: `${sheet.id}-slab-${i + 1}`,
      sheetId: sheet.id,
      code: 'S1',
      aiId: `SLAB-S1-${String(i + 1).padStart(3, '0')}`,
      category: 'slab',
      label: 'RC SLAB t=150mm',
      floorId: f,
      grid: null,
      dimensions: 't = 150 mm',
      material: "fc' 25 MPa",
      bbox: z,
      confidence: 82 + i * 3,
      verification: i === 2 ? 'needs-review' : 'detected',
      properties: [
        { label: 'Code', value: 'S1', origin: 'extracted' },
        { label: 'Category', value: 'Slab', origin: 'extracted' },
        { label: 'Thickness', value: '150 mm', origin: 'extracted' },
        { label: 'Level', value: sheet.floorLabel, origin: 'extracted' },
      ],
      sourcePages: [{ sheetCode: `${sheet.code}: S2.3`, label: 'Slab Plan' }],
      aiNotes: i === 2 ? ['Slab opening near core not fully bounded — verify slab edge at grid 4–5/C.'] : [],
    });
  });

  // Shear wall core (5 segmen di sekitar core)
  const core = { x: GX[4], y: GY[1], w: GX[5] - GX[4], h: GY[2] - GY[1] };
  const shearSegs = [
    { x: core.x, y: core.y, w: 200, h: core.h },
    { x: core.x + core.w - 200, y: core.y, w: 200, h: core.h },
    { x: core.x, y: core.y, w: core.w, h: 200 },
    { x: core.x, y: core.y + core.h - 200, w: core.w / 2, h: 200 },
    { x: GX[3], y: GY[1], w: 200, h: GY[2] - GY[1] },
  ];
  shearSegs.forEach((z, i) => {
    out.push({
      id: `${sheet.id}-sw-${i + 1}`,
      sheetId: sheet.id,
      code: 'SW1',
      aiId: `SHW-SW1-${String(i + 1).padStart(3, '0')}`,
      category: 'shear-wall',
      label: 'SHEAR WALL t=200mm',
      floorId: f,
      grid: null,
      dimensions: 't = 200 mm',
      material: "fc' 30 MPa",
      bbox: z,
      confidence: 88 + i,
      verification: 'verified',
      properties: [
        { label: 'Code', value: 'SW1', origin: 'extracted' },
        { label: 'Category', value: 'Shear Wall', origin: 'extracted' },
        { label: 'Thickness', value: '200 mm', origin: 'extracted' },
      ],
      sourcePages: [{ sheetCode: `${sheet.code}: S2.4`, label: 'Core Detail' }],
      aiNotes: [],
    });
  });

  // Tangga (2)
  [
    { x: GX[3] + 600, y: GY[1] + 400, w: 2400, h: 4800 },
    { x: GX[4] + 600, y: GY[1] + 400, w: 2400, h: 4800 },
  ].forEach((z, i) => {
    out.push({
      id: `${sheet.id}-stair-${i + 1}`,
      sheetId: sheet.id,
      code: `ST${i + 1}`,
      aiId: `STAIR-ST-${String(i + 1).padStart(3, '0')}`,
      category: 'stair',
      label: 'RC STAIR',
      floorId: f,
      grid: null,
      dimensions: null,
      material: "fc' 25 MPa",
      bbox: z,
      confidence: 90,
      verification: 'verified',
      properties: [
        { label: 'Code', value: `ST${i + 1}`, origin: 'extracted' },
        { label: 'Category', value: 'Stair', origin: 'extracted' },
      ],
      sourcePages: [{ sheetCode: `${sheet.code}: S2.5`, label: 'Stair Detail' }],
      aiNotes: [],
    });
  });

  return out;
}

function roofElements(sheet: Sheet): DetectedElement[] {
  const out: DetectedElement[] = [];
  for (let c = 1; c < GX.length - 1; c++) {
    out.push({
      id: `${sheet.id}-col-${c}`,
      sheetId: sheet.id,
      code: 'K1',
      aiId: `COL-K1-RF${String(c).padStart(2, '0')}`,
      category: 'column',
      label: 'RC COLUMN 300x600',
      floorId: 'ROOF',
      grid: `B-${gridX[c].label}`,
      dimensions: '300 × 600 mm',
      material: "fc' 25 MPa",
      bbox: { x: GX[c] - 300, y: GY[1] - 300, w: 600, h: 600 },
      confidence: 87,
      verification: 'detected',
      properties: [
        { label: 'Code', value: 'K1', origin: 'extracted' },
        { label: 'Category', value: 'Column', origin: 'extracted' },
      ],
      sourcePages: [{ sheetCode: `${sheet.code}: S3.1`, label: 'Roof Framing' }],
      aiNotes: [],
    });
  }
  out.push({
    id: `${sheet.id}-slab-1`,
    sheetId: sheet.id,
    code: 'RS1',
    aiId: 'SLAB-RS1-001',
    category: 'slab',
    label: 'ROOF SLAB t=120mm',
    floorId: 'ROOF',
    grid: null,
    dimensions: 't = 120 mm',
    material: "fc' 25 MPa",
    bbox: { x: GX[1], y: GY[0], w: GX[6] - GX[1], h: GY[4] - GY[0] },
    confidence: 85,
    verification: 'needs-review',
    properties: [
      { label: 'Code', value: 'RS1', origin: 'extracted' },
      { label: 'Thickness', value: '120 mm', origin: 'extracted' },
    ],
    sourcePages: [{ sheetCode: 'A2-105: S3.2', label: 'Roof Slab Plan' }],
    aiNotes: ['Roof drainage slope not detected — quantity assumes flat slab.'],
  });
  return out;
}

export const MOCK_ELEMENTS: DetectedElement[] = MOCK_SHEETS.flatMap((s) => elementsForSheet(s));

/** Ringkasan "Detected Elements" seluruh file (angka pipeline, konstanta). */
export const DETECTED_SUMMARY: { category: ElementCategory; label: string; count: number }[] = [
  { category: 'column', label: 'Columns', count: 72 },
  { category: 'beam', label: 'Beams', count: 38 },
  { category: 'wall', label: 'Walls', count: 24 },
  { category: 'shear-wall', label: 'Shear Walls', count: 5 },
  { category: 'slab', label: 'Slabs', count: 18 },
  { category: 'room', label: 'Rooms', count: 54 },
  { category: 'door', label: 'Doors', count: 89 },
  { category: 'window', label: 'Windows', count: 112 },
];

// ── Quantity items (96 baris — 24 verified, 7 needs review, 65 AI detected) ──

interface QtySeed {
  code: string;
  work: string;
  floorId: string;
  floorLabel: string;
  wbsSection: string;
  wbsGroup: string;
  category: ElementCategory;
  basis: QuantityItem['formulaBasis'];
  unit: string;
  qty: string;
  formula: string;
  evidence: string[];
  source: string;
  sourceSheetId: string | null;
  ahsp: string | null;
}

function seedRow(s: QtySeed, status: QuantityRowStatus, i: number): QuantityItem {
  return {
    id: `qty-${i}`,
    itemCode: s.code,
    workItem: s.work,
    floorId: s.floorId,
    floorLabel: s.floorLabel,
    lbsPath: ['Building A', s.floorLabel],
    wbsSection: s.wbsSection,
    wbsGroup: s.wbsGroup,
    category: s.category,
    formulaBasis: s.basis,
    formula: s.formula,
    formulaEvidence: s.evidence,
    unit: s.unit,
    qty: s.qty,
    status,
    source: s.source,
    sourceSheetId: s.sourceSheetId,
    linkedElementIds: [],
    confidence: status === 'verified' ? 96 : status === 'needs-review' ? 71 : 84,
    ahspCandidate: s.ahsp,
    reviewerNote: null,
  };
}

const FLOOR_DEFS = [
  { id: 'F00', label: 'Ground Floor', group: 'Superstructure / Ground Floor' },
  { id: 'F01', label: 'Floor 1', group: 'Superstructure / Floor 1' },
  { id: 'F02', label: 'Floor 2', group: 'Superstructure / Floor 2' },
  { id: 'F03', label: 'Floor 3', group: 'Superstructure / Floor 3' },
  { id: 'F04', label: 'Floor 4', group: 'Superstructure / Floor 4' },
];

function buildQuantityItems(): QuantityItem[] {
  const seeds: QtySeed[] = [];

  // 1. Substructure / Foundation
  const found = [
    { code: 'STR-FOOT-001', work: 'Footings', basis: 'Count' as const, unit: 'No.', qty: '24', formula: 'Count of isolated footing marks on foundation plan', evidence: ['24 footing marks F1', 'Source: S1-101 Foundation Plan'] },
    { code: 'STR-COL-BG-001', work: 'Columns (Below Grade)', basis: 'Count' as const, unit: 'No.', qty: '18', formula: 'Count of pedestal marks below grade', evidence: ['18 pedestal marks', 'Source: S1-101'] },
    { code: 'STR-PCAP-001', work: 'Pile Caps', basis: 'Count' as const, unit: 'No.', qty: '12', formula: 'Count of pile cap marks PC1–PC3', evidence: ['12 pile cap marks', 'Source: S1-102'] },
    { code: 'STR-GBM-001', work: 'Grade Beams', basis: 'Length' as const, unit: 'm', qty: '124.30', formula: 'Σ centerline length of grade beam runs', evidence: ['Σ(L) = 124.30 m', 'Source: S1-103 Tie Beam Plan'] },
  ];
  for (const f of found) {
    seeds.push({
      ...f,
      floorId: 'F00',
      floorLabel: 'F00 – Found.',
      wbsSection: '03 10 00 – Foundations',
      wbsGroup: 'Substructure / Foundation',
      category: f.work.includes('Beam') ? 'beam' : 'column',
      source: 'S1-101',
      sourceSheetId: null,
      ahsp: 'A.4.1.1 Beton fc\' 25 MPa',
    });
  }

  // 2. Superstructure per lantai (kolom/balok/slab/shear wall/stairs)
  const perFloor = [
    { code: 'COL', work: 'Reinforced Concrete Column', basis: 'Count' as const, unit: 'No.', qty: '24', formula: 'Count of K1 marks at grid intersections', evidence: ['24 instances K1 (300×600)', 'Rows A, B, E × grid 1–8'], category: 'column' as const },
    { code: 'BEAM', work: 'Reinforced Concrete Beam', basis: 'Length' as const, unit: 'm', qty: '482.60', formula: 'Σ centerline length of beam runs B1/B2', evidence: ['Σ(L) = 482.60 m', '14 runs on axes B & D'], category: 'beam' as const },
    { code: 'SLAB', work: 'Reinforced Concrete Slab', basis: 'Area' as const, unit: 'm²', qty: '1,284.30', formula: 'Net slab area = gross area − openings', evidence: ['Gross 1,341.10 m²', 'Openings 56.80 m²', 'Net 1,284.30 m²'], category: 'slab' as const },
    { code: 'SHW', work: 'Shear Wall', basis: 'Area' as const, unit: 'm²', qty: '86.40', formula: 'Σ wall length × storey height', evidence: ['24.0 m core wall × 3.60 m', 'Result 86.40 m²'], category: 'shear-wall' as const },
    { code: 'STAIR', work: 'Staircase', basis: 'Count' as const, unit: 'No.', qty: '2', formula: 'Count of stair flights per storey', evidence: ['2 flights (ST1, ST2)'], category: 'stair' as const },
  ];
  for (const fl of FLOOR_DEFS) {
    for (const p of perFloor) {
      const floorNo = fl.id.slice(1);
      seeds.push({
        code: `STR-${p.code}-${floorNo}-001`,
        work: p.work,
        basis: p.basis,
        unit: p.unit,
        qty: p.qty,
        formula: p.formula,
        evidence: p.evidence,
        category: p.category,
        floorId: fl.id,
        floorLabel: fl.label,
        wbsSection: '03 30 00 – Superstructure',
        wbsGroup: fl.group,
        source: `A2-1${floorNo.slice(1)}${floorNo === '00' ? '0' : ''}: S2.1`,
        sourceSheetId: MOCK_SHEETS.find((s) => s.floorId === fl.id)?.id ?? null,
        ahsp: p.category === 'slab' ? 'A.4.1.7 Plat beton' : 'A.4.1.1 Beton fc\' 25 MPa',
      });
    }
  }

  // 3. Roof structure
  const roof = [
    { code: 'STR-COL-RF-001', work: 'Roof Columns', basis: 'Count' as const, unit: 'No.', qty: '18', formula: 'Count of K1 marks continuing to roof', evidence: ['18 instances'], category: 'column' as const },
    { code: 'STR-BEAM-RF-001', work: 'Roof Beams', basis: 'Length' as const, unit: 'm', qty: '236.10', formula: 'Σ centerline length of roof beams', evidence: ['Σ(L) = 236.10 m'], category: 'beam' as const },
    { code: 'STR-SLAB-RF-001', work: 'Roof Slab', basis: 'Area' as const, unit: 'm²', qty: '1,210.00', formula: 'Roof slab net area', evidence: ['Net 1,210.00 m²'], category: 'slab' as const },
  ];
  for (const r of roof) {
    seeds.push({
      ...r,
      floorId: 'ROOF',
      floorLabel: 'Roof',
      wbsSection: '03 30 00 – Superstructure',
      wbsGroup: 'Roof Structure',
      source: 'A2-105: S3.1',
      sourceSheetId: 'sheet-roof',
      ahsp: 'A.4.1.1 Beton fc\' 25 MPa',
    });
  }

  // 4. Architecture
  const arch = [
    { code: 'ARC-DOOR-001', work: 'Doors', basis: 'Count' as const, unit: 'No.', qty: '38', formula: 'Count of door tags on floor plans', evidence: ['38 door tags D1–D6'], category: 'door' as const, wbs: '08 11 00 – Openings' },
    { code: 'ARC-WIND-001', work: 'Windows', basis: 'Count' as const, unit: 'No.', qty: '54', formula: 'Count of window tags on floor plans', evidence: ['54 window tags W1–W4'], category: 'window' as const, wbs: '08 20 00 – Openings' },
    { code: 'ARC-PART-001', work: 'Partitions', basis: 'Area' as const, unit: 'm²', qty: '1,236.50', formula: 'Σ partition length × height', evidence: ['Σ(L) 343.5 m × 3.60 m'], category: 'wall' as const, wbs: '09 21 00 – Finishes' },
    { code: 'ARC-FLR-001', work: 'Floor Finishes', basis: 'Area' as const, unit: 'm²', qty: '5,420.80', formula: 'Σ room net area per finish schedule', evidence: ['54 rooms mapped to finish schedule'], category: 'room' as const, wbs: '09 60 00 – Finishes' },
    { code: 'ARC-CLG-001', work: 'Ceiling', basis: 'Area' as const, unit: 'm²', qty: '5,180.20', formula: 'Σ room ceiling area', evidence: ['Excludes void & shafts'], category: 'room' as const, wbs: '09 50 00 – Finishes' },
    { code: 'ARC-PNT-001', work: 'Wall Painting', basis: 'Area' as const, unit: 'm²', qty: '8,640.00', formula: 'Σ wall face area × 2 sides − openings', evidence: ['Openings deducted per schedule'], category: 'wall' as const, wbs: '09 90 00 – Finishes' },
  ];
  for (const a of arch) {
    seeds.push({
      code: a.code,
      work: a.work,
      basis: a.basis,
      unit: a.unit,
      qty: a.qty,
      formula: a.formula,
      evidence: a.evidence,
      category: a.category,
      floorId: 'ALL',
      floorLabel: 'All Floors',
      wbsSection: a.wbs,
      wbsGroup: 'Architecture',
      source: 'A2-100…A2-104',
      sourceSheetId: null,
      ahsp: null,
    });
  }

  // 5. MEP
  const mep = [
    { code: 'MEP-LTG-001', work: 'Lighting Points', qty: '112', wbs: '26 50 00 – Electrical' },
    { code: 'MEP-PWR-001', work: 'Power Outlets', qty: '89', wbs: '26 27 00 – Electrical' },
    { code: 'MEP-SMK-001', work: 'Smoke Detectors', qty: '24', wbs: '28 31 00 – Fire Alarm' },
    { code: 'MEP-DIF-001', work: 'Air Diffusers', qty: '64', wbs: '23 37 00 – HVAC' },
    { code: 'MEP-SPK-001', work: 'Sprinkler Heads', qty: '148', wbs: '21 13 00 – Fire Protection' },
    { code: 'MEP-SAN-001', work: 'Sanitary Fixtures', qty: '36', wbs: '22 40 00 – Plumbing' },
  ];
  for (const m of mep) {
    seeds.push({
      code: m.code,
      work: m.work,
      basis: 'Count',
      unit: 'No.',
      qty: m.qty,
      formula: 'Count of symbols on MEP layout plans',
      evidence: [`${m.qty} symbols detected`, 'Source: MEP overlay all floors'],
      category: 'mep-point',
      floorId: 'ALL',
      floorLabel: 'All Floors',
      wbsSection: m.wbs,
      wbsGroup: 'MEP',
      source: 'A2-100…A2-105',
      sourceSheetId: null,
      ahsp: null,
    });
  }

  // 6. Earthworks & external (pelengkap sampai 96 baris, tetap wajar)
  const civil = [
    { code: 'CIV-EXC-001', work: 'Bulk Excavation', basis: 'Volume' as const, unit: 'm³', qty: '2,145.60', formula: 'Cut volume from platform level to formation', evidence: ['Formation −2.40 m dari ±0.00 (FFL L1)'], wbs: '31 23 00 – Earthworks', group: 'Site & Earthworks' },
    { code: 'CIV-FILL-001', work: 'Structural Fill', basis: 'Volume' as const, unit: 'm³', qty: '864.20', formula: 'Fill volume to underside of ground slab', evidence: ['Compacted in 300 mm lifts'], wbs: '31 23 23 – Earthworks', group: 'Site & Earthworks' },
    { code: 'CIV-SOG-001', work: 'Slab on Grade', basis: 'Area' as const, unit: 'm²', qty: '2,052.31', formula: 'Ground slab net area', evidence: ['Net 2,052.31 m²'], wbs: '03 30 00 – Superstructure', group: 'Substructure / Foundation' },
    { code: 'CIV-RET-001', work: 'Retaining Walls', basis: 'Area' as const, unit: 'm²', qty: '1,480.30', formula: 'Σ wall length × retained height', evidence: ['Perimeter basement side'], wbs: '03 30 00 – Superstructure', group: 'Substructure / Foundation' },
  ];
  for (const c of civil) {
    seeds.push({
      code: c.code,
      work: c.work,
      basis: c.basis,
      unit: c.unit,
      qty: c.qty,
      formula: c.formula,
      evidence: c.evidence,
      category: 'slab',
      floorId: 'F00',
      floorLabel: 'F00 – Found.',
      wbsSection: c.wbs,
      wbsGroup: c.group,
      source: 'C1-001',
      sourceSheetId: null,
      ahsp: 'A.2.3.1 Galian tanah',
    });
  }

  // Rincian MEP & bukaan per lantai (agar register mendekati kondisi gedung nyata)
  const perFloorDetail = [
    { code: 'LTG', work: 'Lighting Points', qty: '22', unit: 'No.', wbs: '26 50 00 – Electrical', group: 'MEP', category: 'mep-point' as ElementCategory },
    { code: 'PWR', work: 'Power Outlets', qty: '18', unit: 'No.', wbs: '26 27 00 – Electrical', group: 'MEP', category: 'mep-point' as ElementCategory },
    { code: 'DIF', work: 'Air Diffusers', qty: '13', unit: 'No.', wbs: '23 37 00 – HVAC', group: 'MEP', category: 'mep-point' as ElementCategory },
    { code: 'DOOR', work: 'Doors', qty: '8', unit: 'No.', wbs: '08 11 00 – Openings', group: 'Architecture', category: 'door' as ElementCategory },
    { code: 'WIND', work: 'Windows', qty: '11', unit: 'No.', wbs: '08 20 00 – Openings', group: 'Architecture', category: 'window' as ElementCategory },
  ];
  for (const fl of FLOOR_DEFS) {
    for (const d of perFloorDetail) {
      if (seeds.length >= 92) break;
      seeds.push({
        code: `${d.category === 'mep-point' ? 'MEP' : 'ARC'}-${d.code}-${fl.id.slice(1)}-001`,
        work: `${d.work} — ${fl.label}`,
        basis: 'Count',
        unit: d.unit,
        qty: d.qty,
        formula: 'Count of symbols on layout plan',
        evidence: [`${d.qty} symbols on ${fl.label}`],
        category: d.category,
        floorId: fl.id,
        floorLabel: fl.label,
        wbsSection: d.wbs,
        wbsGroup: `${d.group} / ${fl.label}`,
        source: `A2-1${fl.id.slice(2)}: M1.1`,
        sourceSheetId: MOCK_SHEETS.find((s) => s.floorId === fl.id)?.id ?? null,
        ahsp: null,
      });
    }
  }

  // Lengkapi hingga 96 item dengan detail finish per lantai (wajar utk gedung)
  const finishPerFloor = ['Floor Tile 600×600', 'Skirting', 'Wall Plaster & Skim', 'Ceiling Gypsum'];
  const finishQty = ['1,062.40', '286.20', '1,730.50', '1,018.60'];
  const finishUnit = ['m²', 'm', 'm²', 'm²'];
  outer: for (const fl of FLOOR_DEFS) {
    for (let i = 0; i < finishPerFloor.length; i++) {
      if (seeds.length >= 96) break outer;
      seeds.push({
        code: `ARC-FIN-${fl.id.slice(1)}-${String(i + 1).padStart(2, '0')}`,
        work: `${finishPerFloor[i]} — ${fl.label}`,
        basis: i === 1 ? 'Length' : 'Area',
        unit: finishUnit[i],
        qty: finishQty[i],
        formula: i === 1 ? 'Σ room perimeter per finish schedule' : 'Σ room net area per finish schedule',
        evidence: ['Mapped from room schedule', `Level: ${fl.label}`],
        category: 'room',
        floorId: fl.id,
        floorLabel: fl.label,
        wbsSection: '09 60 00 – Finishes',
        wbsGroup: `Architecture & Finishes / ${fl.label}`,
        source: `A2-1${fl.id.slice(2)}: A5.1`,
        sourceSheetId: MOCK_SHEETS.find((s) => s.floorId === fl.id)?.id ?? null,
        ahsp: null,
      });
    }
  }

  // Pelengkap atap & proteksi (3 item)
  const extras = [
    { code: 'ARC-WPF-RF-001', work: 'Roof Waterproofing Membrane', qty: '1,210.00', unit: 'm²', wbs: '07 50 00 – Thermal & Moisture', basis: 'Area' as const },
    { code: 'ARC-RLG-ST-001', work: 'Stair Railing', qty: '86.40', unit: 'm', wbs: '05 52 00 – Metal Railings', basis: 'Length' as const },
    { code: 'ARC-PRA-RF-001', work: 'Roof Parapet Coping', qty: '138.00', unit: 'm', wbs: '07 60 00 – Flashing & Trim', basis: 'Length' as const },
  ];
  for (const x of extras) {
    if (seeds.length >= 96) break;
    seeds.push({
      code: x.code,
      work: x.work,
      basis: x.basis,
      unit: x.unit,
      qty: x.qty,
      formula: x.basis === 'Area' ? 'Net area from roof plan' : 'Σ run length from plan',
      evidence: ['Source: A2-105 Roof Plan'],
      category: 'room',
      floorId: 'ROOF',
      floorLabel: 'Roof',
      wbsSection: x.wbs,
      wbsGroup: 'Architecture & Finishes / Roof',
      source: 'A2-105: A7.1',
      sourceSheetId: 'sheet-roof',
      ahsp: null,
    });
  }

  // Distribusi status: 24 verified, 7 needs review, 65 ai-detected (ref donut)
  const items: QuantityItem[] = [];
  let verifiedLeft = 24;
  let reviewLeft = 7;
  seeds.slice(0, 96).forEach((s, i) => {
    let status: QuantityRowStatus = 'ai-detected';
    if (reviewLeft > 0 && (s.code.includes('PCAP') || s.code.includes('BEAM') || i % 13 === 5)) {
      status = 'needs-review';
      reviewLeft -= 1;
    } else if (verifiedLeft > 0 && i % 3 !== 1) {
      status = 'verified';
      verifiedLeft -= 1;
    }
    items.push(seedRow(s, status, i + 1));
  });
  return items;
}

export const MOCK_QUANTITY_ITEMS: QuantityItem[] = buildQuantityItems();

// ── Review queue, assumptions, activity ─────────────────────────────────────

export const MOCK_REVIEW_QUEUE: ReviewQueueItem[] = [
  { id: 'rq-1', title: 'K1 at grid B-3 — dimension conflict', reason: 'Plan shows 300×600, column schedule S2.6 shows 400×600.', severity: 'issue', sheetId: 'sheet-f02', elementId: 'sheet-f02-col-11', resolved: false },
  { id: 'rq-2', title: 'Sheet A2-103 — scale not confirmed', reason: 'Title block scale unreadable; quantities on this sheet are flagged.', severity: 'issue', sheetId: 'sheet-f03', elementId: null, resolved: false },
  { id: 'rq-3', title: 'Pile caps — count uncertain', reason: 'Two pile cap marks overlap at grid A-1; count may be 11 or 12.', severity: 'review', sheetId: null, elementId: null, resolved: false },
  { id: 'rq-4', title: 'Beam run B-D/5 — unmatched detail reference', reason: 'Detail bubble 7/S5.3 not found in drawing set.', severity: 'review', sheetId: 'sheet-f02', elementId: 'sheet-f02-beam-5', resolved: false },
  { id: 'rq-5', title: 'Slab opening near core', reason: 'Slab edge at grid 4–5/C not fully bounded.', severity: 'review', sheetId: 'sheet-f02', elementId: 'sheet-f02-slab-3', resolved: false },
  { id: 'rq-6', title: 'Roof slab drainage slope', reason: 'Slope arrows not detected; volume assumes flat slab.', severity: 'review', sheetId: 'sheet-roof', elementId: 'sheet-roof-slab-1', resolved: false },
  { id: 'rq-7', title: 'Floor naming inconsistency', reason: '"2nd Floor" vs "Floor 2" used across title blocks.', severity: 'review', sheetId: null, elementId: null, resolved: false },
];

export const MOCK_ASSUMPTIONS: AssumptionEntry[] = [
  { id: 'as-1', topic: 'Storey height', assumption: 'Typical storey height 3.60 m dari FFL ke FFL (peil ±0.00 = FFL Lantai 1).', affects: 'Column & wall quantities' },
  { id: 'as-2', topic: 'Concrete cover', assumption: 'Cover 40 mm for columns/beams, 20 mm slabs (per general notes).', affects: 'Reinforcement estimates' },
  { id: 'as-3', topic: 'Openings', assumption: 'Openings < 0.5 m² not deducted from slab/wall areas.', affects: 'Slab & wall areas' },
  { id: 'as-4', topic: 'Waste factor', assumption: 'No waste factor applied at drawing stage; applied later in Cost & Quantity.', affects: 'All quantities' },
];

export const MOCK_ACTIVITY: ActivityEntry[] = [
  { time: '10:24 AM', message: 'Verification completed — May 15, 2026', kind: 'verify' },
  { time: '10:20 AM', message: 'Quantities validated', kind: 'analysis' },
  { time: '10:18 AM', message: 'Cross-sheet checks passed', kind: 'analysis' },
  { time: '10:12 AM', message: 'Analysis completed on 6 sheets', kind: 'analysis' },
  { time: '09:58 AM', message: 'Floor Plan.pdf uploaded (6 sheets)', kind: 'upload' },
];

// ── Analysis stages & log (blueprint §13 / referensi gambar 7) ──────────────

export const ANALYSIS_STAGES: AnalysisStage[] = [
  { id: 1, label: 'Uploading', status: 'pending' },
  { id: 2, label: 'Sheet classification', status: 'pending' },
  { id: 3, label: 'Grid detection', status: 'pending' },
  { id: 4, label: 'Element recognition', status: 'pending' },
  { id: 5, label: 'Quantity extraction', status: 'pending' },
  { id: 6, label: 'Verification packaging', status: 'pending' },
];

export const ANALYSIS_LOG_SCRIPT: Omit<AnalysisLogEntry, 'status'>[] = [
  { time: '10:25:43', message: 'File upload complete' },
  { time: '10:25:46', message: 'Sheet classified as Structural – Floor Plan' },
  { time: '10:25:49', message: 'Detecting drawing scale and orientation' },
  { time: '10:25:50', message: 'Reading structural grids on Floor 2…' },
  { time: '10:25:51', message: 'Detecting columns, beams, slabs, and walls' },
  { time: '10:25:52', message: 'Extracting quantities and measurements' },
  { time: '10:25:52', message: 'Preparing verification package' },
];

export const MODEL_STACK = [
  { name: 'PDF Parser', version: 'v1.4.2' },
  { name: 'Grid Detector', version: 'v2.1.0' },
  { name: 'Element Recognizer', version: 'v3.0.1' },
  { name: 'Quantity Extractor', version: 'v2.5.0' },
  { name: 'Verification Engine', version: 'v1.8.3' },
];
